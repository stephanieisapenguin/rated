---
name: build-server
description: Start (or restart) the local Rated dev servers — FastAPI backend on :8000 and Vite frontend on :5173 — from the repo's build/ directory. Kills any stale uvicorn/vite processes on those ports first so the restart is clean. Use whenever the user says "start the app", "start the build", "start the servers", "restart the dev servers", or "build server".
---

# build-server

Get both halves of the Rated app running locally. End state: backend reachable at <http://localhost:8000>, frontend at <http://localhost:5173>, both serving from `build/` in the canonical clone.

## Pre-flight

1. Find the canonical clone. In order of preference:
   - `~/Desktop/rated/work/rated/` (the working clone we set up)
   - Whatever `git rev-parse --show-toplevel` returns when run from the user's cwd
   - Ask the user if neither resolves
2. Confirm `build/` exists at that path. If you find the legacy `rated-integration-research-main/` instead, the rename hasn't been pulled — `git pull origin main` first.
3. Confirm tooling:
   - Python 3.9+ — backend's Makefile uses `python3`
   - Node — usually under nvm at `~/.nvm/versions/node/<version>/bin/`. Add to PATH inside the skill, don't rely on the user having sourced nvm in their non-interactive shell.

## Steps

### 1. Stop anything already on the ports

`uvicorn`/`vite` from previous sessions often linger and silently steal traffic. Kill them before starting fresh:

```bash
# Capture PIDs cleanly first so the kill list is auditable.
PIDS=$(lsof -nP -i :5173 -i :8000 -t 2>/dev/null | sort -u)
[ -n "$PIDS" ] && kill $PIDS
sleep 1
# Verify ports are free
lsof -nP -i :5173 -i :8000 2>/dev/null | grep LISTEN
```

If anything is still listening after the kill, escalate to `kill -9` for those PIDs.

### 2. Start the backend in the background

```bash
cd <repo-root>/build/backend
make install        # idempotent — only re-installs if requirements.txt changed
make dev            # uvicorn api:app --reload, listens on 0.0.0.0:8000
```

Run this with `run_in_background: true` so the next step can run in parallel.

### 3. Start the frontend in the background

```bash
export PATH=$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node/ | tail -1)/bin:$PATH
cd <repo-root>/build
npm install         # idempotent — npm ci is cleaner if package-lock.json was just modified
npm run dev         # vite, listens on :5173
```

Also `run_in_background: true`.

### 4. Wait for both to come up

```bash
until curl -fsS http://localhost:8000/ -m 1 >/dev/null 2>&1 \
   && curl -fsS http://localhost:5173/ -m 1 >/dev/null 2>&1; do
  sleep 0.4
done
```

Don't poll forever — bound the wait at ~30 seconds. If either fails to come up, dump the last 20 lines of that service's output file so the user can see the error.

### 5. Verify and report

```bash
# Backend health
curl -fsS http://localhost:8000/ | python3 -m json.tool
# Frontend served
curl -fsSI http://localhost:5173/ | head -1
# Sanity-check both are running from build/, not stale paths
lsof -p $(pgrep -f "uvicorn api:app" | head -1) | grep cwd
lsof -p $(pgrep -f "vite$" | head -1) | grep cwd
```

Report back with the URLs, current `users_registered` count from `/`, and the running PIDs / background-task IDs so the user can stop them later.

## When something goes wrong

- **`make install` fails on a fresh clone** → Python version mismatch. `make install PYTHON=python3.11` if 3.9 is too old for a dep.
- **`npm install` fails with EACCES on `node_modules/`** → leftover artifacts from a different user; `rm -rf node_modules && npm install`.
- **Port still busy after the kill** → check for `Code Helper`, `Google Chrome Helper`, etc. holding established connections; kill the actual listener PID, not the connection PID.
- **Frontend loads but errors on render** → React import / TDZ class of bugs. `git pull origin main` since the fixes are in `b6a71b0`+.
