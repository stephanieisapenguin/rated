# Rated

Movie ranking app — React frontend + FastAPI backend.

## Quick Start

```bash
# 1. Start the backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# 2. Start the frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` (or next available port).
Backend API docs at `http://localhost:8000/docs`.

The Vite dev server proxies `/api/*` to the backend automatically.

## Running Tests

```bash
# Backend
cd backend
source .venv/bin/activate
pytest tests/ -v

# Frontend
cd frontend
npm run lint
```

## Production Build

```bash
cd frontend
npm run build     # outputs to dist/
npm run preview   # preview the build locally
```

## Deploy with Docker Compose

```bash
cd backend
docker compose up --build
```

This starts the API on port 8000 and a Redis instance on 6379.
To serve the frontend, deploy the `dist/` folder to any static host (Netlify, Vercel, Cloudflare Pages, S3+CloudFront, etc.) and point it at your API URL.

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_TMDB_API_KEY` | Frontend `.env` | TMDB API key for live movie data (optional — app works with built-in catalog) |
| `REDIS_URL` | Backend (Docker) | Redis connection string (set automatically by Docker Compose) |

## PR Preview Deployments

Pull requests automatically get a preview deployment via GitHub Actions + GitHub Pages. The workflow builds the frontend and deploys it to a unique URL posted as a PR comment. See `.github/workflows/preview.yml`.
