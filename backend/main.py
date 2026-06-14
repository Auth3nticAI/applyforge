from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import json
import os
import anthropic

from database import Base, engine, get_db
import models
import schemas
import ai
import seed
from services import job_feed, resume_text

app = FastAPI(title="ApplyForge API")

# Allowed browser origins. Defaults to local dev; in production set
# ALLOWED_ORIGINS to your deployed frontend URL(s), comma-separated.
_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(anthropic.AnthropicError)
def handle_anthropic_error(request: Request, exc: anthropic.AnthropicError) -> JSONResponse:
    """Turn Claude API failures into a clean 502 that keeps its CORS headers."""
    return JSONResponse(status_code=502, content={"detail": f"AI request failed: {exc}"})


@app.on_event("startup")
def startup() -> None:
    # Resilient: a transient DB race on cold start (or a test env with no Postgres)
    # must not crash the app. Tables + demo seed are best-effort here.
    try:
        Base.metadata.create_all(bind=engine)
        seed.seed_if_empty()
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] DB init deferred: {exc}")


# ---------- helpers ----------

def _get_profile_or_404(db: Session) -> models.Profile:
    profile = db.query(models.Profile).order_by(models.Profile.id).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile yet. Create one first.")
    return profile


def _profile_dict(p: models.Profile) -> dict:
    return {
        "full_name": p.full_name, "email": p.email, "headline": p.headline,
        "skills": p.skills or [], "years_experience": p.years_experience,
        "resume_text": p.resume_text or "",
    }


def _job_dict(j: models.Job) -> dict:
    return {"title": j.title, "company": j.company, "description": j.description}


def _keyword_match(skills: list[str], description: str) -> int:
    """Cheap, deterministic pre-score (0-100): fraction of profile skills present in the JD."""
    if not skills:
        return 0
    desc = (description or "").lower()
    hits = sum(1 for s in skills if s.lower() in desc)
    return round(100 * hits / len(skills))


# ================= Profile =================

@app.get("/profile", response_model=schemas.ProfileOut)
def get_profile(db: Session = Depends(get_db)) -> models.Profile:
    return _get_profile_or_404(db)


@app.put("/profile", response_model=schemas.ProfileOut)
def upsert_profile(body: schemas.ProfileUpdate, db: Session = Depends(get_db)) -> models.Profile:
    profile = db.query(models.Profile).order_by(models.Profile.id).first()
    data = body.model_dump()
    data["links"] = [l for l in data.get("links", [])]  # list[dict]
    if profile is None:
        profile = models.Profile(**data)
        db.add(profile)
    else:
        for k, v in data.items():
            setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return profile


@app.post("/profile/import", response_model=schemas.ProfileOut)
async def import_profile(file: UploadFile = File(...), db: Session = Depends(get_db)) -> models.Profile:
    """Upload a PDF/DOCX/TXT resume -> extract text -> AI structures it -> save the profile."""
    raw = await file.read()
    text = resume_text.extract_text(file.filename or "resume.txt", raw)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not read any text from that file.")
    extracted = ai.extract_profile(text)  # ExtractedProfile

    profile = db.query(models.Profile).order_by(models.Profile.id).first()
    payload = dict(
        full_name=extracted.full_name or "Unnamed",
        email=extracted.email or "",
        location=extracted.location,
        headline=extracted.headline,
        links=[l.model_dump() for l in extracted.links],
        resume_text=extracted.resume_text,
        skills=extracted.skills,
        years_experience=extracted.years_experience,
    )
    if profile is None:
        profile = models.Profile(**payload)
        db.add(profile)
    else:
        for k, v in payload.items():
            setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return profile


# ================= Jobs =================

@app.get("/jobs", response_model=list[schemas.JobListItem])
def list_jobs(db: Session = Depends(get_db)) -> list[schemas.JobListItem]:
    profile = db.query(models.Profile).order_by(models.Profile.id).first()
    skills = (profile.skills if profile else []) or []
    tracked_ids = {a.job_id for a in db.query(models.Application.job_id).all()}
    jobs = db.query(models.Job).order_by(models.Job.fetched_at.desc()).all()
    items = []
    for j in jobs:
        items.append(schemas.JobListItem(
            id=j.id, source_ats=j.source_ats, company=j.company, title=j.title,
            location=j.location, remote=j.remote, apply_url=j.apply_url,
            keyword_match=_keyword_match(skills, j.description),
            tracked=j.id in tracked_ids,
        ))
    items.sort(key=lambda x: x.keyword_match or 0, reverse=True)
    return items


