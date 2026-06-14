"""Demo data for ApplyForge.

Two entry points:
- `seed_if_empty()` is called on app startup — populates ONLY if the DB has no profile,
  so a fresh `docker compose up` opens full while a restart keeps real data (persistence).
- `python seed.py` does a full destructive reset + repopulate (dev convenience).
"""
import json
from datetime import datetime, timedelta

from database import Base, engine, SessionLocal
import models


def reset() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


PROFILE = dict(
    full_name="Alex Rivera",
    email="alex.rivera.dev@gmail.com",
    phone="(206) 555-0182",
    location="Seattle, WA",
    headline="Backend Software Engineer — 3 yrs Python/Go, distributed systems",
    links=[
        {"label": "GitHub", "url": "https://github.com/alexrivera"},
        {"label": "LinkedIn", "url": "https://linkedin.com/in/alexrivera-dev"},
    ],
    skills=["Python", "Go", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes",
            "AWS", "REST APIs", "gRPC", "CI/CD", "SQL"],
    years_experience=3,
    resume_text=(
        "ALEX RIVERA — Backend Software Engineer (Seattle, WA)\n\n"
        "EXPERIENCE\n"
        "Software Engineer II, Cloudpeak Logistics (2022–present)\n"
        "- Built and operated payment-reconciliation microservices in Python (FastAPI) and Go "
        "handling ~2M transactions/day; cut reconciliation latency from 40 min to under 5.\n"
        "- Designed a Postgres + Redis caching layer that reduced p99 API latency by 38%.\n"
        "- Led migration of 12 services to Kubernetes on AWS EKS; added CI/CD with GitHub Actions.\n"
        "- Mentored 2 junior engineers; owned on-call rotation for the billing domain.\n\n"
        "Software Engineer, Brightline Apps (2021–2022)\n"
        "- Shipped REST and gRPC APIs for a B2B scheduling product (Python, PostgreSQL).\n"
        "- Wrote integration test suites that raised coverage from 41% to 86%.\n\n"
        "EDUCATION\n"
        "B.S. Computer Science, University of Washington (2021)\n\n"
        "SKILLS\n"
        "Python, Go, FastAPI, PostgreSQL, Redis, Docker, Kubernetes, AWS, gRPC, CI/CD"
    ),
)

JOBS = [
    dict(source_ats="greenhouse", external_id="seed-1", company="Stripe",
         title="Backend Engineer, Payments", location="Remote (US)", remote=True,
         apply_url="https://stripe.com/jobs",
         description=("Build reliable payment APIs at scale. You'll work in Go and Python on "
                      "high-throughput services backed by PostgreSQL. We value experience with "
                      "distributed systems, idempotency, gRPC, and operating services on Kubernetes/AWS. "
                      "3+ years backend experience required.")),
    dict(source_ats="greenhouse", external_id="seed-2", company="Databricks",
         title="Software Engineer, Backend Platform", location="Seattle, WA", remote=False,
         apply_url="https://databricks.com/careers",
         description=("Join the platform team building APIs and data services in Scala and Python. "
                      "Strong SQL and PostgreSQL skills, REST API design, and CI/CD experience expected. "
                      "Kubernetes and AWS a plus. We need engineers comfortable with large-scale distributed systems.")),
    dict(source_ats="lever", external_id="seed-3", company="Plaid",
         title="Backend Engineer, Infrastructure", location="Remote (US)", remote=True,
         apply_url="https://plaid.com/careers",
         description=("Own core infrastructure: service reliability, observability, and developer tooling. "
                      "We use Go, Kubernetes, AWS, and Redis. You should be comfortable with on-call, "
                      "CI/CD pipelines, and gRPC. 2+ years experience operating production services.")),
    dict(source_ats="ashby", external_id="seed-4", company="Ramp",
         title="Full Stack Engineer", location="New York, NY", remote=False,
         apply_url="https://ramp.com/careers",
         description=("Ship product end-to-end with TypeScript/React on the front and Python/Node on the back. "
                      "PostgreSQL, REST APIs, and a bias for shipping. Front-end heavy role; some backend. "
                      "React and modern TypeScript required.")),
    dict(source_ats="greenhouse", external_id="seed-5", company="Discord",
         title="Senior Backend Engineer, Real-Time", location="San Francisco, CA", remote=False,
         apply_url="https://discord.com/careers",
         description=("Design real-time messaging infrastructure for hundreds of millions of users. "
                      "Deep experience with Elixir or Rust, distributed systems, and low-latency networking. "
                      "5+ years experience. Strong systems fundamentals required.")),
    dict(source_ats="lever", external_id="seed-6", company="Brightwave",
         title="Backend Engineer, APIs", location="Remote (US)", remote=True,
         apply_url="https://example.com/brightwave",
         description=("Build and scale REST and gRPC APIs in Python (FastAPI) and Go. PostgreSQL, Redis, "
                      "Docker, and AWS in our stack. You'll own services from design through on-call. "
                      "3+ years backend experience; Kubernetes a plus.")),
]

