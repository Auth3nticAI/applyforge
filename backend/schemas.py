from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from models import AppStatus, ArtifactKind, OutreachStatus


# ---------- Profile ----------

class Link(BaseModel):
    label: str
    url: str


class ProfileBase(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    headline: Optional[str] = None
    links: list[Link] = []
    resume_text: str = ""
    skills: list[str] = []
    years_experience: Optional[int] = None


class ProfileUpdate(ProfileBase):
    pass


class ProfileOut(ProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------- Job ----------

class JobOut(BaseModel):
    id: int
    source_ats: str
    external_id: Optional[str] = None
    company: str
    title: str
    location: Optional[str] = None
    remote: bool
    description: str
    apply_url: Optional[str] = None
    posted_at: Optional[datetime] = None
    fetched_at: datetime
    model_config = ConfigDict(from_attributes=True)


class JobListItem(BaseModel):
    id: int
    source_ats: str
    company: str
    title: str
    location: Optional[str] = None
    remote: bool
    apply_url: Optional[str] = None
    keyword_match: Optional[int] = None      # cheap deterministic pre-score (0-100)
    tracked: bool = False                    # is there already an Application for this job?
    model_config = ConfigDict(from_attributes=True)


class JobCreate(BaseModel):
    """Paste-a-JD path."""
    company: str
    title: str
    location: Optional[str] = None
    remote: bool = False
    description: str
    apply_url: Optional[str] = None


class JobSyncResult(BaseModel):
    fetched: int
    added: int
    sources: list[str]


# ---------- Artifact / Event ----------

class ArtifactOut(BaseModel):
    id: int
    kind: ArtifactKind
    content: str
    model: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class EventOut(BaseModel):
    id: int
    from_status: Optional[AppStatus] = None
    to_status: AppStatus
    note: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------- Application ----------

class ApplicationCreate(BaseModel):
    job_id: int


class ApplicationListItem(BaseModel):
    id: int
    status: AppStatus
    match_score: Optional[float] = None
    company: str
    title: str
    location: Optional[str] = None
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ApplicationDetail(BaseModel):
    id: int
    status: AppStatus
    match_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    job: JobOut
    artifacts: list[ArtifactOut] = []
    events: list[EventOut] = []
    model_config = ConfigDict(from_attributes=True)


class StatusUpdate(BaseModel):
    status: AppStatus
    note: Optional[str] = None


# ---------- AI: match report (hero) ----------

class MatchReport(BaseModel):
    match_score: int                 # 0-100
    verdict: str                     # "Strong match — apply", "Reach — close 2 gaps", "Stretch"
    matched_keywords: list[str]
    missing_keywords: list[str]
    strengths: list[str]
    gaps: list[str]
    summary: str


# ---------- AI: extraction ----------

class ImportProfileRequest(BaseModel):
    resume_text: str                 # raw text already extracted from an uploaded file


class ExtractedProfile(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    headline: Optional[str] = None
    links: list[Link] = []
    skills: list[str] = []
    years_experience: Optional[int] = None
    resume_text: str


# ---------- AI: cover letter / tailor ----------

class CoverLetterResponse(BaseModel):
    artifact_id: int
    content: str


class TailoredBullet(BaseModel):
    original: Optional[str] = None
    rewritten: str
    grounded: bool                   # True if supported by the profile (should always be True)


class TailorResponse(BaseModel):
    artifact_id: int
    bullets: list[TailoredBullet]


# ---------- Recruiter / Outreach ----------

class RecruiterOut(BaseModel):
    id: int
    full_name: str
    firm: str
    title: Optional[str] = None
    specialties: list[str] = []
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class OutreachGenerateRequest(BaseModel):
    recruiter_id: int
    job_id: Optional[int] = None


class OutreachOut(BaseModel):
    id: int
    recruiter_id: int
    job_id: Optional[int] = None
    subject: str
    body: str
    status: OutreachStatus
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------- AI: copilot chat (agent) ----------

class ChatMessage(BaseModel):
    role: str                        # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = []
