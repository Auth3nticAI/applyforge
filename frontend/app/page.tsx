"use client";

/*
 * Dashboard page (route: "/") — the app's landing view.
 * Backend: loads /stats (GET getStats) and /applications (GET getApplications)
 * in parallel on mount. Renders four stat cards (totals + average match) and a
 * Kanban-style "pipeline" board that groups tracked applications into columns
 * by status (Saved → Applied → Interviewing → Offer → Rejected).
 * UI states: shows a loading line while fetching, an error banner on failure,
 * and an empty-state prompt when there are no applications yet.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getStats,
  getApplications,
  type Stats,
  type ApplicationListItem,
  type AppStatus,
} from "./lib/api";

const PIPELINE: AppStatus[] = [
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
];

const STATUS_LABELS: Record<AppStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

// Pipeline stages map onto the signal scale (see DESIGN.md): Saved = muted,
// Applied = info, Interviewing = warn, Offer = success, Rejected = danger.
const STATUS_HEADER: Record<AppStatus, string> = {
  SAVED: "text-muted border-border",
  APPLIED: "text-info border-info",
  INTERVIEWING: "text-warn border-warn",
  OFFER: "text-success border-success",
  REJECTED: "text-danger border-danger",
};

// Color the match-score badge by signal scale: green (strong) / amber / red.
function matchBadgeClass(score: number): string {
  if (score >= 75) return "bg-success-tint text-success";
  if (score >= 50) return "bg-warn-tint text-warn";
  return "bg-danger-tint text-danger";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data once on mount.
  useEffect(() => {
    fetchData();
  }, []);

  // Load stats and applications together; surface any failure as `error`.
  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [statsData, appsData] = await Promise.all([
        getStats(),
        getApplications(),
      ]);
      setStats(statsData);
      setApplications(appsData);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }

  // Loading / error short-circuits before the main render.
  if (loading) {
    return <p className="text-muted text-sm">Loading dashboard…</p>;
  }
  if (error) {
    return (
      <p className="text-danger bg-danger-tint border border-danger/20 rounded-sm px-3 py-2 text-sm">
        {error}
      </p>
    );
  }

  // Derive the four summary card values from the loaded stats.
  const avgMatch =
    stats?.avg_match != null ? `${Math.round(stats.avg_match)}%` : "—";

  const cards = [
    { label: "Applications", value: stats?.applications ?? 0 },
    { label: "Avg match", value: avgMatch },
    { label: "Outreach sent", value: stats?.outreach ?? 0 },
    { label: "Jobs in feed", value: stats?.jobs ?? 0 },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-3xl font-semibold text-fg">Dashboard</h1>
        <Link
          href="/jobs"
          className="bg-accent hover:bg-accent-hover text-accent-on font-medium px-4 py-2 rounded-sm transition-colors text-sm shrink-0"
        >
          Browse jobs
        </Link>
      </div>
      <p className="text-muted mb-8">Your job-search pipeline at a glance.</p>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-10">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-surface border border-border rounded-md p-5"
          >
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">
              {card.label}
            </p>
            <p className="text-3xl font-semibold text-fg mt-2 font-mono">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Pipeline board: one column per status; each column filters the
          applications list to its status and links each card to the detail page. */}
      <h2 className="text-xl font-semibold text-fg mb-4">Pipeline</h2>
      {applications.length === 0 ? (
        <div className="text-center py-12 text-muted bg-surface border border-border rounded-md">
          <p className="text-lg text-fg">No applications yet.</p>
          <p className="text-sm mt-1">
            <Link
              href="/jobs"
              className="text-accent hover:text-accent-hover font-medium"
            >
              Browse jobs
            </Link>{" "}
            and start tracking to build your pipeline.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((status) => {
            const items = applications.filter((a) => a.status === status);
            return (
              <div key={status} className="flex flex-col">
                <div
                  className={`text-xs font-semibold uppercase tracking-wide border-b-2 pb-2 mb-3 flex items-center justify-between ${STATUS_HEADER[status]}`}
                >
                  <span>{STATUS_LABELS[status]}</span>
                  <span className="text-meta font-mono">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-meta">—</p>
                  ) : (
                    items.map((app) => (
                      <Link
                        key={app.id}
                        href={`/applications/${app.id}`}
                        className="block bg-surface border border-border rounded-md p-3 hover:border-accent hover:shadow-raised transition"
                      >
                        <p className="text-xs font-semibold text-muted">
                          {app.company}
                        </p>
                        <p className="text-sm font-medium text-fg mt-0.5">
                          {app.title}
                        </p>
                        {app.match_score != null && (
                          <span
                            className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full font-mono ${matchBadgeClass(
                              app.match_score
                            )}`}
                          >
                            {Math.round(app.match_score)}% match
                          </span>
                        )}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
