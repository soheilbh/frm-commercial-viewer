# FRM Commercial Dashboard Viewer

Standalone read-only viewer for the **FRM Weekly Commercial Review** report. Uses the same React components, CSS, and export logic as the in-app dashboard so PNG/PDF output matches exactly.

## Features

- Browse saved weekly reports (no login, no run/re-run controls)
- Shareable URLs: `/?year=2026&week=26`
- A4 layout, KPI visibility, PNG export, PDF/print
- Server-side API proxy — key never exposed to the browser

## Local development

```bash
cp env.example.txt .env.local
npm install
npm run dev
```

Open http://localhost:8093

For Docker:

```bash
docker compose up -d --build
```

Open http://localhost:8092

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `FRM_API_BASE_URL` | **viewer** | frm-api base URL (server-side only) |
| `FRM_COMMERCIAL_VIEWER_API_KEY` | **viewer + frm-api** | Shared secret; unset = open (local/dev) |
| `COMMERCIAL_VIEWER_URL` | **frm-api** (optional) | CORS origin if browser calls API directly |

Production example (same VM as frm-ai):

```env
FRM_COMMERCIAL_VIEWER_API_KEY=your-shared-secret
```

`docker-compose.yml` joins `frm_ai_frm-ai-network` and uses `http://backend:8000` automatically — no second compose file, no `:18443`.

```env
# frm-ai stack (frm-api)
FRM_COMMERCIAL_VIEWER_API_KEY=your-shared-secret
COMMERCIAL_VIEWER_URL=http://10.52.10.192:8092
```

The viewer calls `/api/commercial-report/saved` on itself; Next.js proxies to frm-api `/quality-dashboard/commercial-report/viewer/saved` with the Bearer token.

## Docker / Portainer

1. Deploy this repo as stack `frm_commercial_viewer` (port **8092**, compose path `docker-compose.yml`).
2. **frm-ai must be running first** (creates `frm_ai_frm-ai-network`).
3. Set env on viewer stack:
   ```env
   FRM_COMMERCIAL_VIEWER_API_KEY=your-shared-secret
   ```
4. Set the **same** `FRM_COMMERCIAL_VIEWER_API_KEY` on **frm-api** and redeploy frm-ai.

No `FRM_API_BASE_URL` needed — compose uses `http://backend:8000` on the shared Docker network.

## Production URL

```
http://10.52.10.192:8092/?year=2026&week=26
```

## Backend

Requires saved reports in Postgres (generated from the main FRM AI platform).

Viewer endpoint (Bearer when key set):

`GET /quality-dashboard/commercial-report/viewer/saved?year=&week=`

Internal platform still uses:

`GET /quality-dashboard/commercial-report/saved?year=&week=`