RECRUITERS = [
    dict(full_name="Dana Chen", firm="TEKsystems", title="Technical Recruiter",
         specialties=["backend", "python", "contract"], email="dana.chen@example.com",
         linkedin_url="https://linkedin.com/in/danachen"),
    dict(full_name="Marcus Hill", firm="Insight Global", title="Senior Recruiter",
         specialties=["infrastructure", "devops", "kubernetes"], email="marcus.hill@example.com",
         linkedin_url="https://linkedin.com/in/marcushill"),
    dict(full_name="Priya Nair", firm="Robert Half Technology", title="Staffing Manager",
         specialties=["full stack", "python", "contract-to-hire"], email="priya.nair@example.com",
         linkedin_url="https://linkedin.com/in/priyanair"),
    dict(full_name="Sam Okafor", firm="CyberCoders", title="Executive Recruiter",
         specialties=["backend", "go", "distributed systems"], email="sam.okafor@example.com",
         linkedin_url="https://linkedin.com/in/samokafor"),
    dict(full_name="Lena Park", firm="Apex Systems", title="Technical Recruiter",
         specialties=["cloud", "aws", "platform"], email="lena.park@example.com",
         linkedin_url="https://linkedin.com/in/lenapark"),
    dict(full_name="Tom Becker", firm="Eliassen Group", title="Recruiting Lead",
         specialties=["backend", "fintech", "contract"], email="tom.becker@example.com",
         linkedin_url="https://linkedin.com/in/tombecker"),
]

# Demo pipeline: (job index, status, match_score)
PIPELINE = [
    (0, models.AppStatus.INTERVIEWING, 84.0),
    (5, models.AppStatus.APPLIED, 88.0),
    (2, models.AppStatus.APPLIED, 79.0),
    (1, models.AppStatus.SAVED, 72.0),
    (4, models.AppStatus.REJECTED, 41.0),
]


def populate(db) -> None:
    """Insert all demo data into an existing (empty) session. Does not drop or close."""
    profile = models.Profile(**PROFILE)
    db.add(profile)

    jobs = [models.Job(**j) for j in JOBS]
    db.add_all(jobs)
    db.add_all([models.Recruiter(**r) for r in RECRUITERS])
    db.flush()  # assign ids

    now = datetime.utcnow()
    for i, (job_idx, status, score) in enumerate(PIPELINE):
        app_row = models.Application(
            profile_id=profile.id, job_id=jobs[job_idx].id,
            status=status, match_score=score,
            created_at=now - timedelta(days=len(PIPELINE) - i),
        )
        db.add(app_row)
        db.flush()
        db.add(models.ApplicationEvent(application_id=app_row.id, from_status=None,
                                       to_status=models.AppStatus.SAVED, note="Tracked"))
        if status != models.AppStatus.SAVED:
            db.add(models.ApplicationEvent(application_id=app_row.id,
                                           from_status=models.AppStatus.SAVED,
                                           to_status=status, note="Seed transition"))
        # A match report for the in-progress ones so the detail page opens full.
        if score >= 70:
            report = {
                "match_score": int(score),
                "verdict": "Solid — worth applying" if score < 85 else "Strong match — apply",
                "matched_keywords": ["Python", "PostgreSQL", "REST APIs", "Docker", "AWS"],
                "missing_keywords": ["gRPC"] if score < 85 else [],
                "strengths": ["3 yrs backend in Python/Go", "Operated services on Kubernetes/AWS"],
                "gaps": ["Limited gRPC depth"] if score < 85 else ["None major"],
                "summary": "Strong backend alignment with the role's core stack.",
            }
            db.add(models.GeneratedArtifact(
                application_id=app_row.id, kind=models.ArtifactKind.MATCH_REPORT,
                content=json.dumps(report), model="claude-sonnet-4-6",
            ))
    db.commit()


def seed_if_empty() -> None:
    """Populate demo data only when there is no profile yet (idempotent, non-destructive)."""
    db = SessionLocal()
    try:
        if db.query(models.Profile).first() is not None:
            return
        populate(db)
        print("Auto-seeded empty database with demo data.")
    finally:
        db.close()


def main() -> None:
    """Destructive: drop everything and repopulate."""
    reset()
    db = SessionLocal()
    try:
        populate(db)
        print("Seeded: 1 profile, %d jobs, %d recruiters, %d applications."
              % (len(JOBS), len(RECRUITERS), len(PIPELINE)))
    finally:
        db.close()


if __name__ == "__main__":
    main()
