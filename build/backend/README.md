# Backend (FastAPI + SQLAlchemy)

FastAPI service for the Rated app. Storage: SQLAlchemy → SQLite locally
(`rated.db`), Postgres in production (set `DATABASE_URL`).

Files:

- `api.py` — FastAPI routes. Each handler injects a session via `Depends(get_db)`.
- `rated_backend.py` — service layer (AuthService, RankingService, …). Each
  method takes a `Session` and returns ORM rows.
- `models.py` — SQLAlchemy ORM models (`UserRow`, `MovieRow`, `RankingRow`, …).
- `db.py` — engine, sessionmaker, `get_db` FastAPI dependency, `init_db` for
  schema creation.

## Local development

```bash
cd backend
make install   # creates .venv, installs requirements.txt
make dev       # uvicorn api:app --reload on http://localhost:8000
```

Health check: `curl http://localhost:8000/` → `{"status":"ok",...}`.

OpenAPI docs auto-served at `http://localhost:8000/docs`.

## Make targets

| Target       | What it does |
|--------------|--------------|
| `install`    | Create `.venv` and `pip install -r requirements.txt` |
| `dev`        | `uvicorn api:app --reload` (autoreload, local only) |
| `run`        | `uvicorn api:app` (no reload) |
| `test`       | `pytest -q` |
| `lint`       | `ruff check .` |
| `format`     | `ruff check --fix .` + `black .` |
| `typecheck`  | `mypy .` |
| `freeze`     | `pip freeze > requirements.lock` |
| `db-reset`   | `rm -f rated.db` (next start re-seeds fixtures) |
| `db-shell`   | Open `sqlite3` REPL on the dev DB |
| `migrate`    | `alembic upgrade head` — apply pending migrations |
| `migrate-down` | `alembic downgrade -1` — roll back one migration |
| `migration`  | `make migration MSG="..."` — autogenerate from model diff |
| `clean`      | Remove venv + caches |

Override defaults: `make dev PORT=8001 HOST=127.0.0.1`.

## Schema migrations (Alembic)

Schema changes flow through Alembic. The `init_db()` call at startup still
runs `Base.metadata.create_all()` for fast local dev (matches whatever
models.py says today), but **for production, always run migrations**:

```bash
# After editing a model in models.py
make migration MSG="add foo column to users"   # autogenerates a versions/*.py
# Review the file, edit if needed
make migrate                                   # applies it locally
git add migrations/versions/
git commit
```

Production deploys (Render / Fly etc.) should run `alembic upgrade head` as
a pre-deploy hook before starting the app, so the DB schema lines up with
the code being deployed.

To roll back: `make migrate-down` (one migration) or
`alembic downgrade <revision-id>`.

## API surface

See `api.py` for full route list. Highlights:

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/` | Health |
| GET    | `/movies` | List seeded movies |
| GET    | `/movies/top` | Top-ranked |
| POST   | `/auth/login` | Exchange Google id_token for session_token |
| POST   | `/auth/username` | Claim username (requires session_token) |
| GET    | `/users/{id}/feed` | Activity feed from followed users |
| POST   | `/users/{id}/rankings` | Add a 1–10 ranking |
| POST   | `/users/{id}/follow` | Follow another user |
| POST   | `/users/{id}/saved` | Save a movie |
| POST   | `/users/{id}/reviews` | Submit a review |

Auth is **stubbed** today — `/auth/login` accepts any `id_token` shaped like
`sub|name|email` and returns a deterministic session token. See "Production gaps"
below.

## Deployment

Netlify Functions don't run Python servers, so the backend lives elsewhere.
The frontend (on Netlify) calls it via `VITE_API_BASE_URL`.

### Recommended: Render (free tier)

1. Push this repo to GitHub.
2. In Render → New → Web Service → connect this repo.
3. Set:
   - **Root Directory**: `build/backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn api:app --host 0.0.0.0 --port $PORT`
   - **Environment**: copy keys from `.env.example`
4. After deploy, Render gives you a URL like `https://rated-api.onrender.com`.
5. In Netlify → Site settings → Environment variables, set
   `VITE_API_BASE_URL = https://rated-api.onrender.com` and redeploy the frontend.

Alternative hosts that work the same way: Railway, Fly.io, Heroku.

### Hooking up Netlify DB (Neon Postgres)

The data layer is already SQLAlchemy. Swapping SQLite → Postgres is one env var:

1. Netlify → Extensions → enable "Neon" (provisions Netlify DB).
2. Copy the connection string from Netlify → Site settings → Environment.
3. In Render (or whatever host) → Environment → set
   `DATABASE_URL=postgresql+psycopg://user:pass@host/dbname` (note `+psycopg`
   driver prefix). Append `psycopg[binary]==3.x` to `requirements.txt`.
4. Restart. `init_db()` calls `Base.metadata.create_all()` which creates the
   schema in Postgres on first boot. No code change.

For schema migrations (production), add Alembic when the model stops changing
shape weekly.

## Production gaps (TODO)

- **Auth**: replace stub with real Google JWT verification (`google-auth` lib),
  then layer on Netlify Identity / OIDC if we want Netlify-managed sessions.
- **Schema migrations**: SQLAlchemy creates tables but there's no Alembic yet.
  Add it before the model schema starts changing in production.
- **CORS**: currently `["*"]`; switch to `ALLOWED_ORIGINS` env var.
- **Session tokens**: currently `sha256(user_id + timestamp)`; switch to
  `secrets.token_urlsafe(32)` stored in a sessions table with expiry.
- **Logging / observability**: no logging today. Add `structlog` + Sentry.
- **Rate limiting**: none. Add `slowapi` for login + write endpoints.
