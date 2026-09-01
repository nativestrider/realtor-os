# RealtorOS — Installation & reinstall guide

Use this document to set up RealtorOS on a new machine or after wiping the system. It lists **every piece of software**, where data lives on disk, and how to verify the install.

For day-to-day usage see [README.md](../README.md). For guided first-time setup, run `bash scripts/launch-wizard.sh`.

---

## Repository vs local data

| In git (clone on each machine) | Not in git (copy manually) |
|--------------------------------|----------------------------|
| Source: `packages/`, `apps/`, `skills/`, `scripts/` | `~/.realtor-os/realtor.db` |
| `docs/INSTALL.md`, `pnpm-lock.yaml` | `~/.realtor-os/properties/` (photos, `property.json`, …) |
| | `~/.realtor-os/user-settings.json` |
| | `~/.realtor-os/browser.json` — **re-run** `pnpm run setup:browsers` on each OS |

```bash
git clone https://origin.cursor.com/nativestride/realtor-os.git RealtorOS
cd RealtorOS
```

**Cursor codebase:** https://cursor.com/codebase/nativestride/realtor-os

---

## Software stack

| Component | Required? | Version | Purpose | Install |
|-----------|-----------|---------|---------|---------|
| **Node.js** | Yes | 20+ (LTS) | Runtime for daemon, web UI, scripts | https://nodejs.org/en/download |
| **pnpm** | Yes | 10.28+ (see `packageManager` in root `package.json`) | Monorepo package manager | `corepack enable && corepack prepare pnpm@10.28.0 --activate` or https://pnpm.io/installation |
| **Git** | Recommended | any recent | Clone/update the repo | https://git-scm.com/downloads |
| **Claude Code CLI** | One of three | latest | `claude` agent | https://docs.anthropic.com/en/docs/claude-code/overview |
| **Codex CLI** | One of three | latest | `codex` agent (OpenAI / ChatGPT) | https://developers.openai.com/codex/cli/ |
| **Kimi Code CLI** | One of three | latest | `kimi` agent | https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html |
| **Playwright Chromium** | Yes for Zillow | bundled via repo | Visible browser for Zillow import/verify | `pnpm run setup:browsers` (after `pnpm install`) |
| **Linux Chromium deps** | Linux only, if browser fails | — | System libraries for headful Chromium | `pnpm run setup:browsers:deps` |

You need **at least one** of Claude / Codex / Kimi on your `PATH`. Install all three only if you plan to switch between them.

### What is *not* required

- **Cursor IDE browser MCP** — not available to agents spawned by RealtorOS chat. Zillow uses Playwright Chromium instead.
- **System Google Chrome** — optional; RealtorOS uses its own Chromium build.
- **Cloud APIs** for user memory — profile and memories are stored locally.

### Codex model note (ChatGPT login)

In the app Model dropdown, prefer **GPT-5.4**. The “Default” model may be at capacity. `gpt-5.3-codex` and `o4-mini` typically need API billing, not ChatGPT login.

---

## Fresh install (step by step)

### 1. Clone the repository

```bash
git clone https://origin.cursor.com/nativestride/realtor-os.git RealtorOS
cd RealtorOS
```

On **macOS** (e.g. MacBook Air): same steps — no Linux `DISPLAY` setup; run `pnpm run setup:browsers` once for the Mac Chromium build.

### 2. Install Node dependencies

```bash
pnpm install
```

This installs the monorepo (`packages/daemon`, `packages/cli`, `packages/contracts`, `apps/web`) and dev tools including Playwright (npm package only — browser binary is a separate step).

### 3. Install Playwright Chromium (Zillow)

```bash
pnpm run setup:browsers
```

On Linux, if the browser window does not open:

```bash
pnpm run setup:browsers:deps
```

Creates:

- `~/.realtor-os/browser.json` — Chromium path manifest
- `~/.realtor-os/browser.env` — shell-friendly env vars

