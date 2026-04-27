---
name: fetch-netlify
description: Fetch Netlify deploy state, build logs, environment variables, and site metadata for the Rated frontend. Use when the user says "check Netlify", "fetch netlify", "what's deployed", "check the deploy", "show netlify env", "netlify status", or asks anything about the production frontend's deploy state.
---

# fetch-netlify

Surface the live state of the Rated app's Netlify deploy — site link, last deploy status, build logs on failure, env vars — without leaving the terminal.

## Pre-flight

Netlify CLI is installed via npm under `nvm`, so it isn't on the default PATH for non-interactive shells. Set PATH first, every call:

```bash
export PATH=$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node/ | tail -1)/bin:$PATH
netlify --version       # expect netlify-cli/25.x or newer
```

If `netlify` still isn't found, install it: `npm install -g netlify-cli`.

## Auth

The CLI needs a personal access token. Check first; only prompt if missing:

```bash
netlify status 2>&1 | head -5
```

If the output starts with `Not logged in`, tell the user to run `netlify login` themselves — it opens a browser and writes a token to `~/.netlify/config.json`. Don't run it inside the skill (interactive). Once logged in, every subsequent skill call works without prompts.

## Steps — pick the ones matching the user's question

### "What's the current state?"
```bash
netlify status
netlify sites:list --json | python3 -m json.tool | head -40
```

Shows: linked site name, admin URL, primary URL, account, custom domains.

### "Show me the latest deploys"
```bash
SITE_ID=$(netlify api getSite --data='{}' 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
netlify api listSiteDeploys --data="{\"site_id\":\"$SITE_ID\",\"per_page\":5}" \
  | python3 -c "
import sys, json
for d in json.load(sys.stdin):
    state = d['state']
    print(f\"{state:10} {d['created_at']:25} {d.get('branch','?'):20} {(d.get('commit_ref') or '?')[:7]}  {d.get('deploy_ssl_url') or d['ssl_url']}\")
"
```

Last 5 deploys with state (`ready`, `error`, `building`), branch, commit, URL.

### "What broke?" (build/deploy failed)
```bash
SITE_ID=$(netlify api getSite --data='{}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
DEPLOY_ID=$(netlify api listSiteDeploys --data="{\"site_id\":\"$SITE_ID\"}" \
  | python3 -c "import sys,json;print(next(d['id'] for d in json.load(sys.stdin) if d['state']=='error'))")
netlify api getSiteDeploy --data="{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$DEPLOY_ID\"}" \
  | python3 -m json.tool | head -60
```

For full live build output use `netlify watch` while a build is in progress — it streams the log.

### "Show me the env vars"
```bash
netlify env:list                    # current site, current context, values redacted
netlify env:list --context production
netlify env:list --json | python3 -m json.tool   # values revealed — handle carefully
```

Don't print secret values to the user unless they explicitly ask. `netlify env:list` redacts by default; `--json` reveals them.

### "Trigger a deploy"
```bash
netlify deploy --prod              # production — confirm with user before running
netlify deploy                     # preview / draft
netlify deploy --dry               # dry-run, no upload
```

Always confirm with the user before `--prod`. Treat it as destructive (reaches end users).

### "Open the dashboard"
```bash
netlify open
netlify open:admin
```

## Site linking

If `netlify status` says "no site" the repo isn't linked. From the repo root:

```bash
cd <repo-root>
netlify link            # picks an existing site or creates one
netlify init            # creates a site fresh and wires up Git auto-deploys
```

Both write `.netlify/state.json` — already gitignored, stays per-developer.

## Reporting back

Keep responses tight: site URL, last deploy state + commit, env-var count + names (not values), any open PRs awaiting deploy. If the latest deploy is `error`, paste the relevant log lines — not the whole 500-line dump.
