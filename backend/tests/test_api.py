"""Smoke tests for the ApplyForge API. All Claude calls are mocked — no network, no key."""
from unittest.mock import patch
from fastapi.testclient import TestClient

import models
import schemas

PROFILE = {
    "full_name": "Test Dev",
    "email": "test@dev.com",
    "skills": ["Python", "FastAPI", "PostgreSQL"],
    "resume_text": "Built APIs in Python and FastAPI backed by PostgreSQL.",
    "years_experience": 3,
}
JOB = {
    "company": "Acme",
    "title": "Backend Engineer",
    "location": "Remote",
    "remote": True,
    "description": "Python and FastAPI and PostgreSQL backend role.",
    "apply_url": "https://acme.example/job",
}


def _make_profile(client: TestClient) -> dict:
    return client.put("/profile", json=PROFILE).json()


def _make_job(client: TestClient) -> dict:
    return client.post("/jobs", json=JOB).json()


def _track(client: TestClient) -> dict:
    _make_profile(client)
    job = _make_job(client)
    return client.post("/applications", json={"job_id": job["id"]}).json()


# ---------- Profile ----------

def test_profile_404_when_empty(client: TestClient) -> None:
    assert client.get("/profile").status_code == 404


def test_profile_upsert_and_get(client: TestClient) -> None:
    created = client.put("/profile", json=PROFILE)
    assert created.status_code == 200
    assert created.json()["full_name"] == "Test Dev"
    got = client.get("/profile").json()
    assert got["skills"] == ["Python", "FastAPI", "PostgreSQL"]


# ---------- Jobs + tracking ----------

def test_create_job_and_list(client: TestClient) -> None:
    _make_profile(client)
    job = _make_job(client)
    assert job["source_ats"] == "manual"
    listing = client.get("/jobs").json()
    assert len(listing) == 1
    # keyword_match should be 100 — all three profile skills appear in the JD
    assert listing[0]["keyword_match"] == 100
    assert listing[0]["tracked"] is False


def test_track_job_creates_application(client: TestClient) -> None:
    app_row = _track(client)
    assert app_row["status"] == "SAVED"
    assert app_row["job"]["company"] == "Acme"
    # now flagged tracked in the job feed
    assert client.get("/jobs").json()[0]["tracked"] is True


def test_duplicate_track_returns_409(client: TestClient) -> None:
    _make_profile(client)
    job = _make_job(client)
    client.post("/applications", json={"job_id": job["id"]})
    dup = client.post("/applications", json={"job_id": job["id"]})
    assert dup.status_code == 409


# ---------- Pipeline transitions ----------

def test_advance_one_step_ok(client: TestClient) -> None:
    app_row = _track(client)
    res = client.patch(f"/applications/{app_row['id']}/status", json={"status": "APPLIED"})
    assert res.status_code == 200
    assert res.json()["status"] == "APPLIED"


def test_cannot_skip_stage(client: TestClient) -> None:
    app_row = _track(client)
    res = client.patch(f"/applications/{app_row['id']}/status", json={"status": "OFFER"})
    assert res.status_code == 400


def test_reject_from_anywhere(client: TestClient) -> None:
    app_row = _track(client)
    res = client.patch(f"/applications/{app_row['id']}/status", json={"status": "REJECTED"})
    assert res.status_code == 200
    assert res.json()["status"] == "REJECTED"


# ---------- AI endpoints (mocked) ----------

def test_analyze_writes_match_score(client: TestClient) -> None:
    app_row = _track(client)
    report = schemas.MatchReport(
        match_score=82, verdict="Solid — worth applying",
        matched_keywords=["Python"], missing_keywords=["Go"],
        strengths=["Strong backend"], gaps=["No Go"], summary="Good fit.",
    )
    with patch("main.ai.analyze_match", return_value=report):
        res = client.post(f"/applications/{app_row['id']}/analyze")
    assert res.status_code == 200
    assert res.json()["match_score"] == 82
    # persisted on the application
    assert client.get(f"/applications/{app_row['id']}").json()["match_score"] == 82.0


def test_cover_letter_persists_artifact(client: TestClient) -> None:
    app_row = _track(client)
    with patch("main.ai.write_cover_letter", return_value="Dear Acme team, ..."):
        res = client.post(f"/applications/{app_row['id']}/cover-letter")
    assert res.status_code == 200
    assert "Dear Acme" in res.json()["content"]
    arts = client.get(f"/applications/{app_row['id']}").json()["artifacts"]
    assert any(a["kind"] == "COVER_LETTER" for a in arts)


def test_tailor_returns_bullets(client: TestClient) -> None:
    app_row = _track(client)
    bullets = [schemas.TailoredBullet(original=None, rewritten="Did X with Python.", grounded=True)]
    with patch("main.ai.tailor_resume", return_value=bullets):
        res = client.post(f"/applications/{app_row['id']}/tailor")
    assert res.status_code == 200
    assert res.json()["bullets"][0]["grounded"] is True


# ---------- Recruiters + outreach (mocked) ----------

def test_outreach_generate(client: TestClient, db_session) -> None:
    _make_profile(client)
    rec = models.Recruiter(full_name="Dana Chen", firm="TEKsystems",
                           specialties=["backend", "python"])
    db_session.add(rec)
    db_session.commit()
    db_session.refresh(rec)

    fake = {"subject": "Backend SWE — open to chat", "body": "Hi Dana, ... happy to be removed."}
    with patch("main.ai.write_outreach", return_value=fake):
        res = client.post("/outreach/generate", json={"recruiter_id": rec.id})
    assert res.status_code == 201
    assert res.json()["status"] == "DRAFT"
    assert "Backend SWE" in res.json()["subject"]


# ---------- Copilot (mocked) ----------

def test_chat(client: TestClient) -> None:
    with patch("main.ai.copilot_chat", return_value={"reply": "You have 0 apps.", "tools_used": ["get_applications"]}):
        res = client.post("/ai/chat", json={"messages": [{"role": "user", "content": "status?"}]})
    assert res.status_code == 200
    assert res.json()["tools_used"] == ["get_applications"]


# ---------- Stats ----------

def test_stats_shape(client: TestClient) -> None:
    _track(client)
    stats = client.get("/stats").json()
    assert stats["applications"] == 1
    assert stats["by_status"]["SAVED"] == 1
    assert "avg_match" in stats
