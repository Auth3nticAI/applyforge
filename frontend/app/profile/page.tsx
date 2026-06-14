"use client";

/*
 * Profile page (route: "/profile") — the user's master profile, which is the
 * single source of truth the AI features tailor from.
 * Backend:
 *   - GET  /profile  (getProfile)   loads the existing profile on mount.
 *   - PUT  /profile  (updateProfile) saves edits from the form.
 *   - POST /profile/import (importProfile) uploads a resume file; the backend's
 *     AI extracts structured fields and returns a Profile that pre-fills the form.
 * UI: a loading line while fetching; an "import from resume" card and an editable
 * details form, each with their own error/success notices. A missing profile
 * (404) is treated as "not created yet" and shows an empty form + warning.
 */
import { useState, useEffect } from "react";
import {
  getProfile,
  updateProfile,
  importProfile,
  type Profile,
  type Link as ProfileLink,
  type ProfileUpdate,
} from "../lib/api";

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  years_experience: string;
  skills: string; // comma-separated
  resume_text: string;
  links: ProfileLink[];
}

const EMPTY_FORM: FormState = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  years_experience: "",
  skills: "",
  resume_text: "",
  links: [],
};

// Map the API Profile into the flat, all-strings form state (e.g. skills array
// becomes a comma-separated string, numbers become strings for the inputs).
function profileToForm(p: Profile): FormState {
  return {
    full_name: p.full_name,
    email: p.email,
    phone: p.phone ?? "",
    location: p.location ?? "",
    headline: p.headline ?? "",
    years_experience:
      p.years_experience != null ? String(p.years_experience) : "",
    skills: p.skills.join(", "),
    resume_text: p.resume_text,
    links: p.links.length > 0 ? p.links : [],
  };
}

