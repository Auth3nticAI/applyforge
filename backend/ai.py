"""Every Claude API call in ApplyForge lives here — isolated from the routes (main.py).

Cost routing: reasoning-heavy calls (match analysis, copilot agent) use Sonnet 4.6;
text transforms (extraction, outreach) use Haiku 4.5.

Integrity: TRUTHFUL_GUARDRAIL is injected into every *generation* prompt so the model
reframes only what's actually in the profile and never fabricates experience.
"""
import anthropic
import json
import re

from schemas import (
    MatchReport, ExtractedProfile, TailoredBullet, Link,
)

_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    """Lazily construct the Anthropic client so the backend boots even with no API key set
    (CRUD, job feed, and the rest of the app work; only AI calls need the key)."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


MODEL_REASON = "claude-sonnet-4-6"          # match analysis, copilot agent
MODEL_FAST = "claude-haiku-4-5-20251001"    # extraction, outreach

TRUTHFUL_GUARDRAIL = (
    "INTEGRITY RULES (non-negotiable): Use ONLY facts present in the candidate's profile. "
    "You may reframe, reorder, and emphasize real experience to fit the role, but you must "
    "NEVER invent employers, titles, dates, metrics, skills, or accomplishments the profile "
    "does not contain. If the role needs something the candidate lacks, do not paper over it — "
    "leave it out. Honesty is the product."
)


def _parse_json(text: str) -> dict:
    """Strip markdown code fences if present, then parse JSON."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text.strip())


def _profile_block(profile: dict) -> str:
    """Render a profile dict into a compact text block for prompts."""
    skills = ", ".join(profile.get("skills") or [])
    return (
        f"Name: {profile.get('full_name')}\n"
        f"Headline: {profile.get('headline') or ''}\n"
        f"Years of experience: {profile.get('years_experience') or 'unspecified'}\n"
        f"Skills: {skills}\n"
        f"Resume:\n{profile.get('resume_text') or ''}"
    )


# ---------- #1 Structured extraction (Haiku) ----------