Skip with `REALTOR_SKIP_BROWSER_INSTALL=1` only if you will not use Zillow import/verify.

### 4. Install and sign in to AI CLIs

Install the CLIs you use, then authenticate once per machine:

| Agent | Install check | Sign in |
|-------|---------------|---------|
| Claude | `claude --version` | `claude auth login` — verify: `claude auth status` |
| Codex | `codex --version` | `codex login` — verify: `codex login status` |
| Kimi | `kimi --version` | `kimi login` — credentials under `~/.kimi-code/credentials/` |

### 5. Start the app

**Guided (recommended for first run):**

```bash
bash scripts/launch-wizard.sh
```

**Manual:**

```bash
pnpm dev
# or
./packages/cli/bin/realtor.mjs web
```

Open the printed URL (`http://127.0.0.1:<port>/#token=...`). The token is also stored in `~/.realtor-os/server.token`.

### 6. Verify

```bash
# Core toolchain
node --version          # v20+
pnpm --version          # 10+

# At least one agent
command -v claude || command -v codex || command -v kimi

# Zillow browser
test -f ~/.realtor-os/browser.json && echo "browser ok"

# Health (while app is running; use your daemon port)
curl -s -H "Authorization: Bearer $(cat ~/.realtor-os/server.token)" \
  http://127.0.0.1:7457/api/health
```

In the UI: create a property, send a chat message, and (optional) run **Verify / update from Zillow** on a listing with a Zillow URL.

---

## Data on disk (backup before reinstall)

RealtorOS keeps **application data** under `~/.realtor-os/` (override with `REALTOR_DATA_DIR`).

| Path | Contents |
|------|----------|
| `~/.realtor-os/realtor.db` | SQLite — conversations, messages, property index |
| `~/.realtor-os/server.token` | Local API auth token (regenerated on fresh install if missing) |
| `~/.realtor-os/user-settings.json` | Profile, style, pinned memories, listing/media settings |
| `~/.realtor-os/browser.json` | Playwright Chromium manifest |
| `~/.realtor-os/browser.env` | `REALTOR_CHROMIUM_EXECUTABLE` etc. |
| `~/.realtor-os/properties/<id>/` | Per-listing workspace — **back this up** |

Each property folder typically contains:

```
property.json
source.json
listing.md
import-report.md
images/
images/.meta/
staged/
comps/
.realtor-skills/
```

**Repo-local (optional) preferences** from the launch wizard:

| Path | Contents |
|------|----------|
| `.realtor-preferences.env` | Selected agents and default models |
| `apps/web/public/realtor-preferences.json` | Defaults exposed to the web UI |

### Backup command

```bash
tar czvf realtor-os-backup-$(date +%Y%m%d).tar.gz \
  -C "$HOME" .realtor-os \
  -C /path/to/RealtorOS .realtor-preferences.env apps/web/public/realtor-preferences.json
```

### Restore after reinstall or Mac migration

1. `git clone` (or `git pull` on an existing checkout).
2. `pnpm install` + `pnpm run setup:browsers` on the **new** machine (do not copy Linux `browser.json` to Mac).
3. Copy `~/.realtor-os/` from the old machine (`rsync`, AirDrop, or tarball — see backup below).
4. Reinstall and sign in to AI CLIs (`claude` / `codex` / `kimi`).
5. Start with `pnpm dev` or `bash scripts/launch-wizard.sh`.

If you restore `server.token`, old bookmarked URLs with `#token=...` keep working. If you let the app create a new token, use the new URL printed on startup.

---

## Environment variables

