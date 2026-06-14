# ApplyForge — Capstone Submission

**Student:** Tray Branch · **Course:** CSE 552 — Fullstack Software Development in the Age of AI Agents · **June 2026**

> An honest AI job-search copilot. Next.js + FastAPI + PostgreSQL + the Claude API, containerized with Docker Compose.
> Screenshots are in `screenshots/`; the slide deck is `ApplyForge_Capstone_Submission.pptx`.

---

## 1. What I built (the problem, the user, the solution)

**The user** is a software engineer job-hunting and drowning in applications. **The problem:** tools like
RoboApply/ApplyBlast auto-blast hundreds of applications — recruiters ignore the spam and it violates job-site
terms. My research surfaced that the popular "an AI robot rejects 75% of resumes" claim is a *myth* (it traces to a
defunct 2012 vendor); the real levers are honest tailoring, timing, and **direct recruiter contact.**

**The solution — ApplyForge** tells you your *real* match for a role, tailors your resume using only what's actually
true about you, drafts truthful cover letters and recruiter outreach, tracks every application through a pipeline,
and gives you an AI copilot that reasons across your whole search. The honesty is the product — and it's enforced in
the AI prompts themselves.

---

## 2. Architecture

```
Browser (:3000)  ──HTTP──▶  FastAPI (:8000)  ──SQLAlchemy──▶  PostgreSQL 16 (:5432, Docker volume)
   Next.js 14                Pydantic + Claude API                 applyforge DB
```

- Every Claude call is isolated in `backend/ai.py`; every fetch in `frontend/app/lib/api.ts`.
- Job feed in `services/job_feed.py`; resume file parsing in `services/resume_text.py`.
- Cost-routed models: **Claude Sonnet 4.6** for reasoning (match analysis, agent), **Haiku 4.5** for transforms (extraction, outreach).
- `docker compose up --build` → db (healthcheck) → backend (auto-seeds if empty) → frontend.

---

## 3. Data model (7 models — well past the 2-model minimum)

```
Profile (1) ──< Application (many) >── Job (many)
                    ├──< GeneratedArtifact   (match reports, cover letters, tailored resumes)
                    └──< ApplicationEvent     (pipeline audit log)
Profile (1) ──< Outreach (many) >── Recruiter (many)
```

**Application** is the core CRUD resource (create = track a job, read, update = advance/reject, delete). Pipeline
state machine: `SAVED → APPLIED → INTERVIEWING → OFFER`, with `REJECTED` terminal — forward-only, validated server-side.

---

## 4. The AI integration — 6 Claude endpoints (all inject the user's data)

| Endpoint | Technique | Context injected |
|---|---|---|
| `POST /profile/import` | Structured extraction | uploaded resume text (PDF/DOCX) |
| `POST /applications/{id}/analyze` ⭐ | Structured output (JSON) | profile + job description |
| `POST /applications/{id}/cover-letter` | Generation (truthful) | profile + job |
| `POST /applications/{id}/tailor` | Generation, structured | resume bullets + job |
| `POST /outreach/generate` | Generation (personalized) | profile + recruiter + job |
| `POST /ai/chat` | Tool use / agent (multi-turn) | whole pipeline via 3 tools |

Satisfies "at least one of structured output / tool use / multi-turn" three times over. The copilot is a real agent
loop: Claude calls `get_applications` / `get_application_detail` / `get_profile`, the backend runs them against
Postgres, and the loop continues until Claude can answer — grounded in live data, never guessed.

**Honesty enforced in code:** a shared `TRUTHFUL_GUARDRAIL` system prompt is injected into every generation call,
and the resume tailor returns a per-bullet `grounded` flag.

---

## 5. Screenshots (in `screenshots/`)

| File | Page | Shows |
|---|---|---|
| `01-dashboard.png` | Dashboard | Stat cards + 5-stage pipeline board with AI match badges |
| `02-profile.png` | Profile | Resume upload → AI extraction + editable profile (CRUD) |
| `03-jobs.png` | Jobs | Real openings from Greenhouse/Lever/Ashby public APIs, ranked |
| `04-application-detail.png` | Application detail | **Match analysis (84%, keywords, gaps) + AI cover letter + timeline** |
| `05-recruiters.png` | Recruiters | AI-generated personalized outreach + history |
| `06-copilot.png` | Copilot | Tool-using AI agent chat over the user's pipeline |

---

## 6. Minimum requirements — all met

**Frontend (Next.js):** ✓ 6 pages w/ shared nav (need 4+) · ✓ full CRUD UI for Applications · ✓ AI features with
working UI · ✓ loading & error states · ✓ responsive · ✓ Dockerfile (multi-stage, builds)

**Backend (FastAPI):** ✓ ~20 endpoints (need 6+) · ✓ 7 models with relationships (need 2+) · ✓ 6 AI endpoints
(need 2+) · ✓ CORS configured · ✓ Dockerfile (builds)

**Database:** ✓ PostgreSQL 16 via SQLAlchemy · ✓ persists across restarts (pgdata Docker volume)

**Deployment:** ✓ `docker-compose.yml` wires all 3 services · ✓ starts with `docker compose up --build` ·
✓ `.env` excluded (`.dockerignore` strips it from images; not committed)

**AI:** ✓ Claude API (`claude-sonnet-4-6` + `claude-haiku-4-5`) · ✓ AI has user data via context injection ·
✓ structured output **and** tool use **and** multi-turn

---

## 7. Grading rubric — where each point is earned

| Criteria | Pts | Evidence |
|---|---|---|
| Core CRUD works in production | 15 | Applications track/advance/reject/delete + Profile edit, live via docker compose |
| AI feature meaningful & uses app data | 20 | 6 Claude endpoints inject profile+job+pipeline |
| All major flows work without errors | 10 | Smoke-tested live; **14 backend tests pass**; AI verified end-to-end |
| Frontend: Next.js, multi-page, responsive | 10 | 6 pages, shared nav, Tailwind, loading/error states |
| Backend: FastAPI, 2+ models, organized | 10 | 7 models, ~20 endpoints, ai.py/services/routes separation |
| Database: Postgres, persists | 5 | PostgreSQL 16 + SQLAlchemy, pgdata volume, seed-if-empty |
| AI: Claude integrated thoughtfully | 10 | Sonnet+Haiku routing, structured output, tool-use agent, truthful guardrail |
| Docker: Dockerfiles + compose, clean start | 5 | 3 services, healthcheck gate, `docker compose up --build` |
| **Presentation (15)** | | Live demo via docker compose + this deck; 5-min script in `DEMO.md` |

---

## 8. What I'd do next

- A Chrome extension mapping my profile onto a job form's fields via a `/autofill/map` Claude endpoint — the *safe*
  version of auto-apply (review-and-submit; your data, your click).
- Real recruiter data via a licensed API (Apollo / People Data Labs) with consent + opt-out handling.
- Multi-user auth + streaming AI responses.

---

## 9. How to run

1. Put your key in `backend/.env`: `ANTHROPIC_API_KEY=sk-ant-...`
2. From the project root: `docker compose up --build`
3. Open **http://localhost:3000** (API docs at **http://localhost:8000/docs**)

Auto-seeds a full demo on first run; data persists across restarts. Reset: `docker compose exec backend python seed.py`.
Backend tests: `docker run --rm -v "<path>\backend:/app" -w /app applyforge-backend:latest python -m pytest`.
