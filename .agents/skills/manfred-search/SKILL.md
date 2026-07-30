---
name: manfred-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for tech jobs in Spain, find
  Spanish IT/developer vacancies, or look up a specific Manfred job offer — even if
  they don't mention getmanfred.com explicitly. Manfred is a curated Spanish tech
  job board that publishes salary ranges and remote percentages, so it is the best
  source when the user asks about pay, fully-remote tech roles, or startup jobs in
  Spain. Invoke for open positions, vacancies and hiring in software, data, AI,
  DevOps, QA, mobile and product engineering across Madrid, Barcelona, Valencia,
  Sevilla, Málaga, Bilbao and remote-first Spanish companies. Trigger phrases:
  manfred, getmanfred, trabajo en España, empleo tech, ofertas de trabajo
  programador, ofertas con salario, trabajo remoto España, teletrabajo, buscar
  trabajo desarrollador, vacantes IT, "are there any developer jobs in Spain",
  "tech jobs in Madrid with salary".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/manfred-search/cli/src/cli.ts *)
---

# Manfred Search Skill

Search live tech job offers from [Manfred](https://www.getmanfred.com) (getmanfred.com),
a curated Spanish tech job board. Uses Manfred's **public REST API** — no authentication,
no API key, and **zero runtime dependencies**; it runs with just `bun`.

Manfred's robots.txt permits crawling and the API is public and unauthenticated, so this
skill carries no personal-use restriction. Still keep request volume sensible.

## What makes this portal worth querying

Unlike most Spanish boards, Manfred publishes structured data that the rest hide:

- **Salary ranges on every offer** — directly comparable, no "salario no disponible"
- **Remote percentage** (0-100) rather than a vague "hybrid" label
- **Required tech stack with proficiency levels**, plus languages and perks

The trade-off is volume: Manfred is curated and typically lists only a few dozen active
offers at a time. Use it for depth and salary signal; use `infojobs-search` for breadth.

## When to use this skill

- Search Spanish tech jobs by keyword, city or remote percentage
- Answer "what does this role pay in Spain?" with real published ranges
- Find fully-remote (`--remote 100`) engineering roles at Spanish companies
- Get the full write-up, stack and perks for a specific offer

## Commands

```bash
bun run .agents/skills/manfred-search/cli/src/cli.ts search [flags]
bun run .agents/skills/manfred-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

### Search flags

| Flag | Meaning | Default |
|------|---------|---------|
| `--query`, `-q` | Keywords matched against title, company, tags and location. **All** words must match, accent-insensitively. | — |
| `--location`, `-l` | Substring match on the offer's location, e.g. `Madrid`, `Barcelona` | — |
| `--remote` | Minimum remote percentage, `0`-`100` | — |
| `--jobage` | Only offers updated within N days | all |
| `--page` | 1-indexed page (20 results/page) | `1` |
| `--limit`, `-n` | Cap results emitted (client-side) | all |
| `--format` | `json` \| `table` \| `plain` | `json` |

## Examples

```bash
# Backend roles, as a table
bun run .agents/skills/manfred-search/cli/src/cli.ts search -q "backend" --format table

# Python roles in Madrid
bun run .agents/skills/manfred-search/cli/src/cli.ts search -q "python" -l Madrid --format table

# Fully-remote offers updated in the last 30 days
bun run .agents/skills/manfred-search/cli/src/cli.ts search --remote 100 --jobage 30 --format table

# Data roles, first five, human-readable
bun run .agents/skills/manfred-search/cli/src/cli.ts search -q "data" --limit 5 --format plain

# Full write-up for one offer
bun run .agents/skills/manfred-search/cli/src/cli.ts detail 8414 --format plain
```

## Output

| Format | Use |
|--------|-----|
| `json` (default) | `{ meta: { count, page, totalMatches }, results: [...] }` — machine-readable, for `/scrape` |
| `table` | Fixed-width columns incl. salary and remote %, for scanning in a terminal |
| `plain` | One block per offer, for reading |

Each result carries `id`, `title`, `company`, `companyUrl`, `location`, `date`, `url`,
`salary`, `remotePercentage` and `highlights`. Missing values are `null`, never omitted.
Errors go to **stderr** as `{ "error": ..., "code": ... }` with exit code `1`.

## Notes

- **All filtering is client-side.** Manfred's list endpoint returns every active offer in
  one response and takes no query parameters, so `--query`/`--location`/`--remote`/`--jobage`
  are applied locally and `--page` just windows the filtered set. `meta.totalMatches` reports
  how many offers matched before paging.
- **Salary units are mixed** in the upstream API — some offers publish `55` (thousands) and
  others `55000` (euros). The CLI normalises both to euros and renders them as `55k €`.
- **`date` is `updatedAt`**, not a first-published date: Manfred refreshes offers, so
  `--jobage` measures time since last update.
- **`detail` takes the numeric offer id** (or any Manfred offer URL containing it) — not the
  slug. The `id` field of every search result is exactly what `detail` expects.
- Offer descriptions are Markdown upstream; `--format plain` strips the markers.