| Variable | Default | Set by | Purpose |
|----------|---------|--------|---------|
| `REALTOR_DATA_DIR` | `~/.realtor-os` | user / daemon | All app data |
| `REALTOR_REPO_ROOT` | repo root | `realtor web` launcher | Path to `scripts/zillow-browser-snapshot.mjs` |
| `REALTOR_CHROMIUM_EXECUTABLE` | from `browser.json` | `setup:browsers` / launcher | Playwright Chromium binary |
| `REALTOR_DISPLAY` | auto on Linux | user / launcher | Force X11 display (e.g. `:1` from `who`) |
| `DISPLAY` / `XAUTHORITY` | — | launcher auto-detect | Required on Linux for visible Chromium |
| `REALTOR_BIND_HOST` | `127.0.0.1` | user | Bind address |
| `REALTOR_WEB_PORT` | `7456` | user | Next.js port |
| `REALTOR_DAEMON_PORT` | `7457` | user | Express API port |
| `REALTOR_DAEMON_URL` | — | launcher | Web → daemon proxy target |
| `REALTOR_API_TOKEN` | — | launcher | Web → daemon auth |
| `REALTOR_SELECTED_AGENTS` | — | wizard | Comma-separated `claude,codex,kimi` |
| `REALTOR_MODEL_CLAUDE` / `_CODEX` / `_KIMI` | — | wizard | Default models |
| `REALTOR_SKIP_BROWSER_INSTALL` | — | user | Skip Chromium download in install script |

Zillow snapshot script (from a property workspace):

```bash
node "$REALTOR_REPO_ROOT/scripts/zillow-browser-snapshot.mjs" "<zillow-url>" .
```

Writes `zillow-snapshot.png` and `zillow-snapshot.txt` in the property folder.

---

## Reinstall checklist

Use this after a new OS install or new computer:

- [ ] Node.js 20+ installed
- [ ] pnpm 10+ installed
- [ ] Repository cloned
- [ ] `pnpm install` completed
- [ ] `pnpm run setup:browsers` completed (`browser.json` exists)
- [ ] Linux: `setup:browsers:deps` if Chromium fails to launch
- [ ] At least one of `claude`, `codex`, `kimi` on PATH and signed in
- [ ] Codex users: default model **GPT-5.4** in Settings or wizard
- [ ] `~/.realtor-os` restored from backup (if applicable)
- [ ] `bash scripts/launch-wizard.sh` or `pnpm dev` starts without errors
- [ ] Browser opens dashboard; chat returns a response
- [ ] Zillow verify opens visible Chromium (optional smoke test)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `claude` / `codex` / `kimi` not found | Install CLI from links above; restart shell |
| Codex exits with code 1 | Switch model to **GPT-5.4**; check `codex login status` |
| Zillow agent says no browser | Run `pnpm run setup:browsers`; confirm `~/.realtor-os/browser.json` |
| Missing X server / `$DISPLAY` (Linux) | Log into desktop session; restart `realtor web` (auto-detects `:1` etc.); or `export REALTOR_DISPLAY=:1` before start. Check with `who`. **Do not** use Xvfb for CAPTCHA. |
| Chromium won't open on Linux | `pnpm run setup:browsers:deps` |
| 401 on API | Use URL with `#token=...` or read token from `server.token` |
| Port in use | `realtor web --port 7458 --daemon-port 7459` |
| Lost properties but have folders | Restore `realtor.db` from backup or re-import folders via UI |

---

## npm scripts reference

| Script | Command | When |
|--------|---------|------|
| Dev server | `pnpm dev` | Daily development |
| Build | `pnpm build` | Production build |
| Typecheck | `pnpm typecheck` | CI / pre-commit |
| Browser setup | `pnpm run setup:browsers` | After install; after OS reinstall |
| Browser deps (Linux) | `pnpm run setup:browsers:deps` | Chromium launch failures |
| Launch wizard | `bash scripts/launch-wizard.sh` | First-time or full re-setup |

---

## Git workflow (developers)

```bash
git pull
pnpm install          # after lockfile changes
pnpm run setup:browsers   # after OS change only
pnpm dev
```

Commit code changes in the repo; never commit `~/.realtor-os/` or `.realtor-preferences.env`.
