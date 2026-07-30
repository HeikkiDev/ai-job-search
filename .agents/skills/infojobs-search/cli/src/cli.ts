#!/usr/bin/env bun
// Self-contained CLI for searching jobs on InfoJobs (infojobs.net), Spain's
// largest job board. Reads the public SEO search pages and public offer pages,
// which server-render a structured JSON payload. Zero runtime dependencies.
//
// Personal use only. InfoJobs' robots.txt disallows its internal search
// endpoint (/jobsearch/search-results/list.xhtml); this CLI deliberately uses
// the crawlable /ofertas-trabajo/ path instead, but automated access is still
// not something InfoJobs invites. Keep volume low, never use it commercially or
// for bulk collection, and run it on your own responsibility.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `infojobs-cli — search jobs on InfoJobs (infojobs.net, Spain)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill). Recommended.
  --location, -l <text>   Spanish province, e.g. "Madrid", "Barcelona", "Vizcaya".
                          InfoJobs filters by province, not city.
  --remote <mode>         remote | hybrid | onsite (also remoto | hibrido | presencial).
  --jobage <days>         Posted within N days. InfoJobs supports 1, 7 and 15;
                          other values round up to the next supported bucket.
  --sort <mode>           relevance (default) | date.
  --page <n>              1-indexed page (about 20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "python" --format table
  bun run src/cli.ts search -q "data engineer" -l Madrid --remote remote --format table
  bun run src/cli.ts search -q "enfermera" -l Sevilla --jobage 7 --sort date --format table
  bun run src/cli.ts search -q "desarrollador java" -l Barcelona --limit 5 --format plain
  bun run src/cli.ts detail "https://www.infojobs.net/madrid/data-engineer/of-iabc123..." --format plain

NOTES
  detail needs the full offer URL that search returns; InfoJobs serves an
  anti-bot challenge for the bare /of-i<code> shortcut.

Personal use only — keep volume low (see SKILL.md).
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }
    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const sortRaw = typeof flags.sort === "string" ? flags.sort.toLowerCase() : "relevance"
    if (!["relevance", "date"].includes(sortRaw)) {
      process.stderr.write(
        JSON.stringify({ error: `--sort must be "relevance" or "date", got "${sortRaw}"`, code: "BAD_ARG" }) + "\n",
      )
      return 1
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      remote: typeof flags.remote === "string" ? flags.remote : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      sort: sortRaw as SearchOpts["sort"],
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = { id, format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"] }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
