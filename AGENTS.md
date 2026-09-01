# RealtorOS — Agent Instructions

RealtorOS helps real estate agents sell properties faster. Each **property** is a project with its own folder on disk.

## Core rules

1. **Properties are projects.** All work for a listing happens inside that property's workspace folder (`cwd`).
2. **Never invent MLS facts.** Only record data you extracted from a source or that the user provided.
3. **Save outputs to disk.** Write `property.json`, images under `images/`, type sidecars under `images/.meta/`, staged variants under `staged/`, copy under `listing.md`, import summary under `import-report.md`.
4. **Use skills.** When a skill is active, follow its workflow in `.realtor-skills/<skill-id>/SKILL.md`.
5. **Browser tools for Zillow only** when the user supplied a Zillow URL for import — do not scrape other sites unprompted.
6. **Supervised browser** — when a site shows login, CAPTCHA, or “prove you are human”, **stop and ask the user** to complete it in the browser window. Wait for their confirmation before continuing. Never bypass or script around these challenges.
7. **Single session** — work only in the current run. Never mention “peer sessions”, “other agents”, or coordinate with parallel workers. If `property.json` / `images/` already exist, read and use them.
8. **Reference paths relative to `cwd`** when discussing files with the user.

## Property workspace layout

```
property/
├── property.json      # structured listing facts
├── source.json        # import provenance (URL, fetchedAt)
├── images/            # original photos (01.jpg, 02.jpg, …)
├── images/.meta/      # per-image type proposals ({basename}.json)
├── staged/            # virtual staging outputs
├── listing.md         # marketing copy
├── import-report.md   # post-import summary + data quality flags
├── comps/             # competing listings (one JSON per comp)
└── .realtor-skills/   # staged skill copies for this run
```

## Layer docs

- `docs/INSTALL.md` — full software stack, backup/restore, reinstall checklist
- `packages/daemon/AGENTS.md` — API, SQLite, skills, prompt composition
- `apps/web/AGENTS.md` — property UI, action panel, gallery
