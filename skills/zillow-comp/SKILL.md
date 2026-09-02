---
name: Import comparable from Zillow
description: Pull one competing listing from a Zillow URL into comps/ for the current property.
examplePrompt: Import this Zillow listing as a comparable and save it under comps/
category: comps
featured: false
---

# Zillow comparable

Import **one competing listing** into `comps/` for the active property. This is not a subject-property import.

## Trigger

The user provides a Zillow homedetails URL, for example:
`https://www.zillow.com/homedetails/123-Main-St-Brooklyn-NY-11215/12345678_zpid/`

## Constraints

- Only open the **exact URL the user supplied**.
- Never invent MLS facts. If a field is missing, omit it.
- **Do not** write or overwrite `property.json`, `images/`, or `listing.md`.
- **Do not** download the photo gallery. Comps are facts only.
- **Never bypass bot checks.** Same supervised-browser rules as zillow-import.

## Supervised browser

1. Open a visible browser and navigate to the URL.
2. Snapshot the page.
3. If you see Press & Hold, PerimeterX, CAPTCHA, login, or a blank listing: **stop**, tell the user what to click in the Chrome window, and wait for `done` / `ok` before continuing.
4. Extract only what is visible on the listing.

## File contract

Write **one** file: `comps/{zpid}.json` in **this** workspace (`cwd`). That path is the record identity. Never write a comparable into another property folder.

The JSON object uses **only** properties from `references/comp-schema.json`. Include a key when you extracted it; omit it when the listing does not show it.

Typical keys: `address`, `title`, `price`, `beds`, `baths`, `sqft`, `listingStatus` (`active` | `pending` | `sold`), `soldDate` (ISO date, sold comps only), `zpid`, `zillowUrl`, `notes` (short factual note, e.g. comparability).

After you write, the app may rewrite the same file and add `id`, `propertyId`, `createdAt`, and `updatedAt`. That is ingest succeeding. Leave those keys. When updating a file that already has them, change listing-fact keys only.

Done when `cwd/comps/{zpid}.json` exists, parses, and holds the extracted facts. Summarize address, price, beds/baths/sqft, status, and that path — not the ingest keys.

## Workflow

1. **Validate URL** — `zillow.com/homedetails/…` with a `_zpid` segment.
2. **Check disk** — Read `cwd/comps/*.json`. If a file already has this `zillowUrl` or `zpid`, update that file instead of creating a duplicate.
3. **Extract** — Snapshot the listing (supervised browser above). Copy visible facts into the file described in **File contract**.
4. **Summarize in chat** — Address, price, beds/baths/sqft, status, and `comps/{zpid}.json`.

## Output checklist

- [ ] `cwd/comps/{zpid}.json` holds extracted listing facts
- [ ] Ingest keys left as the app wrote them
- [ ] Subject `property.json` untouched
- [ ] Chat summary of the comparable
