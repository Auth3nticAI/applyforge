"use client";

/*
 * Application detail page (route: "/applications/[id]") — the AI workspace for a
 * single tracked application. The `id` route param selects which application.
 * Backend:
 *   - GET   /applications/{id}              (getApplication) loads job + artifacts + events.
 *   - PATCH /applications/{id}/status       (updateStatus)   advances or rejects the application.
 *   - POST  /applications/{id}/analyze      (analyzeApplication) AI match analysis (hero card).
 *   - POST  /applications/{id}/cover-letter (generateCoverLetter) AI cover letter.
 *   - POST  /applications/{id}/tailor       (tailorResume)   AI bullet rewriting (grounded flag).
 * On load, existing AI artifacts (MATCH_REPORT, COVER_LETTER) are pre-populated
 * so prior results show without re-running the AI. UI: header + pipeline stepper
 * with Advance/Reject actions, three AI action cards (each with its own
 * loading/error state and re-run button), and an event timeline at the bottom.
 */
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getApplication,
  updateStatus,
  analyzeApplication,
  generateCoverLetter,
  tailorResume,
  type ApplicationDetail,
  type AppStatus,
  type MatchReport,
  type TailoredBullet,
} from "../../lib/api";

const MAIN_PIPELINE: AppStatus[] = [
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
];

const STATUS_LABELS: Record<AppStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

function statusBadgeClass(status: AppStatus): string {
  switch (status) {
    case "SAVED":
      return "bg-surface-warm text-fg border-border";
    case "APPLIED":
      return "bg-info-tint text-info border-transparent";
    case "INTERVIEWING":
      return "bg-warn-tint text-warn border-transparent";
    case "OFFER":
      return "bg-success-tint text-success border-transparent";
    case "REJECTED":
      return "bg-danger-tint text-danger border-transparent";
  }
}

// Given the current status, return the next forward step in the main pipeline
// (or null at the end / for terminal states) — drives the "Advance" button.
function nextStatus(current: AppStatus): AppStatus | null {
  const idx = MAIN_PIPELINE.indexOf(current);
  if (idx === -1 || idx >= MAIN_PIPELINE.length - 1) return null;
  return MAIN_PIPELINE[idx + 1];
}

// Artifacts store the match report as a JSON string; safely parse it back into
// a MatchReport (returns null if the stored content isn't valid JSON).
function parseMatchReport(content: string): MatchReport | null {
  try {
    return JSON.parse(content) as MatchReport;
  } catch {
    return null;
  }
}

