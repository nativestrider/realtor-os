# Web — Agent Instructions

Next.js App Router UI for RealtorOS property workflows.

## Routes

- `/` — property list dashboard (search, sort, add property menu)
- `/properties/[id]` — detail: photo gallery, comparables, facts, status, action rail, scoped chat

## Components

- `AppShell`, `AddPropertyMenu`, `PropertyCard`, `PropertyStatusSelect`
- `ComparablesPanel`, `ActionGrid`, `PhotoGallery`, `PropertyChat`
- Reuse streaming client in `src/lib/api.ts`

## UX rules

- Show connection/auth errors prominently (red banner)
- Action cards display skill `examplePrompt` and trigger property-scoped runs
- Refresh gallery when property files change after a run
- Listing status: draft (preparing), active (on market), sold (closed)