def extract_profile(resume_text: str) -> ExtractedProfile:
    """Parse raw resume text (from an uploaded PDF/DOCX) into a structured profile."""
    response = client().messages.create(
        model=MODEL_FAST,
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": f"""Extract a structured candidate profile from this resume text.

RESUME TEXT:
{resume_text}

Return ONLY a JSON object with this exact structure:
{{
  "full_name": "...",
  "email": "...",
  "phone": "... or null",
  "location": "... or null",
  "headline": "one-line professional summary you infer (e.g. 'Backend SWE, 3 yrs Python/Go')",
  "links": [{{"label": "GitHub", "url": "..."}}],
  "skills": ["python", "fastapi", "..."],
  "years_experience": <integer or null>
}}

Only include skills/links actually present in the text. Return only the JSON, no other text."""
        }],
    )
    data = _parse_json(response.content[0].text)
    return ExtractedProfile(
        full_name=data.get("full_name") or "",
        email=data.get("email") or "",
        phone=data.get("phone"),
        location=data.get("location"),
        headline=data.get("headline"),
        links=[Link(**l) for l in data.get("links", []) if l.get("url")],
        skills=data.get("skills", []),
        years_experience=data.get("years_experience"),
        resume_text=resume_text,
    )


# ---------- #2 Match score + gap analysis (Sonnet) — HERO ----------

def analyze_match(profile: dict, job: dict) -> MatchReport:
    """Honest match score + keyword gap analysis: profile vs. a job description."""
    response = client().messages.create(
        model=MODEL_REASON,
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": f"""You are an honest technical recruiter scoring how well a software
engineer matches a specific role. Be realistic and specific — do not inflate the score.

CANDIDATE PROFILE:
{_profile_block(profile)}

JOB: {job.get('title')} at {job.get('company')}
JOB DESCRIPTION:
{job.get('description')}

Score against these weighted dimensions:
- Hard requirements met (must-have languages/years/degree) — heaviest weight
- Core skills overlap (frameworks, tools, domains in the JD)
- Seniority fit (years + scope vs. what the role asks)
- Keyword coverage (literal ATS terms present vs. absent)

Return ONLY a JSON object:
{{
  "match_score": <integer 0-100>,
  "verdict": "<one of: 'Strong match — apply', 'Solid — worth applying', 'Reach — close key gaps first', 'Stretch'>",
  "matched_keywords": ["..."],
  "missing_keywords": ["..."],
  "strengths": ["2-4 concrete reasons this candidate fits"],
  "gaps": ["2-4 honest, specific gaps to address"],
  "summary": "2-3 sentence honest assessment"
}}

Return only the JSON, no other text."""
        }],
    )
    data = _parse_json(response.content[0].text)
    return MatchReport(**data)


# ---------- #3 Cover letter (Sonnet, truthful) ----------

def write_cover_letter(profile: dict, job: dict) -> str:
    response = client().messages.create(
        model=MODEL_REASON,
        max_tokens=1200,
        system=TRUTHFUL_GUARDRAIL,
        messages=[{
            "role": "user",
            "content": f"""Write a tailored 3-paragraph cover letter for this candidate and role.
Specific, warm, no clichés or filler. ~250 words. Plain text (no markdown headers).

CANDIDATE PROFILE:
{_profile_block(profile)}

JOB: {job.get('title')} at {job.get('company')}
JOB DESCRIPTION:
{job.get('description')}

Return only the letter text."""
        }],
    )
    return response.content[0].text.strip()


# ---------- #4 Resume tailoring (Sonnet, truthful, structured) ----------

def tailor_resume(profile: dict, job: dict) -> list[TailoredBullet]:
    response = client().messages.create(
        model=MODEL_REASON,
        max_tokens=1500,
        system=TRUTHFUL_GUARDRAIL,
        messages=[{
            "role": "user",
            "content": f"""Rewrite this candidate's resume into 5-7 strong, ATS-aligned bullet
points targeted at the role below. Each bullet: action verb + what + quantified result when
the profile provides one. Align wording with the JD's real keywords — but only for skills the
candidate actually has.

CANDIDATE PROFILE:
{_profile_block(profile)}

JOB: {job.get('title')} at {job.get('company')}
JOB DESCRIPTION:
{job.get('description')}

Return ONLY a JSON object:
{{
  "bullets": [
    {{"original": "closest source line from the resume, or null", "rewritten": "...", "grounded": true}}
  ]
}}

Set "grounded" to false ONLY if a bullet relies on anything not in the profile (you should
avoid producing such bullets). Return only the JSON, no other text."""
        }],
    )
    data = _parse_json(response.content[0].text)
    return [TailoredBullet(**b) for b in data["bullets"]]


# ---------- #5 Recruiter outreach (Haiku, truthful, personalized) ----------

def write_outreach(profile: dict, recruiter: dict, job: dict | None) -> dict:
    job_line = ""
    if job:
        job_line = f"\nThe candidate is interested in the {job.get('title')} role at {job.get('company')}."
    specialties = ", ".join(recruiter.get("specialties") or [])
    response = client().messages.create(
        model=MODEL_FAST,
        max_tokens=600,
        system=TRUTHFUL_GUARDRAIL,
        messages=[{
            "role": "user",
            "content": f"""Write a short, genuine outreach note from a job-seeker to a recruiter.
50-125 words. Reference the recruiter's niche and ONE real, specific accomplishment from the
candidate's profile. Clear, direct ask. Warm but not fawning. End with a one-line opt-out
courtesy ("happy to be removed if this isn't relevant").

CANDIDATE PROFILE:
{_profile_block(profile)}

RECRUITER: {recruiter.get('full_name')}, {recruiter.get('title') or 'Recruiter'} at {recruiter.get('firm')}
Recruiter specialties: {specialties}{job_line}

Return ONLY a JSON object: {{"subject": "...", "body": "..."}}. Return only the JSON."""
        }],
    )
    return _parse_json(response.content[0].text)


# ---------- #6 Copilot agent (Sonnet, tool use) ----------

CHAT_TOOLS = [
    {
        "name": "get_applications",
        "description": "List all of the user's tracked job applications with company, title, status, and match score.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_application_detail",
        "description": "Get full detail for one application by its id, including the job description and any AI match report.",
        "input_schema": {
            "type": "object",
            "properties": {"application_id": {"type": "integer"}},
            "required": ["application_id"],
        },
    },
    {
        "name": "get_profile",
        "description": "Get the user's master profile: skills, years of experience, headline, and resume text.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]

COPILOT_SYSTEM = (
    "You are ApplyForge Copilot, an honest job-search assistant. You help the user reason about "
    "their pipeline, pick where to focus, and draft outreach/follow-ups. Use the tools to ground "
    "every answer in the user's real data — never guess about their applications. Be concise and "
    "specific. " + TRUTHFUL_GUARDRAIL
)


def copilot_chat(messages: list[dict], tool_impls: dict) -> dict:
    """Multi-turn agent loop. `tool_impls` maps tool name -> callable(**input) -> JSON-able.
    Returns {"reply": str, "tools_used": [str]}."""
    convo = list(messages)
    tools_used: list[str] = []

    for _ in range(6):  # cap tool-use rounds
        response = client().messages.create(
            model=MODEL_REASON,
            max_tokens=1200,
            system=COPILOT_SYSTEM,
            tools=CHAT_TOOLS,
            messages=convo,
        )

        if response.stop_reason == "tool_use":
            convo.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tools_used.append(block.name)
                    impl = tool_impls.get(block.name)
                    try:
                        result = impl(**block.input) if impl else {"error": "unknown tool"}
                    except Exception as exc:  # surface tool errors to the model, don't crash
                        result = {"error": str(exc)}
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
            convo.append({"role": "user", "content": tool_results})
            continue

        # Final text answer
        text = "".join(b.text for b in response.content if b.type == "text")
        return {"reply": text.strip(), "tools_used": tools_used}

    return {"reply": "I wasn't able to complete that — try rephrasing.", "tools_used": tools_used}