@app.get("/jobs/{job_id}", response_model=schemas.JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)) -> models.Job:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/jobs", response_model=schemas.JobOut, status_code=201)
def create_job(body: schemas.JobCreate, db: Session = Depends(get_db)) -> models.Job:
    """Paste-a-JD path for jobs not in the feed."""
    job = models.Job(source_ats="manual", **body.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@app.post("/jobs/sync", response_model=schemas.JobSyncResult)
def sync_jobs(db: Session = Depends(get_db)) -> schemas.JobSyncResult:
    """Pull live SWE jobs from the public ATS feeds and upsert them."""
    fetched = job_feed.fetch_all()
    added = 0
    sources = set()
    for jd in fetched:
        sources.add(jd["source_ats"])
        exists = db.query(models.Job).filter(
            models.Job.source_ats == jd["source_ats"],
            models.Job.external_id == jd["external_id"],
        ).first()
        if exists:
            continue
        db.add(models.Job(**jd))
        added += 1
    db.commit()
    return schemas.JobSyncResult(fetched=len(fetched), added=added, sources=sorted(sources))


# ================= Applications (CRUD + pipeline) =================

def _app_list_item(a: models.Application) -> schemas.ApplicationListItem:
    return schemas.ApplicationListItem(
        id=a.id, status=a.status, match_score=a.match_score,
        company=a.job.company, title=a.job.title, location=a.job.location,
        updated_at=a.updated_at,
    )


@app.get("/applications", response_model=list[schemas.ApplicationListItem])
def list_applications(db: Session = Depends(get_db)) -> list[schemas.ApplicationListItem]:
    apps = db.query(models.Application).order_by(models.Application.updated_at.desc()).all()
    return [_app_list_item(a) for a in apps]


@app.post("/applications", response_model=schemas.ApplicationDetail, status_code=201)
def create_application(body: schemas.ApplicationCreate, db: Session = Depends(get_db)) -> models.Application:
    profile = _get_profile_or_404(db)
    job = db.query(models.Job).filter(models.Job.id == body.job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    existing = db.query(models.Application).filter(
        models.Application.profile_id == profile.id,
        models.Application.job_id == job.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already tracking this job.")
    app_row = models.Application(profile_id=profile.id, job_id=job.id, status=models.AppStatus.SAVED)
    db.add(app_row)
    db.flush()
    db.add(models.ApplicationEvent(application_id=app_row.id, from_status=None,
                                   to_status=models.AppStatus.SAVED, note="Tracked"))
    db.commit()
    db.refresh(app_row)
    return app_row


@app.get("/applications/{app_id}", response_model=schemas.ApplicationDetail)
def get_application(app_id: int, db: Session = Depends(get_db)) -> models.Application:
    a = db.query(models.Application).filter(models.Application.id == app_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return a


@app.patch("/applications/{app_id}/status", response_model=schemas.ApplicationDetail)
def update_status(app_id: int, body: schemas.StatusUpdate, db: Session = Depends(get_db)) -> models.Application:
    a = db.query(models.Application).filter(models.Application.id == app_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")

    new = body.status
    if a.status in models.TERMINAL_STATUSES:
        raise HTTPException(status_code=400, detail=f"{a.status.value} is terminal.")
    # Allow: REJECTED from anywhere, or exactly one step forward.
    if new != models.AppStatus.REJECTED:
        order = models.APP_STATUS_ORDER
        try:
            if order.index(new) != order.index(a.status) + 1:
                raise HTTPException(status_code=400, detail="Can only advance one step at a time.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status transition.")
    prev = a.status
    a.status = new
    db.add(models.ApplicationEvent(application_id=a.id, from_status=prev, to_status=new, note=body.note))
    db.commit()
    db.refresh(a)
    return a


@app.delete("/applications/{app_id}")
def delete_application(app_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    a = db.query(models.Application).filter(models.Application.id == app_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(a)
    db.commit()
    return {"message": "deleted"}


# ================= AI on an application =================

@app.post("/applications/{app_id}/analyze", response_model=schemas.MatchReport)
def analyze_application(app_id: int, db: Session = Depends(get_db)) -> schemas.MatchReport:
    a = db.query(models.Application).filter(models.Application.id == app_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    report = ai.analyze_match(_profile_dict(a.profile), _job_dict(a.job))
    a.match_score = float(report.match_score)
    db.add(models.GeneratedArtifact(
        application_id=a.id, kind=models.ArtifactKind.MATCH_REPORT,
        content=report.model_dump_json(), model=ai.MODEL_REASON,
    ))
    db.commit()
    return report


@app.post("/applications/{app_id}/cover-letter", response_model=schemas.CoverLetterResponse)
def cover_letter(app_id: int, db: Session = Depends(get_db)) -> schemas.CoverLetterResponse:
    a = db.query(models.Application).filter(models.Application.id == app_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    text = ai.write_cover_letter(_profile_dict(a.profile), _job_dict(a.job))
    art = models.GeneratedArtifact(
        application_id=a.id, kind=models.ArtifactKind.COVER_LETTER, content=text, model=ai.MODEL_REASON,
    )
    db.add(art)
    db.commit()
    db.refresh(art)
    return schemas.CoverLetterResponse(artifact_id=art.id, content=text)


@app.post("/applications/{app_id}/tailor", response_model=schemas.TailorResponse)
def tailor(app_id: int, db: Session = Depends(get_db)) -> schemas.TailorResponse:
    a = db.query(models.Application).filter(models.Application.id == app_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Application not found")
    bullets = ai.tailor_resume(_profile_dict(a.profile), _job_dict(a.job))
    art = models.GeneratedArtifact(
        application_id=a.id, kind=models.ArtifactKind.TAILORED_RESUME,
        content=json.dumps([b.model_dump() for b in bullets]), model=ai.MODEL_REASON,
    )
    db.add(art)
    db.commit()
    db.refresh(art)
    return schemas.TailorResponse(artifact_id=art.id, bullets=bullets)


# ================= Recruiters + outreach =================

@app.get("/recruiters", response_model=list[schemas.RecruiterOut])
def list_recruiters(db: Session = Depends(get_db)) -> list[models.Recruiter]:
    return db.query(models.Recruiter).order_by(models.Recruiter.full_name).all()


@app.post("/outreach/generate", response_model=schemas.OutreachOut, status_code=201)
def generate_outreach(body: schemas.OutreachGenerateRequest, db: Session = Depends(get_db)) -> models.Outreach:
    profile = _get_profile_or_404(db)
    recruiter = db.query(models.Recruiter).filter(models.Recruiter.id == body.recruiter_id).first()
    if recruiter is None:
        raise HTTPException(status_code=404, detail="Recruiter not found")
    job = None
    if body.job_id:
        job = db.query(models.Job).filter(models.Job.id == body.job_id).first()
    result = ai.write_outreach(
        _profile_dict(profile),
        {"full_name": recruiter.full_name, "title": recruiter.title, "firm": recruiter.firm,
         "specialties": recruiter.specialties},
        _job_dict(job) if job else None,
    )
    row = models.Outreach(
        profile_id=profile.id, recruiter_id=recruiter.id, job_id=body.job_id,
        subject=result.get("subject", "Quick hello"), body=result.get("body", ""),
        status=models.OutreachStatus.DRAFT,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/outreach", response_model=list[schemas.OutreachOut])
def list_outreach(db: Session = Depends(get_db)) -> list[models.Outreach]:
    return db.query(models.Outreach).order_by(models.Outreach.created_at.desc()).all()


# ================= Copilot agent =================

@app.post("/ai/chat", response_model=schemas.ChatResponse)
def copilot(body: schemas.ChatRequest, db: Session = Depends(get_db)) -> schemas.ChatResponse:
    def get_applications():
        apps = db.query(models.Application).all()
        return [{"id": a.id, "company": a.job.company, "title": a.job.title,
                 "status": a.status.value, "match_score": a.match_score} for a in apps]

    def get_application_detail(application_id: int):
        a = db.query(models.Application).filter(models.Application.id == application_id).first()
        if a is None:
            return {"error": "not found"}
        report = next((art.content for art in a.artifacts
                       if art.kind == models.ArtifactKind.MATCH_REPORT), None)
        return {"id": a.id, "company": a.job.company, "title": a.job.title,
                "status": a.status.value, "match_score": a.match_score,
                "job_description": a.job.description[:4000],
                "match_report": json.loads(report) if report else None}

    def get_profile():
        p = db.query(models.Profile).order_by(models.Profile.id).first()
        if p is None:
            return {"error": "no profile"}
        return {"full_name": p.full_name, "headline": p.headline, "skills": p.skills,
                "years_experience": p.years_experience, "resume_text": p.resume_text[:4000]}

    tool_impls = {
        "get_applications": get_applications,
        "get_application_detail": get_application_detail,
        "get_profile": get_profile,
    }
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    result = ai.copilot_chat(msgs, tool_impls)
    return schemas.ChatResponse(**result)


# ================= Dashboard stats =================

@app.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    by_status = dict(
        db.query(models.Application.status, func.count(models.Application.id))
        .group_by(models.Application.status).all()
    )
    avg_match = db.query(func.avg(models.Application.match_score)).scalar()
    return {
        "applications": db.query(models.Application).count(),
        "by_status": {s.value: by_status.get(s, 0) for s in models.AppStatus},
        "avg_match": round(avg_match, 1) if avg_match is not None else None,
        "jobs": db.query(models.Job).count(),
        "outreach": db.query(models.Outreach).count(),
    }
