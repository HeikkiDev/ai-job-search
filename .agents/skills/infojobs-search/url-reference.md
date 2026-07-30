# InfoJobs URL Reference

Public pages on [infojobs.net](https://www.infojobs.net) used by this skill.
Verified 2026-07-30.

> **Personal use only.** See the warning in `SKILL.md`. InfoJobs' `robots.txt` disallows
> `/jobsearch/search-results/list.xhtml`; this skill uses the crawlable `/ofertas-trabajo/`
> path instead. Keep volume low.

## Search

```
GET https://www.infojobs.net/ofertas-trabajo/<keyword-slug>?keyword=<keywords>&...
```

The path slug is cosmetic (SEO), but **the `keyword` query parameter is what actually
filters** — `/ofertas-trabajo/python?page=2` without it silently drops the keyword and
returns all 60k+ offers. Always send both.

| Param | Meaning | Values |
|-------|---------|--------|
| `keyword` | Free-text query | `data engineer` |
| `provinceIds` | Province filter | Numeric id, e.g. `33` = Madrid (see below) |
| `teleworkingIds` | Work mode | `1` presencial · `2` solo teletrabajo · `3` híbrido |
| `sinceDate` | Posted within | `_24_HOURS` · `_7_DAYS` · `_15_DAYS` · `ANY` |
| `sortBy` | Ordering | `RELEVANCE` (default) · `PUBLICATION_DATE` |
| `page` | 1-indexed page | `2` |

`sinceDate=_1_MONTH` is **not** valid and returns a 500; `jobageToSinceDate()` therefore
maps anything above 15 days to no filter at all.

### Province ids

InfoJobs filters by province, never by city. The authoritative id list is published in every
search response under `aggregation.province` (`{ value, label, semanticLink }`); the CLI bakes
the Spanish subset into `PROVINCE_IDS` in `helpers.ts`, plus a `PROVINCE_ALIASES` table for
bilingual and colloquial names (`Bizkaia` → `vizcaya`, `Illes Balears` → `baleares`).

To regenerate the map, fetch any search page and read that facet. The response also lists
foreign regions (Dublin, Bayern, …) which this skill deliberately omits.

## Response structure — the important part

**Only 5 offer cards are server-rendered into the markup; the rest arrive via client-side
JavaScript.** Parsing the HTML would therefore lose most of a page. Instead, every search
page embeds the complete result set as:

```js
window.__INITIAL_PROPS__ = JSON.parse("<a JS string literal containing escaped JSON>");
```

`extractInitialProps()` locates that marker, walks the string literal honouring backslash
escapes, then parses it twice (once to unescape the literal, once for the JSON itself).

| Path | Meaning |
|------|---------|
| `offers[]` | ~22 offers per page, **including the full `description`** |
| `overview.totalElements` | Total matches across all pages |
| `search` | Echo of the applied filters — useful for verifying a parameter took effect |
| `aggregation.province` / `.city` / `.teleworking` | Facet id/label maps |

Per-offer fields: `code`, `title`, `companyName`, `companyLink`, `city`, `link`,
`publishedAt` (ISO 8601), `teleworking`, `contractType`, `workday`, `description`.

`link` is protocol-relative (`//www.infojobs.net/...`) and carries tracking parameters;
`absoluteUrl()` normalises the scheme and strips the query string.

## Detail

```
GET https://www.infojobs.net/<city>/<slug>/of-i<code>
```

Live offer pages **are** fully server-rendered and carry their own `__INITIAL_PROPS__`, with
the posting under `offer`.

⚠️ **The bare `/of-i<code>` shortcut does not work for automated clients** — it returns a
Distil anti-bot challenge page (`<link rel="canonical" href=".../distil/distil/captcha.xhtml">`)
with no payload. An offer code alone is therefore not resolvable; `detail` requires the full
URL, which search always provides.

Expired offers still return HTTP 200 but render "Oferta no disponible" with no
`__INITIAL_PROPS__` payload, which `parseDetailPayload()` reports as `NOT_AVAILABLE`.

### Nested detail fields

Several `offer` fields are objects, not strings — writing them out directly yields
`[object Object]`, so `parseDetailPayload()` flattens them:

| Field | Shape |
|-------|-------|
| `location` | `{ city, province: { id, label, slug } }` |
| `contract` | `{ type, workday }` |
| `minimumStudies` | `{ level, ongoingStudy }` |
| `category` / `subCategory` | `{ name, slug }` |
| `requiredSkills` / `socialBenefits` | `{ name, slug }[]` |

Plain strings: `title`, `companyName`, `salary`, `minimumExperience`, `minimumRequirements`,
`desiredRequirements`, `description`, `remoteWork`, `level`, `publishedAt`.
`numberOfVacancies` is a number. Empty values arrive as `""` rather than `null`.

## Maintenance notes

If results stop parsing, check in this order:

1. Is the `window.__INITIAL_PROPS__ = JSON.parse("...")` marker still present?
   (`extractInitialProps()` returns `null` → the CLI reports `PARSE_FAILED`.)
2. Have the `offers[]` field names changed? (`toCard()` needs `code` and `title`.)
3. Is `/ofertas-trabajo/` still crawlable in `robots.txt`, and is the disallow list still
   limited to the internal endpoints? Re-read it before widening anything.
