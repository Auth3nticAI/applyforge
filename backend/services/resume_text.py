"""Extract plain text from an uploaded resume file (PDF / DOCX / TXT).

Kept tiny and dependency-isolated: PDF via pdfplumber, DOCX via python-docx, everything
else decoded as UTF-8. The extracted text then goes to ai.extract_profile().
"""
from __future__ import annotations
import io


def extract_text(filename: str, raw: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _from_pdf(raw)
    if name.endswith(".docx"):
        return _from_docx(raw)
    # .txt / .md / unknown -> best-effort decode
    return raw.decode("utf-8", errors="ignore")


def _from_pdf(raw: bytes) -> str:
    import pdfplumber
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts).strip()


def _from_docx(raw: bytes) -> str:
    import docx
    document = docx.Document(io.BytesIO(raw))
    return "\n".join(p.text for p in document.paragraphs).strip()
