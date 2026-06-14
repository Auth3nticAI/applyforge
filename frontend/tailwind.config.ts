import type { Config } from "tailwindcss";

/**
 * ApplyForge — "Honest Signal".
 * Semantic colors map to the CSS variables defined in app/globals.css, which
 * are ported from the Open Design system at
 * open-design/design-systems/applyforge/. Use the semantic names
 * (bg / surface / fg / muted / border / accent / success / warn / danger / info)
 * instead of raw Tailwind palette colors so the whole app restyles from tokens.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          warm: "var(--surface-warm)",
        },
        fg: {
          DEFAULT: "var(--fg)",
          2: "var(--fg-2)",
        },
        muted: "var(--muted)",
        meta: "var(--meta)",
        border: {
          DEFAULT: "var(--border)",
          soft: "var(--border-soft)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          on: "var(--accent-on)",
          hover: "var(--accent-hover)",
          tint: "var(--accent-tint)",
        },
        success: {
          DEFAULT: "var(--success)",
          tint: "var(--success-tint)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          tint: "var(--warn-tint)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          tint: "var(--danger-tint)",
        },
        info: {
          DEFAULT: "var(--info)",
          tint: "var(--info-tint)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        raised: "var(--elev-raised)",
      },
      maxWidth: {
        container: "1040px",
      },
    },
  },
  plugins: [],
};

export default config;
