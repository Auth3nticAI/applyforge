# ApplyForge — Architecture & Code Map

A guide to **what every file does** and how a request flows through the system. Read this
alongside the code to understand the project quickly.

---

## 1. Big picture

Three containers, wired by `docker-compose.yml`:

```
Browser (localhost:3000)                 ← you
   │  HTTP (fetch)
   ▼
Next.js frontend  (frontend/, port 3000) ← React UI, one typed fetch layer
   │  HTTP/JSON
   ▼
FastAPI backend   (backend/, port 8000)  ← routes, business logic, all Claude calls
   │  SQLAlchemy ORM
   ▼
PostgreSQL 16     (db, port 5432)        ← persistent data (Docker volume `pgdata`)
```

The backend is the only thing that talks to the Claude API (the API key never reaches the
browser). The frontend never talks to Postgres directly.

---

## 2. Backend — `backend/` (FastAPI + SQLAlchemy)

| File | Responsibility |
|------|----------------|
| `main.py` | The FastAPI app and **every route handler**. CORS, the startup hook (creates tables + auto-seeds an empty DB), and all ~20 endpoints (Profile, Jobs, Applications CRUD + pipeline, the 5 AI routes, Recruiters/Outreach, the copilot chat, and `/stats`). Each handler is thin: validate → call models/AI → return a Pydantic schema. |
| `models.py` | **SQLAlchemy ORM models** = the database tables. `Profile`, `Job`, `Application`, `GeneratedArtifact`, `ApplicationEvent`, `Recruiter`, `Outreach`, plus the `AppStatus` pipeline enum and its forward-only ordering. |
| `schemas.py` | **Pydantic models** = the request/response shapes (the API contract). Separate from ORM models so the API surface is explicit and validated. |
| `ai.py` | **Every Claude API call.** Six functions (see §5). Holds the lazy Anthropic client, the cost-routing model constants, the `TRUTHFUL_GUARDRAIL` system prompt, JSON parsing helpers, and the copilot tool-use loop. |
| `database.py` | SQLAlchemy engine, `SessionLocal`, and the `get_db()` dependency injected into every route. |
| `seed.py` | Demo data. `seed_if_empty()` runs on startup (populates only an empty DB, so restarts keep real data); `python seed.py` does a full destructive reset. |
| `services/job_feed.py` | Fetches **real** SWE jobs from free public ATS APIs (Greenhouse / Lever / Ashby). Best-effort per company; normalizes to `Job` rows. |
| `services/resume_text.py` | Extracts plain text from an uploaded PDF/DOCX/TXT resume (then `ai.extract_profile` structures it). |
| `tests/test_api.py` | 14 pytest smoke tests covering CRUD, pipeline transitions, and the AI routes (Claude calls are mocked — no key needed). |
| `Dockerfile` | Single-stage `python:3.12-slim` image; installs `requirements.txt`, runs `uvicorn`. |

### Request flow example — "Analyze my match for this job"
1. Browser → `POST /applications/5/analyze` (via `frontend/app/lib/api.ts → analyzeApplication`).
2. `main.py:analyze_application` loads the `Application` (and its `Profile` + `Job`) from Postgres.
3. Calls `ai.analyze_match(profile, job)` → Claude Sonnet returns structured JSON.
4. Handler writes `match_score` onto the application and saves a `GeneratedArtifact(MATCH_REPORT)`.
5. Returns a `MatchReport` schema → the page renders the score, keywords, strengths, and gaps.

---

## 3. Frontend — `frontend/` (Next.js 14 App Router)

Every page is a client component (`"use client"`) and calls the backend through one typed layer.

| File | Page / role |
|------|-------------|
| `app/layout.tsx` | Root layout — the shared top nav + footer wrapping all pages. |
| `app/lib/api.ts` | **The single fetch layer.** All TypeScript types + one function per backend endpoint. Pages never call `fetch()` directly. |
| `app/page.tsx` | **Dashboard** — `/stats` + `/applications` → stat cards and the 5-stage pipeline board. |
| `app/profile/page.tsx` | **Profile** — upload a resume (→ AI extraction) and edit the master profile (CRUD). |
| `app/jobs/page.tsx` | **Jobs** — the live ATS feed (`/jobs`, `/jobs/sync`), paste-a-JD, and "Track" (creates an Application). |
| `app/applications/[id]/page.tsx` | **Application detail** — the AI hub: match analysis, cover letter, resume tailor, status transitions, and the event timeline. |
| `app/recruiters/page.tsx` | **Recruiters** — list + AI outreach generation + history. |
| `app/copilot/page.tsx` | **Copilot** — multi-turn chat with the tool-using AI agent. |
| `Dockerfile` | Multi-stage `node:20-alpine` build → standalone Next.js server. |

---

## 4. Data model

```
Profile (1) ──< Application (many) >── Job (many)
                    ├──< GeneratedArtifact   (match reports, cover letters, tailored resumes)
                    └──< ApplicationEvent     (append-only pipeline audit log)
Profile (1) ──< Outreach (many) >── Recruiter (many)
```

`Application` is the core CRUD resource. Its pipeline (`AppStatus`) advances
`SAVED → APPLIED → INTERVIEWING → OFFER` (forward-only, one step at a time, validated in
`main.py:update_status`), with `REJECTED` as a terminal branch.

---

## 5. The AI layer (`backend/ai.py`) — 6 Claude functions

| Function | Model | Technique | Used by |
|----------|-------|-----------|---------|
| `extract_profile` | Haiku 4.5 | Structured extraction | `POST /profile/import` |
| `analyze_match` ⭐ | Sonnet 4.6 | Structured output (JSON) | `POST /applications/{id}/analyze` |
| `write_cover_letter` | Sonnet 4.6 | Generation (truthful) | `POST /applications/{id}/cover-letter` |
| `tailor_resume` | Sonnet 4.6 | Generation, structured | `POST /applications/{id}/tailor` |
| `write_outreach` | Haiku 4.5 | Generation (personalized) | `POST /outreach/generate` |
| `copilot_chat` | Sonnet 4.6 | **Tool use / agent loop** | `POST /ai/chat` |

- **Context injection:** every function receives the user's profile (and the relevant job /
  recruiter / pipeline) and embeds it in the prompt — the AI only knows what the app gives it.
- **Truthfulness:** `TRUTHFUL_GUARDRAIL` is injected into every generation call so the model
  reframes only real experience and never fabricates; `tailor_resume` returns a per-bullet
  `grounded` flag.
- **The agent loop:** `copilot_chat` exposes 3 tools (`get_applications`,
  `get_application_detail`, `get_profile`). Claude decides which to call; `main.py` executes
  them against Postgres and feeds results back until Claude produces a final answer.

---

## 6. How Docker ties it together

`docker compose up --build`:
1. Pulls `postgres:16-alpine`, starts it, waits for its **healthcheck**.
2. Builds + starts the **backend**; on startup it creates tables and `seed_if_empty()` loads
   demo data into a fresh DB (a restart with data intact does nothing).
3. Builds + starts the **frontend** (`NEXT_PUBLIC_API_URL` is baked in at build time).

Data lives in the `pgdata` volume, so it **persists across restarts**. Secrets live in
`backend/.env` (gitignored, and `.dockerignore`'d out of the image).

> Note: `frontend/Dockerfile` installs with `npm install` against the public npm registry
> (not `npm ci`) because the committed lockfile pins a private registry that isn't reachable
> from the build container.
