# ApplyForge — 5-Minute Demo Script

> Run from `docker compose up --build` (not dev mode). Have **http://localhost:3000** open
> and your `ANTHROPIC_API_KEY` already in `backend/.env`. The DB auto-seeds, so the dashboard
> is full on load — no setup clicking needed.

---

## 1. What you built (30 sec)

> "ApplyForge is an *honest* job-search copilot. Most tools in this space are auto-apply bots
> that blast hundreds of applications — recruiters ignore them, and they violate site terms.
> I built the opposite: a tool that tells you your *real* match for a role, tailors your
> resume using only what's actually true about you, and helps you reach a real human. The
> insight from my research: the 'an AI robot rejects 75% of resumes' claim is a myth — the
> real lever in a job search is honest tailoring and direct recruiter contact."

## 2. Live demo (3 min) — the path

1. **Dashboard** (`/`) — "Here's my pipeline: applications across five stages, average match
   score, outreach sent. All seeded so you can see a real working state."
2. **Profile** (`/profile`) — "I uploaded my resume as a PDF; Claude extracted my skills,
   experience, and a headline into a structured profile. This is the source of truth
   everything else is grounded in." *(Show the skills + resume text.)*
3. **Jobs** (`/jobs`) — "These are **real** openings — ApplyForge pulls them live from
   Greenhouse, Lever, and Ashby's public APIs. Click **Sync live jobs** to fetch more.
   They're ranked by a quick keyword match against my profile. Let me **Track** one."
4. **Application detail** (`/applications/[id]`) — the centerpiece:
   - **Match analysis** → "Claude scores my real fit: 84, 'Solid — worth applying',
     here are the keywords I match, and — honestly — the ones I'm *missing*. That gap list
     is the part a generic chatbot won't give you straight."
   - **Cover letter** → "Tailored to this JD, grounded only in my actual experience."
   - **Tailor resume** → "Rewrites my bullets for this role. Notice the ✓ — every bullet is
     grounded in my profile. It will *not* invent experience. That's the integrity guarantee."
   - Advance the status one stage to show the **pipeline + audit log**.
5. **Recruiters** (`/recruiters`) — "Seeded niche recruiters. Generate outreach → Claude
   writes a 50–125 word personalized note referencing a real accomplishment and their niche,
   with an opt-out courtesy. Sending is simulated — I'm not spamming anyone."
6. **Copilot** (`/copilot`) — "An AI agent with tools that read my whole pipeline. Ask it
   *'which roles am I weakest for?'* — it calls `get_applications`, reads my match scores, and
   answers from my real data." *(Show the `used: get_applications` badge.)*

## 3. Technical highlight (1 min)

Pick ONE and go deep:

- **The copilot is a real tool-use agent.** `backend/ai.py:copilot_chat` runs a loop: Claude
  decides to call `get_applications` / `get_application_detail` / `get_profile`; the backend
  executes those against Postgres and feeds results back until Claude answers. It's grounded
  in live data, not guessing.
- **OR the truthful-tailoring guardrail.** A shared `TRUTHFUL_GUARDRAIL` system prompt is
  injected into every generation call; the tailor endpoint even returns a `grounded` flag per
  bullet. Integrity is enforced at the prompt layer, not just claimed.
- **OR the architecture.** Every Claude call isolated in `ai.py`; every fetch in `lib/api.ts`;
  three containers wired by Compose with a Postgres healthcheck gate; cost-routed models
  (Sonnet for reasoning, Haiku for transforms).

## 4. What's next (30 sec)

> "Two weeks more: a Chrome extension that uses my `/autofill/map` endpoint — Claude maps my
> profile onto a job form's fields so I review-and-submit in one click (the safe version of
> auto-apply). And real recruiter data via a licensed API like Apollo, with proper consent and
> opt-out handling."

---

## Rubric cross-check (say these if asked)

- **CRUD**: Applications (create/read/update-status/delete) + Profile.
- **2+ models w/ relationship**: Profile→Application→Job, plus Recruiter→Outreach, Artifacts, Events.
- **2+ AI endpoints**: six — extraction, match analysis, cover letter, tailor, outreach, agent.
- **AI uses app data**: every call injects the user's profile + job/pipeline as context.
- **Tool use / structured output / multi-turn**: copilot (tools), match report (structured JSON), chat (multi-turn).
- **Postgres persists**: Docker volume `pgdata`; seed only runs when empty.
- **Docker**: `docker compose up --build` → db + backend + frontend.

## If something fails live
- AI button errors → check `ANTHROPIC_API_KEY` in `backend/.env`, then `docker compose restart backend`.
- "Sync live jobs" returns 0 → the seeded jobs are already there; the demo doesn't depend on the network.
- Reset to clean state → `docker compose exec backend python seed.py`.
