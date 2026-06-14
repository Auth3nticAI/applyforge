# Deploying ApplyForge

The repo ships a [`render.yaml`](./render.yaml) Blueprint that provisions all three
tiers — Postgres, the FastAPI backend, and the Next.js frontend — on [Render](https://render.com)'s
free plan. Frontend can alternatively go on Vercel (see bottom).

## One-time deploy (Render Blueprint)

1. **Push to GitHub** (done) and sign in to Render with that GitHub account.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` and shows the three services.
3. **Set the secret**: on `applyforge-backend`, set `ANTHROPIC_API_KEY` to your Claude key.
4. **Apply.** Render builds the images and creates the database. First build takes a few minutes.
5. **Wire the two URLs** (they only exist after the first deploy):
   - On **applyforge-backend** → `ALLOWED_ORIGINS` = your frontend URL
     (e.g. `https://applyforge-frontend.onrender.com`). Save → it restarts; CORS now allows the browser.
   - On **applyforge-frontend** → `NEXT_PUBLIC_API_URL` = your backend URL
     (e.g. `https://applyforge-backend.onrender.com`). Save → **Manual Deploy → Clear build cache & deploy**
     (this value is baked into the bundle at build time, so it needs a rebuild).
6. Open the frontend URL. The backend auto-seeds demo data on first boot, so it opens populated.

## 💸 Cost safety (important for a public demo)

The backend calls the Claude API with **your** key, so a public URL means strangers can spend your
credits. Before sharing the link:

- Set a **spend limit** in the [Anthropic console](https://console.anthropic.com/settings/limits).
- Render's free web services **sleep after ~15 min idle**, which caps casual abuse but isn't a control.
- For a hardened demo, add basic auth or a per-IP rate limit in front of the `/ai/*` routes.

## Config reference

| Variable | Service | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | Wired automatically from the Render Postgres instance |
| `ANTHROPIC_API_KEY` | backend | Your Claude key (secret) |
| `ALLOWED_ORIGINS` | backend | Comma-separated browser origins allowed by CORS; defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL, baked into the browser bundle at build time |

## Frontend on Vercel (alternative)

Import the repo in Vercel, set **Root Directory** = `frontend`, add env var
`NEXT_PUBLIC_API_URL` = your Render backend URL, and deploy. Then add the Vercel domain to the
backend's `ALLOWED_ORIGINS`.

## Local (unchanged)

```bash
docker compose up --build   # http://localhost:3000, API at http://localhost:8000/docs
```
