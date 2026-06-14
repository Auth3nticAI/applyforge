/*
 * api.ts — the single typed fetch layer for the whole frontend.
 *
 * Every call to the FastAPI backend goes through the functions defined here, so
 * URLs, HTTP methods, and response typing live in exactly one place. The file
 * is organized as: (1) the TypeScript interfaces that mirror the backend's JSON
 * shapes, (2) the shared `request()` helper + `jsonOptions()` builder, and
 * (3) the endpoint functions grouped by feature area
 * (Profile / Jobs / Applications / AI / Recruiters / Stats).
 */

// Base URL of the backend API. Overridable via env var for non-local deploys;
// defaults to the local dev server.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppStatus =
  | "SAVED"
  | "APPLIED"
  | "INTERVIEWING"
  | "OFFER"
  | "REJECTED";

export interface Link {
  label: string;
  url: string;
}

export interface Profile {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  links: Link[];
  resume_text: string;
  skills: string[];
  years_experience?: number | null;
  created_at: string;
  updated_at: string;
}

export interface JobListItem {
  id: number;
  source_ats: string;
  company: string;
  title: string;
  location?: string | null;
  remote: boolean;
  apply_url?: string | null;
  keyword_match?: number | null;
  tracked: boolean;
}

export interface Job {
  id: number;
  source_ats: string;
  external_id?: string | null;
  company: string;
  title: string;
  location?: string | null;
  remote: boolean;
  description: string;
  apply_url?: string | null;
  posted_at?: string | null;
  fetched_at: string;
}

export interface Artifact {
  id: number;
  kind: "MATCH_REPORT" | "COVER_LETTER" | "TAILORED_RESUME";
  content: string;
  model?: string | null;
  created_at: string;
}

export interface AppEvent {
  id: number;
  from_status?: AppStatus | null;
  to_status: AppStatus;
  note?: string | null;
  created_at: string;
}

export interface ApplicationListItem {
  id: number;
  status: AppStatus;
  match_score?: number | null;
  company: string;
  title: string;
  location?: string | null;
  updated_at: string;
}

export interface ApplicationDetail {
  id: number;
  status: AppStatus;
  match_score?: number | null;
  created_at: string;
  updated_at: string;
  job: Job;
  artifacts: Artifact[];
  events: AppEvent[];
}

export interface MatchReport {
  match_score: number;
  verdict: string;
  matched_keywords: string[];
  missing_keywords: string[];
  strengths: string[];
  gaps: string[];
  summary: string;
}

export interface TailoredBullet {
  original?: string | null;
  rewritten: string;
  grounded: boolean;
}

export interface Recruiter {
  id: number;
  full_name: string;
  firm: string;
  title?: string | null;
  specialties: string[];
  email?: string | null;
  linkedin_url?: string | null;
}

export interface Outreach {
  id: number;
  recruiter_id: number;
  job_id?: number | null;
  subject: string;
  body: string;
  status: "DRAFT" | "SENT_SIM";
  created_at: string;
}

