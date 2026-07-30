# infojobs-cli

CLI for searching jobs on [InfoJobs](https://www.infojobs.net) (infojobs.net), Spain's
largest job board, across every sector.

**Data source**: public `/ofertas-trabajo/` search pages and public offer pages, both of
which server-render a `window.__INITIAL_PROPS__` JSON payload.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** InfoJobs' `robots.txt` disallows its internal search endpoint
> (`/jobsearch/search-results/list.xhtml`); this CLI uses the crawlable `/ofertas-trabajo/`
> path instead, but automated access is still not something InfoJobs invites. Keep volume
> low, don't use it commercially or for bulk data collection, and run it on your own
> responsibility.

## Installation

```bash
cd .agents/skills/infojobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job postings |
| `detail` | Fetch one posting, **by URL** (see below) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.

```bash
bun run src/cli.ts search -q "python" -l Madrid --format table
bun run src/cli.ts search -q "enfermera" -l Sevilla --jobage 7 --sort date --format table
bun run src/cli.ts detail "https://www.infojobs.net/madrid/rol/of-iabc123" --format plain
```

Run `bun run src/cli.ts --help` for the full flag reference.

## Implementation notes

- **Only 5 result cards are in the HTML**; the full page of ~22 lives in the embedded
  `__INITIAL_PROPS__` payload, which is what `extractInitialProps()` reads. Do not switch
  this to markup scraping.
- **`detail` needs the full offer URL.** The bare `/of-i<code>` shortcut returns a Distil
  anti-bot challenge, so a code alone cannot be resolved; the CLI fails with `NEED_URL`.
- **Provinces, not cities.** `--location` resolves a province name to InfoJobs' numeric id
  via `PROVINCE_IDS`/`PROVINCE_ALIASES`, and rejects unknown names before any request.
- Errors are written to stderr as `{ "error": ..., "code": ... }` with exit code 1.

See `../url-reference.md` for the full endpoint, parameter and payload documentation.

## Tests

```bash
bun run typecheck
bun test
```

Tests are offline — they mock `globalThis.fetch` and use fixtures, so they run in CI
without network access.
