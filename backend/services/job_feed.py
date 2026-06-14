"""Pull real job openings from FREE, public, no-auth ATS APIs.

These are the same endpoints the companies' own careers pages call — no scraping, no keys,
no ToS risk. Each fetcher is best-effort: network/format failures for one company are
swallowed so a single bad slug never breaks a sync.

Returns normalized dicts ready to build `models.Job` rows.
"""
from __future__ import annotations
import httpx
from datetime import datetime

# Curated companies with public SWE boards. (ats, slug, display_company)
COMPANIES: list[tuple[str, str, str]] = [
    ("greenhouse", "stripe", "Stripe"),
    ("greenhouse", "databricks", "Databricks"),
    ("greenhouse", "discord", "Discord"),
    ("lever", "plaid", "Plaid"),
    ("ashby", "ramp", "Ramp"),
]

# Only keep postings that look like software-engineering roles.
SWE_HINTS = ("engineer", "developer", "software", "backend", "frontend", "full stack",
             "full-stack", "infrastructure", "platform", "sre", "devops")

TIMEOUT = httpx.Timeout(8.0)


def _is_swe(title: str) -> bool:
    t = (title or "").lower()
    return any(h in t for h in SWE_HINTS)


def _fetch_greenhouse(slug: str, company: str) -> list[dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    with httpx.Client(timeout=TIMEOUT) as c:
        data = c.get(url).json()
    out = []
    for j in data.get("jobs", []):
        if not _is_swe(j.get("title", "")):
            continue
        out.append({
            "source_ats": "greenhouse",
            "external_id": str(j.get("id")),
            "company": company,
            "title": j.get("title", ""),
            "location": (j.get("location") or {}).get("name"),
            "remote": "remote" in ((j.get("location") or {}).get("name", "") or "").lower(),
            "description": _strip_html(j.get("content", "")),
            "apply_url": j.get("absolute_url"),
            "posted_at": _parse_dt(j.get("updated_at")),
        })
    return out


def _fetch_lever(slug: str, company: str) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    with httpx.Client(timeout=TIMEOUT) as c:
        data = c.get(url).json()
    out = []
    for j in data:
        if not _is_swe(j.get("text", "")):
            continue
        cats = j.get("categories") or {}
        out.append({
            "source_ats": "lever",
            "external_id": str(j.get("id")),
            "company": company,
            "title": j.get("text", ""),
            "location": cats.get("location"),
            "remote": "remote" in (cats.get("location", "") or "").lower(),
            "description": _strip_html(j.get("descriptionPlain") or j.get("description") or ""),
            "apply_url": j.get("hostedUrl"),
            "posted_at": None,
        })
    return out


def _fetch_ashby(slug: str, company: str) -> list[dict]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"
    with httpx.Client(timeout=TIMEOUT) as c:
        data = c.get(url).json()
    out = []
    for j in data.get("jobs", []):
        if not _is_swe(j.get("title", "")):
            continue
        out.append({
            "source_ats": "ashby",
            "external_id": str(j.get("id")),
            "company": company,
            "title": j.get("title", ""),
            "location": j.get("location"),
            "remote": bool(j.get("isRemote")),
            "description": _strip_html(j.get("descriptionPlain") or j.get("descriptionHtml") or ""),
            "apply_url": j.get("jobUrl") or j.get("applyUrl"),
            "posted_at": None,
        })
    return out


_FETCHERS = {"greenhouse": _fetch_greenhouse, "lever": _fetch_lever, "ashby": _fetch_ashby}


def fetch_all(limit_per_company: int = 8) -> list[dict]:
    """Fetch normalized SWE jobs across all curated companies. Best-effort per company."""
    results: list[dict] = []
    for ats, slug, company in COMPANIES:
        fetcher = _FETCHERS.get(ats)
        if not fetcher:
            continue
        try:
            jobs = fetcher(slug, company)[:limit_per_company]
            results.extend(jobs)
        except Exception:
            continue  # one bad company never breaks the sync
    return results


def _strip_html(s: str) -> str:
    import re, html
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+\n", "\n", re.sub(r"[ \t]+", " ", s)).strip()


def _parse_dt(s: str | None):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None
