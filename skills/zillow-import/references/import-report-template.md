# Import Report — {{address}}

**Imported:** {{fetchedAt}}  
**Source:** {{zillowUrl}}  
**zpid:** {{zpid}}

## What was done

- [ ] Opened listing in supervised browser
- [ ] User completed any human verification (CAPTCHA / Press & Hold)
- [ ] Wrote `property.json`
- [ ] Wrote `source.json`
- [ ] Downloaded **{{photoCount}}** photos to `images/`
- [ ] Proposed image types in `images/.meta/*.json` (exterior, kitchen, floor plan, etc.)
- [ ] Set `coverImage` to `{{coverImage}}`

## Fields captured

| Field | Value | Notes |
|-------|-------|-------|
| Price | | |
| Beds / baths | | |
| Sqft | | |
| Lot | | |
| Year built | | |
| MLS | | |
| Property type | | |

## Image classifications

Summarize proposed types (user can edit in Photos tab):

| File | Proposed role | Notes |
|------|---------------|-------|
| images/01.jpg | | |
| images/02.jpg | | |

## Potential issues (review before marketing)

List anything suspicious, missing, or user-dependent:

- **Bot challenge:** Did Zillow show Press & Hold or CAPTCHA? Did the user complete it?
- **Missing fields:** Any schema fields not found on the page?
- **Photo gaps:** Expected N photos on Zillow vs saved count; any failed downloads?
- **Implausible values:** e.g. lot size vs property type, bath count vs half-baths
- **Zillow quirks:** Values that look wrong but match Zillow exactly (note “faithful to source”)
- **Manual checks:** Items the agent cannot verify (MLS accuracy, legal description, HOA, etc.)

## Recommended next steps

1. User verifies flagged items above
2. Run **Listing copy** → `listing.md`
3. Run **Virtual staging** → `staged/`
