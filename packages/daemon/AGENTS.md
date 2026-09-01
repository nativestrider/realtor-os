# Daemon — Agent Instructions

Express API authority for RealtorOS. Owns SQLite, property workspaces, skills registry, and chat runs.

## Key modules

- `src/server.ts` — app composition, auth, route mounting
- `src/db.ts` — conversations, messages, runs, properties, assets
- `src/runner.ts` — spawn CLIs, stream events, prompt composition
- `src/skills.ts` — scan `skills/`, stage to `.realtor-skills/`
- `src/prompts/compose.ts` — AGENTS.md + mission + skill + property context
- `src/routes/properties.ts` — property CRUD, import, actions, file serving

## Data root

Resolved from `REALTOR_DATA_DIR` or `~/.realtor-os`. Properties live under `{dataDir}/properties/{id}/`.

## API additions

- `GET/POST /api/properties`
- `POST /api/properties/import-zillow`
- `GET /api/properties/:id`, `GET /api/properties/:id/files`
- `POST /api/properties/:id/actions/:skillId`
- `GET /api/skills`

Keep DTOs in `@realtor-os/contracts`.