// Inverse of profileToForm: convert form strings back into the API payload
// (split skills on commas, blank optional fields become null, years -> number).
function formToUpdate(form: FormState): ProfileUpdate {
  const skills = form.skills
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const years = form.years_experience.trim();
  return {
    full_name: form.full_name,
    email: form.email,
    phone: form.phone.trim() || null,
    location: form.location.trim() || null,
    headline: form.headline.trim() || null,
    links: form.links.filter((l) => l.label.trim() || l.url.trim()),
    resume_text: form.resume_text,
    skills,
    years_experience: years ? Number(years) : null,
  };
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

  // Load the profile once on mount.
  useEffect(() => {
    fetchProfile();
  }, []);

  // Data fetch: populate the form if a profile exists; a failure (e.g. 404)
  // simply means there's no profile yet, so render the empty form.
  async function fetchProfile() {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await getProfile();
      setForm(profileToForm(p));
      setHasProfile(true);
    } catch {
      // 404 (or any failure) means no profile yet — render the empty form.
      setHasProfile(false);
    } finally {
      setLoading(false);
    }
  }

  // --- Form field handlers (controlled inputs) ---
  type StringField = Exclude<keyof FormState, "links">;

  // Update a single text field by name.
  function handleField(name: StringField, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Edit one field of one link in the dynamic links list.
  function handleLinkChange(
    index: number,
    field: keyof ProfileLink,
    value: string
  ) {
    setForm((prev) => {
      const links = prev.links.map((l, i) =>
        i === index ? { ...l, [field]: value } : l
      );
      return { ...prev, links };
    });
  }

  function addLink() {
    setForm((prev) => ({
      ...prev,
      links: [...prev.links, { label: "", url: "" }],
    }));
  }

  function removeLink(index: number) {
    setForm((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }));
  }

  // Save handler: PUT the form back to /profile and refresh from the response.
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveNote(null);
    try {
      const updated = await updateProfile(formToUpdate(form));
      setForm(profileToForm(updated));
      setHasProfile(true);
      setSaveNote("Profile saved.");
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save profile."
      );
    } finally {
      setSaving(false);
    }
  }

  // AI import handler: POST the chosen resume file to /profile/import; the
  // extracted profile replaces the current form contents.
  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportNote(null);
    try {
      const p = await importProfile(file);
      setForm(profileToForm(p));
      setHasProfile(true);
      setImportNote(`Extracted profile from "${file.name}".`);
      setFile(null);
    } catch (err: unknown) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import resume."
      );
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading profile...</p>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-fg mb-2">Profile</h1>
      <p className="text-muted mb-8">
        Your profile is the single source of truth ApplyForge uses for honest
        tailoring.
      </p>

      {loadError && (
        <p className="mb-4 text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
          {loadError}
        </p>
      )}

      {!hasProfile && (
        <p className="mb-6 text-warn bg-warn-tint border border-transparent rounded-sm px-3 py-2 text-sm">
          No profile yet. Import a resume below or fill in the form to create
          one.
        </p>
      )}

      {/* Import card */}
      <div className="bg-surface border border-border rounded-md p-6 mb-8 shadow-sm">
        <h2 className="text-lg font-semibold text-fg mb-2">
          Import from resume
        </h2>
        <p className="text-sm text-muted mb-4">
          Upload a resume and we&apos;ll extract your details to pre-fill the
          form.
        </p>
        {importError && (
          <p className="mb-3 text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
            {importError}
          </p>
        )}
        {importNote && (
          <p className="mb-3 text-success bg-success-tint border border-transparent rounded-sm px-3 py-2 text-sm">
            {importNote}
          </p>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-accent-tint file:text-accent-hover hover:file:bg-accent-tint"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || importing}
            className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-sm transition-colors text-sm shrink-0"
          >
            {importing ? "Extracting..." : "Upload & extract"}
          </button>
        </div>
      </div>

      {/* Edit form */}
      <form
        onSubmit={handleSave}
        className="bg-surface border border-border rounded-md p-6 shadow-sm space-y-5"
      >
        <h2 className="text-lg font-semibold text-fg">Details</h2>

        {saveError && (
          <p className="text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
            {saveError}
          </p>
        )}
        {saveNote && (
          <p className="text-success bg-success-tint border border-transparent rounded-sm px-3 py-2 text-sm">
            {saveNote}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(v) => handleField("full_name", v)}
            required
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => handleField("email", v)}
            required
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(v) => handleField("phone", v)}
          />
          <Field
            label="Location"
            value={form.location}
            onChange={(v) => handleField("location", v)}
          />
          <Field
            label="Headline"
            value={form.headline}
            onChange={(v) => handleField("headline", v)}
          />
          <Field
            label="Years of experience"
            type="number"
            value={form.years_experience}
            onChange={(v) => handleField("years_experience", v)}
          />
        </div>

        <Field
          label="Skills (comma-separated)"
          value={form.skills}
          onChange={(v) => handleField("skills", v)}
          placeholder="React, TypeScript, Python, AWS"
        />

        {/* Links */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-fg">
              Links
            </label>
            <button
              type="button"
              onClick={addLink}
              className="text-sm text-accent hover:text-accent-hover font-medium"
            >
              + Add link
            </button>
          </div>
          {form.links.length === 0 ? (
            <p className="text-sm text-meta">No links added.</p>
          ) : (
            <div className="space-y-2">
              {form.links.map((link, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) =>
                      handleLinkChange(i, "label", e.target.value)
                    }
                    placeholder="Label (e.g. GitHub)"
                    className="w-1/3 border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <input
                    type="text"
                    value={link.url}
                    onChange={(e) => handleLinkChange(i, "url", e.target.value)}
                    placeholder="https://..."
                    className="flex-1 border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    className="text-meta hover:text-danger transition-colors text-sm shrink-0"
                    aria-label="Remove link"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resume text */}
        <div>
          <label
            className="block text-sm font-medium text-fg mb-1"
            htmlFor="resume_text"
          >
            Resume text
          </label>
          <textarea
            id="resume_text"
            rows={10}
            value={form.resume_text}
            onChange={(e) => handleField("resume_text", e.target.value)}
            placeholder="Paste your full resume text here. This is what ApplyForge tailors from."
            className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-y"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-5 py-2 rounded-sm transition-colors text-sm"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-fg mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}
