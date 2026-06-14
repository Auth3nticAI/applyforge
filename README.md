# ApplyForge — an honest job-search copilot

ApplyForge helps a software engineer run a smarter, more honest job search. Upload your
resume once; ApplyForge pulls **real openings** from public ATS job feeds, scores how well
you *truly* match each one (and what you're missing), tailors your resume and cover letter
using **only what's actually true about you**, helps you reach real recruiters with
personalized notes, and tracks every application through a pipeline — with an AI copilot
that can reason across your whole search.

> CSE 552 capstone. Built on Next.js + FastAPI + PostgreSQL + the Claude API, containerized
> with Docker Compose. Reverse-engineered from RoboApply / ApplyBlast but deliberately
> **not** an auto-apply bot — see "Positioning" below.

---

## Positioning — why "honest"

The popular "75% of resumes are auto-rejected by an ATS robot" claim traces to a defunct
2012 vendor, not a real study. Recruiter research shows the real levers are tailoring,
timing, and **direct human contact**. So ApplyForge doesn't sell "beat the robot." It tells
you your real shot, tailors truthfully (never fabricating experience), and helps you reach a
human. That integrity stance is the product — and it's enforced in the AI prompts themselves.

---

## Features

| Feature | Endpoint | What it does |
|---|---|---|
| Master profile | `GET/PUT /profile` | Your source-of-truth resume + skills |
| **Resume import (AI)** | `POST /profile/import` | Upload PDF/DOCX/TXT → Claude extracts a structured profile |
| Real job feed | `POST /jobs/sync`, `GET /jobs` | Pulls live SWE jobs from Greenhouse/Lever/Ashby public APIs |
| Track + pipeline | `POST /applications`, `PATCH /applications/{id}/status` | SAVED → APPLIED → INTERVIEWING → OFFER (or REJECTED) |
| **Match analysis (AI)** ⭐ | `POST /applications/{id}/analyze` | Honest match score + matched/missing keywords + gaps (structured JSON) |
| **Cover letter (AI)** | `POST /applications/{id}/cover-letter` | Tailored, truthful 3-paragraph letter |
| **Resume tailoring (AI)** | `POST /applications/{id}/tailor` | Rewrites bullets for the role — grounded only in your profile |
| **Recruiter outreach (AI)** | `POST /outreach/generate` | Personalized, truthful note to a (seeded) recruiter |
| **Copilot agent (AI)** | `POST /ai/chat` | Tool-using chat that reads your pipeline to answer questions |

Six AI endpoints in total, all isolated in `backend/ai.py`. Reasoning-heavy calls use
Claude Sonnet 4.6; text transforms use Haiku 4.5.

---

## Data model

```
Profile (1) ─┬─< Application (many) >─── Job (many)
             │        ├──< GeneratedArtifact (many)   (match reports, cover letters, tailored resumes)
             │        └──< ApplicationEvent (many)    (pipeline audit log)
             └─< Outreach (many) >─── Recruiter (many)
```

---

## Quick start (Docker — the graded path)

**Prereqs:** Docker Desktop running, and an [Anthropic API key](https://console.anthropic.com).

1. Put your key in `backend/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
2. From the project root:
   ```bash
   docker compose up --build
   ```
   Compose starts Postgres, waits for its healthcheck, then the backend (which auto-seeds a
   full demo on first run), then the frontend.
3. Open **http://localhost:3000**. API docs at **http://localhost:8000/docs**.

The database persists across restarts via a Docker volume; the demo seed runs only when the
DB is empty, so your real data is never wiped on restart.

### Local dev (optional)

`./run.sh db | backend | frontend` runs each tier locally (see `run.sh`). The backend
prompts for your key if it isn't set.

---

## Demo data

On first run the DB is seeded with one profile ("Alex Rivera", backend SWE), six SWE jobs,
six recruiters, and a populated five-stage pipeline (with match reports) so the dashboard and
detail pages open full — no clicking required before the AI features can be shown.

To reset to a clean seeded state: `docker compose exec backend python seed.py`.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind |
| Backend | FastAPI, Pydantic v2, SQLAlchemy |
| Database | PostgreSQL 16 |
| AI | Anthropic Claude API (Sonnet 4.6 + Haiku 4.5) |
| Infra | Docker Compose (db + backend + frontend) |

## Testing

```bash
cd backend && pytest        # API smoke tests; all Claude calls are mocked (no key needed)
```
