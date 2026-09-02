---
name: Virtual Staging
description: Generate a furnished variant of one listing photo into staged/. Ask which photo unless the user already named a file or a room that matches one image.
examplePrompt: Stage a listing photo — ask me which one first
category: staging
featured: true
---

# Virtual Staging

Create **one** photoreal staged variant of an **interior** listing photo. Originals stay in `images/`. Output goes to `cwd/staged/`.

**Image generation** is only available on **Codex CLI** (`gpt-image-2`) and **Grok Build** (`grok-imagine-image-2.0`). Claude and Kimi can read photos but cannot write a staged JPEG. If you are one of those, stop after the catalog and ask the user to switch the Agent picker.

**Exteriors are out of scope.** Never list them in the catalog and never generate a staged variant of an exterior, street view, facade, porch-from-outside, blueprint, floor plan, or detail crop. If the user names one of those, say it is excluded and ask them to pick an interior.

## Choose the photo first

1. Read `images/` and `images/.meta/*.json`.
2. Reply with **only** the catalog below — no preamble. The visible message starts with the heading.
3. **Stop** and wait for the pick.

Skip the ask only when this turn already names a specific **interior** file (`images/04.jpg`) or a room that matches **exactly one** interior photo. If several interiors match the room, list those in the same catalog format.

### Catalog format

Use a markdown numbered list. One photo per line. Number **only interiors** (`interior`, `kitchen`, `bedroom`, `bathroom`, and the same rooms with a `room` sidecar). Omit exteriors, blueprints, floor plans, and detail shots entirely — no Skip line.

```markdown
## Photos to stage

1. `04.jpg` — Living room — empty, beam ceiling, fireplace
2. `05.jpg` — Family room — fireplace, raised platform
3. `06.jpg` — Dining room — formal, bay window

Which photo? Number, filename, or room. Add a style if you want (`4 contemporary`).
```

## After they pick

1. Open that file and confirm the room.
2. Generate a staged variant: keep walls, windows, floors, and architecture; add or replace furniture and decor. Default style is a neutral, market-ready contemporary look unless they named one.
3. Write `staged/{stem}-staged.jpg` (or `staged/{stem}-{style}.jpg` when they named a style). If that name exists, increment (`-2`, `-3`).
4. Write `staged/.meta/{basename}.json` with the source path in `notes` and the same `role` / `room` as the original when known.
5. In chat, name the source file, the output path, and the style.

Done when `cwd/staged/{file}` exists and chat names both paths.

## Constraints

- Stage an interior photo that already exists under `cwd/images/`.
- Leave `property.json`, `images/`, and `listing.md` unchanged.
- One photo per run unless they asked for several interiors and named each.

## Output checklist

- [ ] User named an interior photo (this turn, or the reply after the ask)
- [ ] `cwd/staged/{file}` written
- [ ] Sidecar points back to the source image
- [ ] Chat names both paths
