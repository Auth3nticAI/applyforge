from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float, Boolean,
    ForeignKey, UniqueConstraint, Enum as SAEnum, JSON,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from database import Base


# --- Enums ---

class AppStatus(str, Enum):
    SAVED = "SAVED"
    APPLIED = "APPLIED"
    INTERVIEWING = "INTERVIEWING"
    OFFER = "OFFER"
    REJECTED = "REJECTED"


# Canonical forward-only funnel. REJECTED is a terminal side-branch (handled separately).
APP_STATUS_ORDER = [
    AppStatus.SAVED,
    AppStatus.APPLIED,
    AppStatus.INTERVIEWING,
    AppStatus.OFFER,
]

TERMINAL_STATUSES = {AppStatus.OFFER, AppStatus.REJECTED}


class ArtifactKind(str, Enum):
    MATCH_REPORT = "MATCH_REPORT"
    COVER_LETTER = "COVER_LETTER"
    TAILORED_RESUME = "TAILORED_RESUME"


class OutreachStatus(str, Enum):
    DRAFT = "DRAFT"
    SENT_SIM = "SENT_SIM"  # "sent" is simulated — no real email leaves the app


# --- Tables ---

class Profile(Base):
    """The user's single master profile — the source of truth the AI tailors from.
    One profile in this demo (no multi-user auth; out of scope for the course)."""
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    headline = Column(String, nullable=True)         # e.g. "Backend SWE, 3 yrs Python/Go"
    links = Column(JSON, nullable=False, default=list)        # [{"label": "GitHub", "url": "..."}]
    resume_text = Column(Text, nullable=False, default="")    # master resume, plain text
    skills = Column(JSON, nullable=False, default=list)       # ["python", "fastapi", ...]
    years_experience = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    applications = relationship("Application", back_populates="profile", cascade="all, delete-orphan")
    outreach = relationship("Outreach", back_populates="profile", cascade="all, delete-orphan")


class Job(Base):
    """A job opening — pulled from a public ATS feed (Greenhouse/Lever/Ashby) or pasted."""
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("source_ats", "external_id", name="uq_job_source_external"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source_ats = Column(String, nullable=False, default="manual")  # greenhouse|lever|ashby|manual
    external_id = Column(String, nullable=True)                     # id from the ATS (null for manual)
    company = Column(String, nullable=False)
    title = Column(String, nullable=False)
    location = Column(String, nullable=True)
    remote = Column(Boolean, nullable=False, default=False)
    description = Column(Text, nullable=False)
    apply_url = Column(String, nullable=True)
    posted_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")


class Application(Base):
    """Links the user's profile to a job they're pursuing. The CRUD resource + pipeline."""
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("profile_id", "job_id", name="uq_application_profile_job"),
    )

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    status = Column(SAEnum(AppStatus, name="appstatus_enum"), nullable=False, default=AppStatus.SAVED)
    match_score = Column(Float, nullable=True)          # 0-100, written by /analyze
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", back_populates="applications")
    job = relationship("Job", back_populates="applications")
    artifacts = relationship(
        "GeneratedArtifact", back_populates="application",
        cascade="all, delete-orphan", order_by="GeneratedArtifact.created_at.desc()",
    )
    events = relationship(
        "ApplicationEvent", back_populates="application",
        cascade="all, delete-orphan", order_by="ApplicationEvent.created_at",
    )


class GeneratedArtifact(Base):
    """Persists every AI output (match report, cover letter, tailored resume) for an application."""
    __tablename__ = "generated_artifacts"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    kind = Column(SAEnum(ArtifactKind, name="artifactkind_enum"), nullable=False)
    content = Column(Text, nullable=False)   # plain text, or JSON-encoded for MATCH_REPORT
    model = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    application = relationship("Application", back_populates="artifacts")


class ApplicationEvent(Base):
    """Append-only audit log of pipeline transitions."""
    __tablename__ = "application_events"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    from_status = Column(SAEnum(AppStatus, name="appstatus_enum"), nullable=True)
    to_status = Column(SAEnum(AppStatus, name="appstatus_enum"), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    application = relationship("Application", back_populates="events")


class Recruiter(Base):
    """A recruiter contact. Seeded/mock in this demo (paid enrichment APIs are out of scope)."""
    __tablename__ = "recruiters"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    firm = Column(String, nullable=False)
    title = Column(String, nullable=True)
    specialties = Column(JSON, nullable=False, default=list)   # ["backend", "infra", "contract"]
    email = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    is_seeded = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    outreach = relationship("Outreach", back_populates="recruiter", cascade="all, delete-orphan")


class Outreach(Base):
    """A personalized, truthful note the AI generated for a recruiter. 'Sent' is simulated."""
    __tablename__ = "outreach"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    recruiter_id = Column(Integer, ForeignKey("recruiters.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    status = Column(SAEnum(OutreachStatus, name="outreachstatus_enum"), nullable=False, default=OutreachStatus.DRAFT)
    created_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("Profile", back_populates="outreach")
    recruiter = relationship("Recruiter", back_populates="outreach")
