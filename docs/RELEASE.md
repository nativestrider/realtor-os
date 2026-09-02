# RealtorOS — Releases & channels

## Channels

| Channel | Who | Git ref | Lockfile |
|---------|-----|---------|----------|
| **stable** (default) | End users | Latest tag (`v0.1.0`) | `--frozen-lockfile` |
| **beta** | Early testers | `beta` branch | `--frozen-lockfile` |
| **dev** | Developers | `main` branch | `pnpm install` (may drift) |

**This repository is the dev channel** — running `bash scripts/install.sh` or `bash scripts/launch-wizard.sh` from a checkout auto-selects `dev`.

### Install by channel

```bash
# Stable (recommended)
curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash

# Beta
REALTOR_CHANNEL=beta curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash

# Dev (main)
REALTOR_CHANNEL=dev curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
```

Config lives in `scripts/realtor-channels.env` on `main` (stable pointer updated on each release).

## What is pinned (stable / beta)

| Piece | Source |
|-------|--------|
| App version | `package.json` + channel config |
| Git checkout | Channel → tag or branch |
| npm packages | `pnpm-lock.yaml` (`pnpm install --frozen-lockfile`) |
| Node.js | `.node-version` (via fnm) |
| pnpm | `packageManager` in `package.json` |

Dev channel uses `main` and allows lockfile updates during `pnpm install`.

## Cut a stable release

```bash
bash scripts/bump-version.sh 0.1.1
git add package.json scripts/realtor-release.env scripts/realtor-channels.env
git commit -m "Release v0.1.1."
git tag v0.1.1
git push github main && git push github v0.1.1
```

## Overrides

| Variable | Effect |
|----------|--------|
| `REALTOR_CHANNEL=stable\|beta\|dev` | Pick channel |
| `REALTOR_GIT_REF=v0.1.0` | Exact tag or branch (overrides channel) |
| `REALTOR_BRANCH=main` | Legacy alias for `REALTOR_GIT_REF` |

Installed channel is saved in `~/.realtor-os/install.env`.
