# manfred-cli

CLI for searching tech jobs on [Manfred](https://www.getmanfred.com) (getmanfred.com), a
curated Spanish tech job board that publishes salary ranges and remote percentages.

**Data source**: Manfred public REST API (`/api/v2/public/offers`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

Manfred's `robots.txt` allows all user agents and the API is public, so no personal-use
restriction applies. Keep request volume sensible anyway.

## Installation

```bash
cd .agents/skills/manfred-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search active offers (all flags optional) |
| `detail` | Fetch the full write-up for one offer, by numeric id |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.

```bash
bun run src/cli.ts search -q "backend" --format table
bun run src/cli.ts search --remote 100 --jobage 30 --format table
bun run src/cli.ts detail 8414 --format plain
```

Run `bun run src/cli.ts --help` for the full flag reference.

## Implementation notes

- The API takes **no query parameters** beyond `lang` and `onlyActive`: it returns every
  active offer at once, so keyword/location/remote/age filtering and paging happen
  client-side in `filterOffers()`.
- Upstream salary units are inconsistent (`55` vs `55000`); `toEuros()` normalises them.
  See `../url-reference.md`.
- Errors are written to stderr as `{ "error": ..., "code": ... }` with exit code 1.

## Tests

```bash
bun run typecheck
bun test
```

Tests are offline — they mock `globalThis.fetch` and use fixtures, so they run in CI
without network access.
