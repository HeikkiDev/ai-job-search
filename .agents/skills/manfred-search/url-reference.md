# Manfred API Reference

Public, unauthenticated REST API behind [getmanfred.com](https://www.getmanfred.com).
`robots.txt` allows all user agents; no personal-use restriction applies.

Verified 2026-07-30.

## Search (offer list)

```
GET https://www.getmanfred.com/api/v2/public/offers?lang=ES&onlyActive=true
```

| Param | Meaning | Notes |
|-------|---------|-------|
| `lang` | Response language | **Required.** `ES` or `EN`; omitting it returns HTTP 400 |
| `onlyActive` | Restrict to open offers | `true` |

There are **no keyword, location or pagination parameters** — the endpoint returns every
active offer (a few dozen) as a flat JSON array, so the CLI filters and pages client-side.

Response: a JSON array of offer summaries.

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Numeric offer id — the argument `detail` expects |
| `slug` | string | URL slug |
| `position` | string | Job title |
| `company.name` / `company.web` | string | Employer |
| `locations` | string[] | e.g. `["Madrid, España"]`; may be empty for remote-only offers |
| `salaryFrom` / `salaryTo` | number | **Mixed units** — see below |
| `currency` | string | Usually `€` |
| `remotePercentage` | number | 0-100 |
| `highlights` | string[] | Emoji-prefixed tags, e.g. `"🏠 Híbrido"` |
| `updatedAt` | string | ISO 8601; the CLI exposes it as `date` |
| `status` | string | `ACTIVE` when `onlyActive=true` |
| `isFreelance` | boolean | |

### Salary units gotcha

`salaryFrom`/`salaryTo` are inconsistent across offers: some are expressed in thousands of
euros (`55`) and others as the full figure (`55000`). `toEuros()` in `helpers.ts` normalises
anything below 1000 by multiplying by 1000. **Do not remove that normalisation** — it is the
difference between "55k €" and "55000k €".

## Detail (single offer)

```
GET https://www.getmanfred.com/api/v2/public/offers/<numericId>?lang=ES
```

The path segment must be **numeric**. Passing the slug returns
`400 Validation failed (numeric string is expected)`.

Adds the long-form content to the summary fields:

| Field | Type | Notes |
|-------|------|-------|
| `introduction` | string (Markdown) | |
| `whatWillYouDo` | string (Markdown) | |
| `howWillYouDoIt` | string (Markdown) | |
| `whatTheyAskFor` | string (Markdown) | |
| `whatOffering` | string (Markdown) | Frequently an empty string |
| `techs` | `{ name, level, section }[]` | `level` e.g. `ADVANCED`; `section` e.g. `MUST` |
| `languages` | `{ name, level }[]` | e.g. `{ name: "Inglés", level: "Fluent" }` |
| `perks` | `{ name, description }[]` | |

Prose fields are Markdown; `buildDescription()` joins the populated ones under Spanish
headings and `markdownToText()` strips the markers for `--format plain`.

## Public offer page

```
https://www.getmanfred.com/ofertas-empleo/<id>/<slug>
```

This is the human-facing URL emitted as each result's `url`. Both segments are required —
`/ofertas-empleo/<slug>` alone 404s. The canonical list lives at
`https://www.getmanfred.com/sitemap-offers.xml`.

## Maintenance notes

If the API shape changes, the fields to re-check are, in order of fragility:

1. `salaryFrom`/`salaryTo` units (see above)
2. The prose section names consumed by `buildDescription()`
3. The `/ofertas-empleo/<id>/<slug>` URL shape

The offer page itself is a Next.js app whose data is embedded in `__NEXT_DATA__`; the CLI
deliberately never parses it, because the REST API returns the same data cleanly.