export interface Stats {
  applications: number;
  by_status: Record<AppStatus, number>;
  avg_match?: number | null;
  jobs: number;
  outreach: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Request payload shapes
export interface ProfileUpdate {
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  links: Link[];
  resume_text: string;
  skills: string[];
  years_experience?: number | null;
}

export interface JobCreate {
  company: string;
  title: string;
  location?: string | null;
  remote: boolean;
  description: string;
  apply_url?: string | null;
}

export interface SyncResult {
  fetched: number;
  added: number;
  sources: string[];
}

export interface CoverLetterResult {
  artifact_id: number;
  content: string;
}

export interface TailorResult {
  artifact_id: number;
  bullets: TailoredBullet[];
}

export interface ChatResult {
  reply: string;
  tools_used: string[];
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

// Generic fetch wrapper used by every endpoint function below.
// - Prefixes the path with API_URL and awaits the response.
// - On a non-2xx status, reads the body (or falls back to the status text) and
//   throws an Error — callers catch this to show error UI.
// - Returns undefined for 204 (No Content, e.g. DELETE); otherwise parses JSON
//   and casts it to the caller-supplied type T.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, options);
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`API error ${response.status}: ${message}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

// Convenience builder for JSON-body requests (POST/PUT/PATCH): sets the method,
// the JSON Content-Type header, and serializes the body.
function jsonOptions(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<Profile> {
  return request<Profile>("/profile");
}

export async function updateProfile(body: ProfileUpdate): Promise<Profile> {
  return request<Profile>("/profile", jsonOptions("PUT", body));
}

// AI resume import: uploads a resume file (PDF/DOCX/TXT) as multipart form-data;
// the backend extracts the structured profile and returns the saved Profile.
export async function importProfile(file: File): Promise<Profile> {
  const formData = new FormData();
  formData.append("file", file);
  // Do NOT set Content-Type — the browser sets the multipart boundary.
  return request<Profile>("/profile/import", {
    method: "POST",
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function getJobs(): Promise<JobListItem[]> {
  return request<JobListItem[]>("/jobs");
}

export async function getJob(id: number): Promise<Job> {
  return request<Job>(`/jobs/${id}`);
}

export async function createJob(body: JobCreate): Promise<Job> {
  return request<Job>("/jobs", jsonOptions("POST", body));
}

// Pulls fresh postings from public ATS APIs into the local job feed; returns
// counts of how many were fetched/added and which sources were used.
export async function syncJobs(): Promise<SyncResult> {
  return request<SyncResult>("/jobs/sync", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function getApplications(): Promise<ApplicationListItem[]> {
  return request<ApplicationListItem[]>("/applications");
}

export async function trackJob(job_id: number): Promise<ApplicationDetail> {
  return request<ApplicationDetail>(
    "/applications",
    jsonOptions("POST", { job_id })
  );
}

export async function getApplication(id: number): Promise<ApplicationDetail> {
  return request<ApplicationDetail>(`/applications/${id}`);
}

export async function updateStatus(
  id: number,
  status: AppStatus,
  note?: string
): Promise<ApplicationDetail> {
  return request<ApplicationDetail>(
    `/applications/${id}/status`,
    jsonOptions("PATCH", { status, note })
  );
}

export async function deleteApplication(id: number): Promise<void> {
  return request<void>(`/applications/${id}`, { method: "DELETE" });
}

// --- AI actions on an application (each runs an LLM call server-side) ---
// Scores how well the profile matches the job and returns the match report.
export async function analyzeApplication(id: number): Promise<MatchReport> {
  return request<MatchReport>(`/applications/${id}/analyze`, {
    method: "POST",
  });
}

// Generates a cover letter grounded in the profile; returns the artifact id + text.
export async function generateCoverLetter(
  id: number
): Promise<CoverLetterResult> {
  return request<CoverLetterResult>(`/applications/${id}/cover-letter`, {
    method: "POST",
  });
}

// Rewrites resume bullets toward the job; each bullet is flagged `grounded`
// when it's backed by the profile (honest-tailoring guarantee).
export async function tailorResume(id: number): Promise<TailorResult> {
  return request<TailorResult>(`/applications/${id}/tailor`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Recruiters & outreach
// ---------------------------------------------------------------------------

export async function getRecruiters(): Promise<Recruiter[]> {
  return request<Recruiter[]>("/recruiters");
}

export async function generateOutreach(
  recruiter_id: number,
  job_id?: number
): Promise<Outreach> {
  return request<Outreach>(
    "/outreach/generate",
    jsonOptions("POST", { recruiter_id, job_id })
  );
}

export async function getOutreach(): Promise<Outreach[]> {
  return request<Outreach[]>("/outreach");
}

// ---------------------------------------------------------------------------
// AI chat & stats
// ---------------------------------------------------------------------------

// Sends the full conversation history to the tool-using AI agent and returns
// its reply plus the list of backend tools the agent invoked to answer.
export async function chat(messages: ChatMessage[]): Promise<ChatResult> {
  return request<ChatResult>("/ai/chat", jsonOptions("POST", { messages }));
}

// Dashboard aggregates: total applications, counts by status, average match, etc.
export async function getStats(): Promise<Stats> {
  return request<Stats>("/stats");
}
