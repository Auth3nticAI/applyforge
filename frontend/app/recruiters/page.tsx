"use client";

/*
 * Recruiters page (route: "/recruiters") — browse recruiters and generate AI
 * outreach drafts (sending is simulated in this demo).
 * Backend:
 *   - GET  /recruiters        (getRecruiters)   list of recruiters (loaded on mount).
 *   - GET  /outreach          (getOutreach)     history of generated outreach.
 *   - POST /outreach/generate (generateOutreach) AI-drafts a message for a recruiter.
 * UI: a loading line / error banner, a list of recruiter cards each with a
 * "Generate outreach" button (per-recruiter loading + error state and an inline
 * draft preview), and an outreach history section below.
 */
import { useState, useEffect } from "react";
import {
  getRecruiters,
  getOutreach,
  generateOutreach,
  type Recruiter,
  type Outreach,
} from "../lib/api";

export default function RecruitersPage() {
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-recruiter draft + state
  const [drafts, setDrafts] = useState<Record<number, Outreach>>({});
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [genError, setGenError] = useState<Record<number, string>>({});

  // Load recruiters and outreach history once on mount.
  useEffect(() => {
    fetchData();
  }, []);

  // Data fetch: load the recruiter list and outreach history together.
  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [recs, hist] = await Promise.all([
        getRecruiters(),
        getOutreach(),
      ]);
      setRecruiters(recs);
      setOutreach(hist);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load recruiters."
      );
    } finally {
      setLoading(false);
    }
  }

  // AI trigger: generate an outreach draft for one recruiter, store it under
  // that recruiter's id, and refresh the history list. Errors are tracked
  // per-recruiter so one failure doesn't affect the others.
  async function handleGenerate(recruiterId: number) {
    setGeneratingId(recruiterId);
    setGenError((prev) => {
      const next = { ...prev };
      delete next[recruiterId];
      return next;
    });
    try {
      const draft = await generateOutreach(recruiterId);
      setDrafts((prev) => ({ ...prev, [recruiterId]: draft }));
      // refresh history
      const hist = await getOutreach();
      setOutreach(hist);
    } catch (err: unknown) {
      setGenError((prev) => ({
        ...prev,
        [recruiterId]:
          err instanceof Error ? err.message : "Failed to generate outreach.",
      }));
    } finally {
      setGeneratingId(null);
    }
  }

  // Resolve a recruiter id to a display name for the history list.
  function recruiterName(id: number): string {
    const r = recruiters.find((x) => x.id === id);
    return r ? r.full_name : `Recruiter #${id}`;
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading recruiters...</p>;
  }
  if (error) {
    return (
      <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
        {error}
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-fg mb-2">Recruiters</h1>
      <p className="text-muted mb-8">
        Generate tailored outreach drafts. Sending is simulated in this demo.
      </p>

      {/* Recruiter list: each card shows details + a Generate button and, once
          generated, an inline draft preview. */}
      {recruiters.length === 0 ? (
        <div className="text-center py-12 text-meta bg-surface border border-border rounded-md mb-10">
          <p className="text-lg">No recruiters available.</p>
        </div>
      ) : (
        <div className="space-y-4 mb-12">
          {recruiters.map((r) => {
            const draft = drafts[r.id];
            return (
              <div
                key={r.id}
                className="bg-surface border border-border rounded-md p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-fg">
                      {r.full_name}
                    </h3>
                    <p className="text-sm text-muted">
                      {r.title ? `${r.title} @ ` : ""}
                      {r.firm}
                    </p>
                    {r.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {r.specialties.map((s) => (
                          <span
                            key={s}
                            className="bg-accent-tint text-accent-hover border border-accent text-xs font-medium px-2 py-0.5 rounded-sm"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleGenerate(r.id)}
                    disabled={generatingId === r.id}
                    className="shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm"
                  >
                    {generatingId === r.id
                      ? "Generating..."
                      : "Generate outreach"}
                  </button>
                </div>

                {genError[r.id] && (
                  <p className="mt-3 text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
                    {genError[r.id]}
                  </p>
                )}

                {draft && (
                  <div className="mt-4 border-t border-border-soft pt-4">
                    <p className="text-sm font-semibold text-fg">
                      {draft.subject}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-fg font-sans">
                      {draft.body}
                    </pre>
                    <p className="mt-3 text-xs text-warn bg-warn-tint border border-transparent rounded-sm px-2 py-1 inline-block">
                      Draft — sending is simulated in this demo.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Outreach history */}
      <h2 className="text-xl font-semibold text-fg mb-4">
        Outreach history
      </h2>
      {outreach.length === 0 ? (
        <p className="text-sm text-meta">No outreach generated yet.</p>
      ) : (
        <div className="space-y-3">
          {outreach.map((o) => (
            <div
              key={o.id}
              className="bg-surface border border-border rounded-md p-4 shadow-sm flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-fg text-sm">
                  {o.subject}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  To {recruiterName(o.recruiter_id)}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-sm border ${
                  o.status === "SENT_SIM"
                    ? "bg-success-tint text-success border-transparent"
                    : "bg-surface-warm text-muted border-border"
                }`}
              >
                {o.status === "SENT_SIM" ? "Sent (sim)" : "Draft"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
