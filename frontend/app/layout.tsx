/*
 * Root layout (App Router) — wraps EVERY page in the app.
 * Renders the shared chrome: the sticky top navigation bar (Dashboard / Jobs /
 * Profile / Recruiters + the accented Copilot button) and the footer. The
 * per-route page content is injected where {children} appears.
 * No backend calls here; this is a Server Component that only renders layout.
 */
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApplyForge",
  description:
    "An honest job-search copilot. Track applications, tailor your resume, and reach out — grounded in the truth of your profile.",
};

// Primary nav destinations rendered as plain links in the header (Copilot is
// rendered separately below as the highlighted call-to-action button).
const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/profile", label: "Profile" },
  { href: "/recruiters", label: "Recruiters" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* Sticky top nav: brand on the left, link group + Copilot CTA on the right */}
        <nav className="sticky top-0 z-20 bg-surface/85 backdrop-blur border-b border-border">
          <div className="max-w-container mx-auto px-6 h-14 flex items-center justify-between gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg hover:text-accent transition-colors"
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full bg-accent"
              />
              ApplyForge
            </Link>
            <div className="flex items-center gap-1 sm:gap-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 rounded-sm text-sm text-muted hover:text-fg hover:bg-surface-warm transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/copilot"
                className="ml-1 bg-accent hover:bg-accent-hover text-accent-on text-sm font-medium px-4 py-1.5 rounded-sm transition-colors"
              >
                Copilot
              </Link>
            </div>
          </div>
        </nav>
        {/* Active route's page component renders here */}
        <main className="max-w-container w-full mx-auto px-6 py-8 flex-1">
          {children}
        </main>
        {/* Shared footer */}
        <footer className="border-t border-border mt-12">
          <div className="max-w-container mx-auto px-6 py-6 flex items-center justify-between gap-4 text-sm text-muted">
            <span>ApplyForge — an honest job-search copilot</span>
            <span className="text-meta">CSE 552 capstone</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
