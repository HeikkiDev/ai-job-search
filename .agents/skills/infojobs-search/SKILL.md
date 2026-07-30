---
name: infojobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Spain, find Spanish
  job listings, or look up a specific InfoJobs posting — even if they don't mention
  infojobs.net explicitly. InfoJobs is Spain's largest job board and covers every
  sector, not just tech: healthcare, hospitality, logistics, retail, administration,
  education, construction, engineering, sales and more. Invoke for open positions,
  vacancies and hiring anywhere in Spain, including Madrid, Barcelona, Valencia,
  Sevilla, Zaragoza, Málaga, Bilbao, Murcia and Las Palmas. Trigger phrases:
  infojobs, ofertas de trabajo, ofertas de empleo, buscar trabajo, buscar empleo,
  trabajo en España, empleo en Madrid, vacantes, bolsa de trabajo, contrato
  indefinido, teletrabajo, trabajo remoto, "are there any jobs in Barcelona",
  "find me a job in Spain", "qué ofertas hay de X en Y".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/infojobs-search/cli/src/cli.ts *)
---

# InfoJobs Search Skill

Search live job listings from [InfoJobs](https://www.infojobs.net) (infojobs.net), Spain's
largest job board, across **every sector**. No authentication, no API key, and **zero
runtime dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

InfoJobs' `robots.txt` **disallows its internal search endpoint**
(`/jobsearch/search-results/list.xhtml`). This skill deliberately queries the crawlable
`/ofertas-trabajo/` path instead, which robots.txt permits — but automated access is still
not something InfoJobs invites, and its terms restrict reuse of listing data.

**Keep volume low, never use this commercially or for bulk data collection, and run it on
your own responsibility.** If you want a source with no such caveat, use `manfred-search`
(tech roles only) instead.

## When to use this skill

- Search Spanish job openings in any sector by keyword and province
- Filter by recency, work mode (remote/hybrid/on-site) or sort by publication date
- Get the full description, requirements and conditions of a specific posting

## Commands

```bash
bun run .agents/skills/infojobs-search/cli/src/cli.ts search --query "<keywords>" [flags]
bun run .agents/skills/infojobs-search/cli/src/cli.ts detail <url> [--format json|plain]
```

### Search flags

| Flag | Meaning | Default |
|------|---------|---------|
| `--query`, `-q` | Keywords (job title, skill). Recommended. | — |
| `--location`, `-l` | Spanish **province** name, e.g. `Madrid`, `Barcelona`, `Vizcaya`. Accepts accents and bilingual aliases (`Bizkaia`, `Gipuzkoa`, `Illes Balears`). | all Spain |
| `--remote` | `remote` \| `hybrid` \| `onsite` (also `remoto`, `hibrido`, `presencial`) | any |
| `--jobage` | Posted within N days | all |
| `--sort` | `relevance` \| `date` | `relevance` |
| `--page` | 1-indexed page (~20 results/page) | `1` |
| `--limit`, `-n` | Cap results emitted (client-side) | all |
| `--format` | `json` \| `table` \| `plain` | `json` |

## Examples

```bash
# Python jobs anywhere in Spain
bun run .agents/skills/infojobs-search/cli/src/cli.ts search -q "python" --format table

# Fully-remote data engineering roles in Madrid province
bun run .agents/skills/infojobs-search/cli/src/cli.ts search -q "data engineer" -l Madrid --remote remote --format table

# Nursing vacancies in Sevilla posted this week, newest first
bun run .agents/skills/infojobs-search/cli/src/cli.ts search -q "enfermera" -l Sevilla --jobage 7 --sort date --format table

# Java developers in Barcelona, first five, human-readable
bun run .agents/skills/infojobs-search/cli/src/cli.ts search -q "desarrollador java" -l Barcelona --limit 5 --format plain

# Full posting, using the url from a search result
bun run .agents/skills/infojobs-search/cli/src/cli.ts detail "https://www.infojobs.net/madrid/data-engineer/of-iabc123" --format plain
```

## Output

| Format | Use |
|--------|-----|
| `json` (default) | `{ meta: { count, page, totalMatches }, results: [...] }` — machine-readable, for `/scrape` |
| `table` | Fixed-width columns, for scanning in a terminal |
| `plain` | One block per posting, for reading |

Each result carries `id`, `title`, `company`, `companyUrl`, `location`, `date`, `url`,
`teleworking`, `contractType` and `workday`. Missing values are `null`, never omitted.
Errors go to **stderr** as `{ "error": ..., "code": ... }` with exit code `1`.

## Notes

- **`detail` needs the full offer URL, not the id.** InfoJobs serves an anti-bot challenge
  for the bare `/of-i<code>` shortcut, so only the canonical
  `/<city>/<slug>/of-i<code>` URL can be read. Every search result includes it as `url`;
  passing a bare code fails fast with a `NEED_URL` error explaining this.
- **InfoJobs filters by province, not city.** `-l Madrid` covers the whole province. An
  unknown name fails immediately with the full list of valid provinces — no wasted request.
- **`--jobage` is bucketed.** InfoJobs only supports 1, 7 and 15 days; other values round up
  to the next supported bucket, and anything above 15 disables the filter.
- **Search results already include the full description**, so `/scrape` usually does not need
  a follow-up `detail` call per posting.
- **Expired postings** return a `NOT_AVAILABLE` error rather than an empty record — InfoJobs
  keeps the URL alive after an offer is withdrawn.
- Parsing reads the JSON payload InfoJobs server-renders into the page rather than scraping
  the markup; see `url-reference.md` for the anchor to update if that ever changes.
