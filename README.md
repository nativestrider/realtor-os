# RealtorOS

Multi-agent web chat for local CLI harnesses: **Claude Code**, **Codex**, **Kimi**, and **Grok Build**.

Inspired by [open-design](https://github.com/nexu-io/open-design) runtime adapters and the `kimi web` entry pattern.

## Repository

Source code is versioned in git. Application data (listings, photos, SQLite) lives in `~/.realtor-os/` and is **not** in the repo — back it up separately when moving machines.

### Getting the code

**Public clone (no account):**

```bash
git clone https://github.com/nativestrider/realtor-os.git RealtorOS
cd RealtorOS
bash scripts/launch-wizard.sh
```

| Method | Account needed? |
|--------|-----------------|
| **GitHub** (public) | No — anyone can `git clone` the URL above |
| **Cursor origin** (private copy) | Yes — [Cursor](https://cursor.com) login + `origin auth login` |
| **Copy the folder** (USB, AirDrop, zip) | No — run the wizard inside the folder |

Cursor Origin does **not** offer public repositories (only Internal/Private). The GitHub repo is the public source; Cursor origin stays in sync for your private Cursor workflow:

```bash
# Optional — private Cursor remote (requires login)
origin auth login
git clone https://origin.cursor.com/nativestride/realtor-os.git RealtorOS
```

- **GitHub:** https://github.com/nativestrider/realtor-os  
- **Cursor codebase:** https://cursor.com/codebase/nativestride/realtor-os

The wizard installs **Node.js**, **Git** (optional), **pnpm**, **Playwright Chromium**, and the **AI CLIs you pick** (Claude, Codex, Kimi, Grok) — you do not need to install those manually first.

**Move to another computer:** clone or copy the folder, copy `~/.realtor-os/`, then run the wizard.

## Quick start

### One command (Mac or Linux)

Downloads the app and runs the wizard. Default install folder: **`~/RealtorOS`** (not your current Terminal folder). Listings live in `~/.realtor-os`. Does not use sudo.

```bash
curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
```

On Mac, the one-liner opens **Finder** to choose the install folder when possible. To install somewhere specific (e.g. `~/Developer/realtor-os`):

```bash
REALTOR_INSTALL_DIR="$HOME/Developer/realtor-os" curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
```

Or download first so all prompts work in the Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh -o /tmp/realtor-install.sh
bash /tmp/realtor-install.sh
```

After setup, start anytime with **`realtor-os`** (if `~/.local/bin` is on your PATH).

**Windows (PC):** open PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.ps1 | iex"
```

Installs to `%USERPROFILE%\RealtorOS` — no admin. Start with `realtor-os`.  
**macOS / Linux / WSL:** `curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash`

**New machine or OS reinstall?** See **[docs/INSTALL.md](docs/INSTALL.md)** for backup paths and the full checklist.

**New here?** Run the guided setup wizard (recommended for non-technical users):

```bash
bash scripts/launch-wizard.sh
```

The wizard checks dependencies, confirms which AI assistants and models you want, verifies sign-in, and opens the app in your browser.

```bash
pnpm install
pnpm run setup:browsers   # required for Zillow import / verify
pnpm dev
# or
./packages/cli/bin/realtor.mjs web
```

Open the printed URL. On first launch, the browser URL includes `#token=...` for local auth.

## Commands

```bash
realtor web                 # start daemon + web UI, open browser
realtor web --no-open       # start without opening browser
realtor web --port 7456     # fixed web port
realtor web --daemon-port 7457
```

## Architecture

- `packages/daemon` — Express API, SQLite, runtime adapters, SSE chat, property workspace
- `apps/web` — Next.js property dashboard + detail UI (proxies `/api/*` to daemon)
- `packages/cli` — `realtor web` launcher
- `packages/contracts` — shared types
- `skills/` — agent workflows (Zillow import, listing copy, staging, …)

## Property workspace

Each listing is a project under `~/.realtor-os/properties/{id}/` with `property.json`, photos, comparables (`comps/`), and agent outputs. Open the dashboard at `/` after `pnpm dev`.

## Requirements

See **[docs/INSTALL.md](docs/INSTALL.md)** for the complete stack (Node, pnpm, AI CLIs, Playwright Chromium), backup/restore, and verification steps.

Summary:

- Node.js 20+, pnpm 10+
- At least one CLI on PATH: `claude`, `codex`, `kimi`, or `grok`
- **Playwright Chromium** for Zillow — `pnpm run setup:browsers` after `pnpm install`
- **Codex (ChatGPT):** use model **GPT-5.4** in the app

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/agents` | Detect installed CLIs |
| `GET /api/conversations` | List chats |
| `POST /api/conversations` | Create chat |
| `POST /api/chat` | Send message (SSE) |
| `POST /api/runs/:id/cancel` | Cancel active run |
| `GET /api/settings` | User profile and memory settings |
| `PATCH /api/settings` | Update profile, style, pinned memories, learn-from-chats toggle |
| `PATCH /api/conversations/:id` | Switch agent/model (keeps message history) |
| `POST /api/conversations/:id/memories` | Extract user facts from chat into local memory |
| `GET /api/properties` | List properties (summaries with photo/comp counts) |
| `POST /api/properties` | Create blank property |
| `PATCH /api/properties/:id` | Update title, address, or status (`draft` / `active` / `sold`) |
| `POST /api/properties/import-zillow` | Create from Zillow URL (zpid dedup) |
| `POST /api/properties/import-folder` | Create from uploaded folder (multipart) |
| `GET /api/properties/:id` | Property detail + assets + comparables |
| `GET/POST /api/properties/:id/comps` | List or add comparables |
| `POST /api/properties/:id/actions/:skillId` | Run skill (SSE) |
| `GET /api/skills` | List available skills |

Local token: `~/.realtor-os/server.token`

## User memory

Profile and preferences live in `~/.realtor-os/user-settings.json`. Open **Settings** in the app to set your name, communication style, and pinned facts.

On a property chat, click **Remember from chat** when you want the agent to pull durable facts about you from that thread into local memory (no cloud API). Saved facts apply across future chats and agent switches.

## Development

```bash
pnpm typecheck
pnpm --filter @realtor-os/daemon exec tsx src/bin/daemon.ts
pnpm --filter @realtor-os/web dev
```
