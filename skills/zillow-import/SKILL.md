---
name: Import from Zillow
description: Extract listing facts and photos from a user-provided Zillow URL using browser tools.
examplePrompt: Import this Zillow listing and save all photos to images/
category: import
featured: true
---

# Zillow Import

Import a single Zillow listing into the current property workspace using **supervised browser tools**.

## Trigger

The user provides a Zillow homedetails URL, for example:
`https://www.zillow.com/homedetails/57-68-Mazeau-St-Maspeth-NY-11378/2056680900_zpid/`

## Constraints

- Only scrape the **exact URL the user supplied**. Do not browse other listings or sites.
- Respect Zillow Terms of Service. This is a one-off supervised import, not bulk scraping.
- Never invent MLS facts. If a field is missing on the page, omit it from `property.json`.
- **Never bypass bot checks.** Do not use headless workarounds, alternate hosts, or scrape APIs to avoid Zillow’s UI.

## Supervised browser (required)

This import is **human-in-the-loop**. You drive the browser; the user handles anything that requires a real person.

1. **Open a visible browser** (Playwright/Chromium or MCP browser tools) and navigate to the listing URL.
2. **Snapshot the page** and read what is on screen.
3. If you see any of the following, **stop automation immediately** and message the user clearly:
   - “Press & Hold to confirm you are a human” / PerimeterX / bot challenge
   - Login or sign-in prompt
   - CAPTCHA, checkbox, or cookie consent that blocks the listing
   - Blank page, access denied, or listing content not visible
4. **Ask the user in plain language**, for example:
   > “Zillow is asking you to prove you’re human. Please click **Press & Hold** (or complete the challenge) in the browser window, then reply **done** when the full listing is visible.”
5. **Wait** for the user to reply (`done`, `ok`, `ready`, etc.) before taking another snapshot or extracting data.
6. If the challenge appears again, repeat step 4 — do not guess or retry in a loop more than once without user input.
7. Only after the user confirms the listing is visible: extract fields, download photos, write files.

Do **not** tell the user the import failed until you have asked them to try the human step at least once.

## Verify existing import (no full re-import)

When `property.json` and `images/` already exist, the user may ask to **verify** or **update** against Zillow — not scrape from scratch.

1. Read what is on disk first (`property.json`, `images/`, `images/.meta/`, `source.json`).
2. Open the listing URL in the supervised browser and compare fields to `property.json`.
3. **Update** `property.json` only for fields that differ on Zillow (faithful copy).
4. **Do not** re-download all photos or wipe `images/.meta/` unless the user explicitly asks to re-import.
5. Download **only missing** gallery images if Zillow has more than `images/` on disk.
6. Append a **Verification** section to `import-report.md` and summarize in chat.

## Workflow

1. **Validate URL** — Must match `zillow.com/homedetails/…` with a `_zpid` segment.
2. **Open listing** — Navigate to the URL in a supervised browser. If blocked, follow **Supervised browser** above.
3. **Extract fields** — Populate `property.json` using the schema in `references/property-schema.json`:
   - address, price, beds, baths, sqft, lot, year built, property type
   - description (full listing text)
   - zpid, mls (if shown), zillowUrl
4. **Download photos** — Save every gallery image to `images/` with stable names: `01.jpg`, `02.jpg`, … (preserve format when possible).
5. **Classify photos** — After each image is saved, propose a type by inspecting the photo (and any Zillow gallery label/caption if visible). Write one JSON sidecar per image:
   - Path: `images/.meta/{basename}.json` (e.g. `images/.meta/03.jpg.json` for `images/03.jpg`)
   - Shape: see `references/image-metadata-schema.json`
   - Use `role` values: `exterior`, `interior`, `kitchen`, `bathroom`, `bedroom`, `blueprint`, `floor_plan`, `other`
   - Add optional `room` or `notes` when helpful (e.g. `"notes": "rear yard"`).
   - **Best effort** — classify every photo; skip sidecar only if the image is unreadable. Users can fix types in the Photos tab.
6. **Set cover** — Set `coverImage` to the best **exterior** shot (or `images/01.jpg` if none is clearly exterior).
7. **Write provenance** — Update or create `source.json`:
   ```json
   { "url": "<zillow url>", "fetchedAt": "<ISO timestamp>", "zpid": "<zpid>" }
   ```
8. **Write import report** — Save `import-report.md` in cwd (use `references/import-report-template.md` as the outline). Fill every section with real values from this run.
9. **Present report to user** — Your final chat message must be the import report (see below). Do not end with only “suggested next steps” or references to other sessions.

## Import report (required)

After files are saved, always deliver a structured report in **both** places:

1. **On disk:** `import-report.md` in the property folder
2. **In chat:** Same content as your final assistant message

Use this structure:

```markdown
## Import complete

**Address:** …
**Source:** <zillow url>
**Saved at:** <ISO timestamp>

### What was done
- property.json — N fields populated
- source.json — provenance recorded
- images/ — N photos (01.jpg … NN.jpg)
- images/.meta/ — proposed type for each photo (user can edit in Photos tab)
- coverImage — images/01.jpg

### Fields captured
Brief table or list: price, beds, baths, sqft, lot, year built, MLS, property type, description length.

### Potential issues ⚠️
Flag anything the user should verify before using this listing in marketing:
- Human verification required during import (CAPTCHA, Press & Hold, login)
- Missing or empty fields
- Photo count mismatch vs Zillow gallery
- Values that look wrong but were copied faithfully from Zillow (e.g. lot size vs urban row house)
- Fields you could not confirm from the page
- Any download or parse errors

If there are no issues, say: “No issues flagged — spot-check price and photos.”

### Recommended next steps
1. User reviews flagged items (if any)
2. Listing copy → listing.md
3. Virtual staging → staged/
```

**Tone:** Factual and helpful. Highlight issues clearly; do not alarm about “peer sessions” or other agents. Work only from this run and files on disk.

## Output checklist

- [ ] `property.json` written with extracted facts
- [ ] `source.json` updated with URL and timestamp
- [ ] All visible gallery photos saved under `images/`
- [ ] `images/.meta/{basename}.json` sidecar written for each classified photo
- [ ] `coverImage` set in `property.json`
- [ ] `import-report.md` written
- [ ] Import report presented in chat

## Reference

See `references/property-schema.json` for the expected `property.json` shape.