function matchScoreColor(score: number): string {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warn";
  return "text-danger";
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const appId = parseInt(id, 10);

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Match analysis
  const [report, setReport] = useState<MatchReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Cover letter
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Tailored resume
  const [bullets, setBullets] = useState<TailoredBullet[] | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);

  // Reload whenever the application id in the URL changes.
  useEffect(() => {
    fetchApp();
  }, [appId]);

  // Data fetch: load the application and pre-populate any existing AI artifacts
  // (match report, cover letter) so prior results render without re-running them.
  async function fetchApp() {
    setLoading(true);
    setError(null);
    try {
      const data = await getApplication(appId);
      setApp(data);
      // Pre-populate match report from an existing artifact, if present.
      const existing = data.artifacts.find((a) => a.kind === "MATCH_REPORT");
      if (existing) {
        const parsed = parseMatchReport(existing.content);
        if (parsed) setReport(parsed);
      }
      // Pre-populate cover letter if one exists.
      const cover = data.artifacts.find((a) => a.kind === "COVER_LETTER");
      if (cover) setCoverLetter(cover.content);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load application."
      );
    } finally {
      setLoading(false);
    }
  }

  // Status transition: PATCH the new status and swap in the updated application
  // (which includes the new timeline event).
  async function changeStatus(status: AppStatus, note?: string) {
    setStatusUpdating(true);
    setStatusError(null);
    try {
      const updated = await updateStatus(appId, status, note);
      setApp(updated);
    } catch (err: unknown) {
      setStatusError(
        err instanceof Error ? err.message : "Failed to update status."
      );
    } finally {
      setStatusUpdating(false);
    }
  }

  // --- AI trigger handlers (each calls a POST endpoint that runs an LLM) ---
  // Run match analysis, store the report, and re-fetch so match_score/artifacts sync.
  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeApplication(appId);
      setReport(result);
      // refresh so match_score/artifacts stay in sync
      await fetchApp();
    } catch (err: unknown) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Failed to analyze application."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  // Generate a cover letter draft and show it in the cover-letter card.
  async function handleCoverLetter() {
    setCoverLoading(true);
    setCoverError(null);
    setCopied(false);
    try {
      const result = await generateCoverLetter(appId);
      setCoverLetter(result.content);
    } catch (err: unknown) {
      setCoverError(
        err instanceof Error ? err.message : "Failed to generate cover letter."
      );
    } finally {
      setCoverLoading(false);
    }
  }

  // Tailor resume bullets toward this role; each bullet carries a `grounded` flag.
  async function handleTailor() {
    setTailorLoading(true);
    setTailorError(null);
    try {
      const result = await tailorResume(appId);
      setBullets(result.bullets);
    } catch (err: unknown) {
      setTailorError(
        err instanceof Error ? err.message : "Failed to tailor resume."
      );
    } finally {
      setTailorLoading(false);
    }
  }

  // Copy the generated cover letter to the clipboard; briefly flips the label.
  async function handleCopy() {
    if (!coverLetter) return;
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading application...</p>;
  }
  if (error) {
    return (
      <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
        {error}
      </p>
    );
  }
  if (!app) {
    return null;
  }

  // Terminal applications (offer/rejected) can no longer transition; advanceTo
  // is the next pipeline stage shown on the Advance button.
  const isTerminal = app.status === "OFFER" || app.status === "REJECTED";
  const advanceTo = nextStatus(app.status);

  return (
    <div>
      <button
        onClick={() => router.push("/")}
        className="text-sm text-accent hover:text-accent-hover mb-4 inline-block"
      >
        &larr; Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">
            {app.job.company}
          </p>
          <h1 className="text-3xl font-bold text-fg">{app.job.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted">
            {app.job.location && <span>{app.job.location}</span>}
            {app.job.remote && (
              <span className="bg-success-tint text-success border border-transparent px-2 py-0.5 rounded-sm text-xs font-medium">
                Remote
              </span>
            )}
            {app.job.apply_url && (
              <a
                href={app.job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover font-medium"
              >
                View posting &rarr;
              </a>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 text-sm font-medium px-3 py-1 rounded-sm border ${statusBadgeClass(
            app.status
          )}`}
        >
          {STATUS_LABELS[app.status]}
        </span>
      </div>

      {/* Pipeline indicator */}
      <div className="bg-surface border border-border rounded-md p-5 shadow-sm my-6">
        <div className="flex items-center">
          {MAIN_PIPELINE.map((step, i) => {
            const currentIdx = MAIN_PIPELINE.indexOf(app.status);
            const reached =
              app.status !== "REJECTED" && currentIdx >= i && currentIdx !== -1;
            const isCurrent = app.status === step;
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                      isCurrent
                        ? "bg-accent text-white border-accent"
                        : reached
                        ? "bg-accent-tint text-accent-hover border-accent"
                        : "bg-surface text-meta border-border"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={`mt-1 text-xs ${
                      isCurrent
                        ? "text-accent-hover font-semibold"
                        : "text-muted"
                    }`}
                  >
                    {STATUS_LABELS[step]}
                  </span>
                </div>
                {i < MAIN_PIPELINE.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      reached && currentIdx > i
                        ? "bg-accent"
                        : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        {app.status === "REJECTED" && (
          <p className="mt-4 text-sm text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2">
            This application was marked rejected.
          </p>
        )}

        {/* Status actions */}
        {statusError && (
          <p className="mt-4 text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
            {statusError}
          </p>
        )}
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={() => advanceTo && changeStatus(advanceTo)}
            disabled={isTerminal || !advanceTo || statusUpdating}
            className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm"
          >
            {advanceTo
              ? `Advance to ${STATUS_LABELS[advanceTo]}`
              : "Advance"}
          </button>
          <button
            onClick={() => changeStatus("REJECTED")}
            disabled={isTerminal || statusUpdating}
            className="border border-danger text-danger hover:bg-danger-tint disabled:opacity-50 font-medium px-4 py-2 rounded-sm transition-colors text-sm"
          >
            Reject
          </button>
        </div>
      </div>

      {/* AI action cards: analyze (hero), cover letter, and resume tailoring.
          Each renders its result inline and can be re-run via its button. */}
      <div className="space-y-6">
        {/* Match analysis (hero) */}
        <div className="bg-surface border border-accent rounded-md p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-semibold text-fg">
                Match analysis
              </h2>
              <p className="text-sm text-muted">
                How well your profile fits this role.
              </p>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm"
            >
              {analyzing
                ? "Analyzing..."
                : report
                ? "Re-analyze"
                : "Analyze"}
            </button>
          </div>

          {analyzeError && (
            <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm mb-3">
              {analyzeError}
            </p>
          )}

          {report && (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-5xl font-bold ${matchScoreColor(
                    report.match_score
                  )}`}
                >
                  {Math.round(report.match_score)}%
                </span>
                <span className="text-fg font-medium">
                  {report.verdict}
                </span>
              </div>

              {report.matched_keywords.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    Matched keywords
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {report.matched_keywords.map((k) => (
                      <span
                        key={k}
                        className="bg-success-tint text-success border border-transparent text-xs font-medium px-2 py-0.5 rounded-sm"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.missing_keywords.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    Missing keywords
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {report.missing_keywords.map((k) => (
                      <span
                        key={k}
                        className="bg-warn-tint text-warn border border-transparent text-xs font-medium px-2 py-0.5 rounded-sm"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {report.strengths.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-fg mb-1">
                      Strengths
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted">
                      {report.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.gaps.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-fg mb-1">
                      Gaps
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted">
                      {report.gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {report.summary && (
                <p className="text-sm text-fg whitespace-pre-line border-t border-border-soft pt-3">
                  {report.summary}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cover letter */}
        <div className="bg-surface border border-border rounded-md p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-semibold text-fg">
                Cover letter
              </h2>
              <p className="text-sm text-muted">
                A draft grounded in your profile.
              </p>
            </div>
            <button
              onClick={handleCoverLetter}
              disabled={coverLoading}
              className="shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm"
            >
              {coverLoading
                ? "Generating..."
                : coverLetter
                ? "Regenerate"
                : "Generate"}
            </button>
          </div>

          {coverError && (
            <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm mb-3">
              {coverError}
            </p>
          )}

          {coverLetter && (
            <div>
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleCopy}
                  className="text-xs text-accent hover:text-accent-hover font-medium"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-fg font-sans bg-surface-warm border border-border-soft rounded-sm p-4">
                {coverLetter}
              </pre>
            </div>
          )}
        </div>

        {/* Tailor resume */}
        <div className="bg-surface border border-border rounded-md p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-semibold text-fg">
                Tailor resume
              </h2>
              <p className="text-sm text-muted">
                Rewritten bullets aimed at this role.
              </p>
            </div>
            <button
              onClick={handleTailor}
              disabled={tailorLoading}
              className="shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm"
            >
              {tailorLoading
                ? "Tailoring..."
                : bullets
                ? "Re-tailor"
                : "Tailor"}
            </button>
          </div>

          {tailorError && (
            <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm mb-3">
              {tailorError}
            </p>
          )}

          {bullets && (
            <div>
              <ul className="space-y-3">
                {bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-fg"
                  >
                    <span
                      className={`shrink-0 mt-0.5 ${
                        b.grounded ? "text-success" : "text-warn"
                      }`}
                      title={
                        b.grounded
                          ? "Grounded in your profile"
                          : "Not directly grounded — review before using"
                      }
                    >
                      {b.grounded ? "✓" : "⚠"}
                    </span>
                    <div>
                      <p>{b.rewritten}</p>
                      {b.original && (
                        <p className="text-xs text-meta mt-0.5">
                          was: {b.original}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-success">
                ✓ Truthful tailoring — only what&apos;s in your profile.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Event timeline: chronological list of status-change events recorded by
          the backend (from_status → to_status, optional note, timestamp). */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-fg mb-4">Timeline</h2>
        {app.events.length === 0 ? (
          <p className="text-sm text-meta">No events yet.</p>
        ) : (
          <ol className="space-y-3">
            {app.events.map((ev) => (
              <li
                key={ev.id}
                className="bg-surface border border-border rounded-md p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 text-sm">
                  {ev.from_status && (
                    <>
                      <span className="text-muted">
                        {STATUS_LABELS[ev.from_status]}
                      </span>
                      <span className="text-meta">&rarr;</span>
                    </>
                  )}
                  <span
                    className={`font-medium px-2 py-0.5 rounded-sm border text-xs ${statusBadgeClass(
                      ev.to_status
                    )}`}
                  >
                    {STATUS_LABELS[ev.to_status]}
                  </span>
                  <span className="text-xs text-meta ml-auto">
                    {new Date(ev.created_at).toLocaleString()}
                  </span>
                </div>
                {ev.note && (
                  <p className="text-sm text-muted mt-2">{ev.note}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
