import {
  API_BASE,
  jsonFetch,
  filterOffers,
  toCard,
  writeError,
  type JobCard,
  type RawOffer,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  remote?: number
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const PAGE_SIZE = 20

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(7) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(22) +
    " " +
    "SALARY".padEnd(14) +
    " REMOTE"
  const rows = cards.map((c) => {
    const remote = c.remotePercentage === null ? "—" : `${c.remotePercentage}%`
    return (
      c.id.padEnd(7) +
      " " +
      (c.title || "").slice(0, 40).padEnd(40) +
      " " +
      (c.company || "—").slice(0, 22).padEnd(22) +
      " " +
      (c.location || "—").slice(0, 22).padEnd(22) +
      " " +
      (c.salary || "—").slice(0, 14).padEnd(14) +
      " " +
      remote
    )
  })
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = `${API_BASE}?lang=ES&onlyActive=true`
    const payload = await jsonFetch<RawOffer[]>(url)
    if (!Array.isArray(payload)) {
      writeError("Unexpected API response: expected an array of offers", "BAD_RESPONSE")
      return 1
    }

    const matched = filterOffers(payload, {
      query: opts.query,
      location: opts.location,
      remote: opts.remote,
      jobage: opts.jobage,
    })

    // The API has no pagination of its own, so page over the filtered set.
    const start = (opts.page - 1) * PAGE_SIZE
    let cards = matched.slice(start, start + PAGE_SIZE).map(toCard)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      const body = cards
        .map(
          (c) =>
            `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "salario n/d"} · ${
              c.remotePercentage === null ? "—" : `${c.remotePercentage}% remoto`
            }\n  id: ${c.id}\n  ${c.url}`,
        )
        .join("\n\n")
      process.stdout.write((body || "No results.") + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, totalMatches: matched.length }, results: cards },
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
