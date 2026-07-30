import {
  SEARCH_BASE,
  htmlFetch,
  parseSearchPayload,
  keywordSlug,
  resolveProvince,
  provinceNames,
  teleworkingFlag,
  jobageToSinceDate,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  remote?: string
  jobage: number
  page: number
  limit?: number
  sort: "relevance" | "date"
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string | { error: string; code: string } {
  const params = new URLSearchParams()
  if (opts.query) params.set("keyword", opts.query)

  if (opts.location) {
    const provinceId = resolveProvince(opts.location)
    if (!provinceId) {
      return {
        error: `Unknown province "${opts.location}". InfoJobs filters by province; valid values: ${provinceNames().join(", ")}`,
        code: "BAD_LOCATION",
      }
    }
    params.set("provinceIds", provinceId)
  }

  if (opts.remote) {
    const flag = teleworkingFlag(opts.remote)
    if (!flag) {
      return {
        error: `--remote must be one of: remote, hybrid, onsite (or remoto, hibrido, presencial), got "${opts.remote}"`,
        code: "BAD_ARG",
      }
    }
    params.set("teleworkingIds", flag)
  }

  const since = jobageToSinceDate(opts.jobage)
  if (since) params.set("sinceDate", since)
  if (opts.sort === "date") params.set("sortBy", "PUBLICATION_DATE")
  if (opts.page > 1) params.set("page", String(opts.page))

  return `${SEARCH_BASE}/${keywordSlug(opts.query)}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(30) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(20) +
    " DATE"
  const rows = cards.map(
    (c) =>
      c.id.padEnd(30) +
      " " +
      (c.title || "").slice(0, 40).padEnd(40) +
      " " +
      (c.company || "—").slice(0, 24).padEnd(24) +
      " " +
      (c.location || "—").slice(0, 20).padEnd(20) +
      " " +
      (c.date ? c.date.slice(0, 10) : "—"),
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const url = buildUrl(opts)
  if (typeof url !== "string") {
    writeError(url.error, url.code)
    return 1
  }
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Search page not found", "NOT_FOUND")
      return 1
    }
    const { cards: all, total } = parseSearchPayload(html)
    if (all.length === 0 && total === null) {
      writeError(
        "Could not read InfoJobs' embedded result payload — the page markup may have changed, " +
          "or the request was served an anti-bot challenge. Retry later; see url-reference.md.",
        "PARSE_FAILED",
      )
      return 1
    }

    let cards = all
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      const body = cards
        .map(
          (c) =>
            `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.teleworking || "—"} · ${
              c.date ? c.date.slice(0, 10) : "—"
            }\n  id: ${c.id}\n  ${c.url}`,
        )
        .join("\n\n")
      process.stdout.write((body || "No results.") + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, totalMatches: total }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
