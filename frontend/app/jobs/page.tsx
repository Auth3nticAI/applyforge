"use client";

/*
 * Jobs page (route: "/jobs") — the job feed and entry point for tracking.
 * Backend:
 *   - GET  /jobs          (getJobs)   loads the feed on mount.
 *   - POST /jobs/sync     (syncJobs)  pulls live postings from public ATS APIs.
 *   - POST /jobs          (createJob) adds a manually pasted job description.
 *   - POST /applications  (trackJob)  starts tracking a job (creates an application).
 * UI: a toolbar with "Sync live jobs" and a toggleable "Paste a job" form, an
 * error banner, a loading line / empty state, and a list of job cards. Each card
 * shows a keyword-match bar and a Track button that disables once tracked.
 */
import { useState, useEffect } from "react";
import {
  getJobs,
  syncJobs,
  createJob,
  trackJob,
  type JobListItem,
  type JobCreate,
} from "../lib/api";

interface JobForm {
  company: string;
  title: string;
  location: string;
  remote: boolean;
  description: string;
  apply_url: string;
}

const EMPTY_JOB_FORM: JobForm = {
  company: "",
  title: "",
  location: "",
  remote: false,
  description: "",
  apply_url: "",
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JobForm>(EMPTY_JOB_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [trackingId, setTrackingId] = useState<number | null>(null);

  // Load the job feed once on mount.
  useEffect(() => {
    fetchJobs();
  }, []);

  // Data fetch: load the current job list into state.
  async function fetchJobs() {
    setLoading(true);
    setError(null);
    try {
      const data = await getJobs();
      setJobs(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  // Sync handler: pull fresh postings from public ATS sources, report counts,
  // then reload the feed to show the new jobs.
  async function handleSync() {
    setSyncing(true);
    setSyncNote(null);
    setError(null);
    try {
      const result = await syncJobs();
      setSyncNote(
        `Fetched ${result.fetched}, added ${result.added} new${
          result.sources.length ? ` from ${result.sources.join(", ")}` : ""
        }.`
      );
      await fetchJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sync jobs.");
    } finally {
      setSyncing(false);
    }
  }

  // Create handler: submit the pasted-JD form, reset/close it, and reload the feed.
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const body: JobCreate = {
        company: form.company,
        title: form.title,
        location: form.location.trim() || null,
        remote: form.remote,
        description: form.description,
        apply_url: form.apply_url.trim() || null,
      };
      await createJob(body);
      setForm(EMPTY_JOB_FORM);
      setShowForm(false);
      await fetchJobs();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add job.");
    } finally {
      setSubmitting(false);
    }
  }

  // Track handler: create an application for this job, then reload so the card
  // flips to its "Tracking" state. trackingId drives the per-row spinner.
  async function handleTrack(id: number) {
    setTrackingId(id);
    setError(null);
    try {
      await trackJob(id);
      await fetchJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to track job.");
    } finally {
      setTrackingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-fg mb-2">Jobs</h1>
      <p className="text-muted mb-6">
        Sync live postings or paste your own, then track the ones worth
        pursuing.
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm"
        >
          {syncing ? "Syncing..." : "Sync live jobs"}
        </button>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="border border-border hover:bg-surface-warm text-fg font-medium px-4 py-2 rounded-sm transition-colors text-sm"
        >
          {showForm ? "Cancel" : "Paste a job"}
        </button>
        {syncNote && (
          <span className="text-sm text-success">{syncNote}</span>
        )}
      </div>

      {error && (
        <p className="mb-4 text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* Paste-a-job form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-surface border border-border rounded-md p-6 mb-8 shadow-sm space-y-3"
        >
          <h2 className="text-lg font-semibold text-fg">Paste a job</h2>
          {formError && (
            <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
              {formError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={form.company}
              onChange={(e) =>
                setForm((p) => ({ ...p, company: e.target.value }))
              }
              placeholder="Company"
              className="border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) =>
                setForm((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="Title"
              className="border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              value={form.location}
              onChange={(e) =>
                setForm((p) => ({ ...p, location: e.target.value }))
              }
              placeholder="Location"
              className="border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              value={form.apply_url}
              onChange={(e) =>
                setForm((p) => ({ ...p, apply_url: e.target.value }))
              }
              placeholder="Apply URL"
              className="border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.remote}
              onChange={(e) =>
                setForm((p) => ({ ...p, remote: e.target.checked }))
              }
              className="rounded-sm border-border text-accent focus:ring-accent"
            />
            Remote
          </label>
          <textarea
            required
            rows={6}
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="Paste the full job description here..."
            className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-y"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-5 py-2 rounded-sm transition-colors text-sm"
          >
            {submitting ? "Adding..." : "Add job"}
          </button>
        </form>
      )}

      {/* Jobs list: each card shows company/title/tags, an optional keyword-match
          bar, a Track button, and a link to the external posting. */}
      {loading && <p className="text-muted text-sm">Loading jobs...</p>}
      {!loading && jobs.length === 0 && (
        <div className="text-center py-12 text-meta bg-surface border border-border rounded-md">
          <p className="text-lg">No jobs yet.</p>
          <p className="text-sm mt-1">
            Sync live jobs or paste one to get started.
          </p>
        </div>
      )}
      <div className="space-y-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-surface border border-border rounded-md p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted">
                  {job.company}
                </p>
                <h3 className="font-semibold text-fg">{job.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                  {job.location && (
                    <span className="text-muted">{job.location}</span>
                  )}
                  {job.remote && (
                    <span className="bg-success-tint text-success border border-transparent px-2 py-0.5 rounded-sm font-medium">
                      Remote
                    </span>
                  )}
                  <span className="bg-surface-warm text-muted border border-border px-2 py-0.5 rounded-sm font-medium">
                    {job.source_ats}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleTrack(job.id)}
                disabled={job.tracked || trackingId === job.id}
                className={`shrink-0 font-medium px-4 py-2 rounded-sm transition-colors text-sm ${
                  job.tracked
                    ? "bg-surface-warm text-muted cursor-default"
                    : "bg-accent hover:bg-accent-hover disabled:opacity-50 text-white"
                }`}
              >
                {job.tracked
                  ? "Tracking"
                  : trackingId === job.id
                  ? "Tracking..."
                  : "Track"}
              </button>
            </div>

            {/* Keyword match bar */}
            {job.keyword_match != null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>Keyword match</span>
                  <span className="font-medium">
                    {Math.round(job.keyword_match)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-warm rounded-sm">
                  <div
                    className="h-2 bg-accent rounded-sm"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, job.keyword_match)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {job.apply_url && (
              <a
                href={job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm text-accent hover:text-accent-hover font-medium"
              >
                View posting &rarr;
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
