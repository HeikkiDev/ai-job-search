// Data source: Manfred's public REST API (getmanfred.com), no authentication.
//   GET /api/v2/public/offers?lang=ES        -> array of active offer summaries
//   GET /api/v2/public/offers/<numericId>    -> one offer, with the full write-up
// The list endpoint returns every active offer in one response (Manfred is a
// small curated board), so keyword/location/remote filtering happens client-side.

export const API_BASE = "https://www.getmanfred.com/api/v2/public/offers"
export const SITE_BASE = "https://www.getmanfred.com/ofertas-empleo"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

export interface RawOffer {
  id: number
  position?: string
  slug?: string
  status?: string
  locations?: string[]
  highlights?: string[]
  salaryFrom?: number
  salaryTo?: number
  currency?: string
  remotePercentage?: number
  isFreelance?: boolean
  updatedAt?: string
  company?: { name?: string; web?: string }
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  remotePercentage: number | null
  highlights: string[]
}

export interface JobDetail extends JobCard {
  description: string | null
  techs: string[]
  languages: string[]
  perks: string[]
  isFreelance: boolean | null
  applyUrl: string
}

/** Lowercase and strip diacritics so "Malaga" matches "Málaga". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function offerUrl(offer: RawOffer): string {
  return offer.slug ? `${SITE_BASE}/${offer.id}/${offer.slug}` : `${SITE_BASE}/${offer.id}`
}

/**
 * Manfred's salary fields mix units: some offers publish thousands of euros
 * (55) and others the full figure (55000). Normalise both to whole euros.
 */
export function toEuros(value: number | undefined): number {
  if (!value || value <= 0) return 0
  return value < 1000 ? value * 1000 : value
}

/** Human-readable salary range, rendered in thousands (e.g. "35k-40k €"). */
export function formatSalary(offer: RawOffer): string | null {
  const currency = offer.currency || "€"
  const from = toEuros(offer.salaryFrom)
  const to = toEuros(offer.salaryTo)
  if (!from && !to) return null
  const k = (v: number): string => `${Math.round(v / 1000)}k`
  if (from && to && from !== to) return `${k(from)}-${k(to)} ${currency}`
  return `${k(from || to)} ${currency}`
}

export function toCard(offer: RawOffer): JobCard {
  return {
    id: String(offer.id),
    title: offer.position || "(untitled)",
    company: offer.company?.name || null,
    companyUrl: offer.company?.web || null,
    location: offer.locations?.length ? offer.locations.join("; ") : null,
    date: offer.updatedAt || null,
    url: offerUrl(offer),
    salary: formatSalary(offer),
    remotePercentage:
      typeof offer.remotePercentage === "number" ? offer.remotePercentage : null,
    highlights: offer.highlights ?? [],
  }
}

/** The free-text haystack a --query is matched against. */
export function searchableText(offer: RawOffer): string {
  return normalize(
    [
      offer.position ?? "",
      offer.company?.name ?? "",
      ...(offer.highlights ?? []),
      ...(offer.locations ?? []),
    ].join(" "),
  )
}

export interface FilterOpts {
  query?: string
  location?: string
  remote?: number
  jobage?: number
  now?: Date
}

/** Apply every client-side filter. All terms in --query must be present. */
export function filterOffers(offers: RawOffer[], opts: FilterOpts): RawOffer[] {
  const now = opts.now ?? new Date()
  return offers.filter((offer) => {
    if (opts.query) {
      const haystack = searchableText(offer)
      const terms = normalize(opts.query).split(/\s+/).filter(Boolean)
      if (!terms.every((t) => haystack.includes(t))) return false
    }
    if (opts.location) {
      const loc = normalize((offer.locations ?? []).join(" "))
      if (!loc.includes(normalize(opts.location))) return false
    }
    if (opts.remote !== undefined) {
      if ((offer.remotePercentage ?? 0) < opts.remote) return false
    }
    if (opts.jobage !== undefined && opts.jobage > 0 && opts.jobage < 9999) {
      if (!offer.updatedAt) return false
      const updated = new Date(offer.updatedAt).getTime()
      if (Number.isNaN(updated)) return false
      const ageDays = (now.getTime() - updated) / 86400000
      if (ageDays > opts.jobage) return false
    }
    return true
  })
}

/** Strip Markdown emphasis/links so `detail --format plain` reads cleanly. */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface RawDetail extends RawOffer {
  introduction?: string
  whatWillYouDo?: string
  whatTheyAskFor?: string
  whatOffering?: string
  howWillYouDoIt?: string
  techs?: { name?: string; level?: string; section?: string }[]
  languages?: { name?: string; level?: string }[]
  perks?: { name?: string }[]
}

/** Join the offer's prose sections into one description block. */
export function buildDescription(offer: RawDetail): string | null {
  const sections: [string, string | undefined][] = [
    ["Introducción", offer.introduction],
    ["Qué harás", offer.whatWillYouDo],
    ["Cómo lo harás", offer.howWillYouDoIt],
    ["Qué piden", offer.whatTheyAskFor],
    ["Qué ofrecen", offer.whatOffering],
  ]
  const parts = sections
    .filter(([, body]) => typeof body === "string" && body.trim() !== "")
    .map(([heading, body]) => `## ${heading}\n\n${markdownToText(body as string)}`)
  return parts.length ? parts.join("\n\n") : null
}

export function toDetail(offer: RawDetail): JobDetail {
  const techs = (offer.techs ?? [])
    .filter((t) => t.name)
    .map((t) => (t.level ? `${t.name} (${t.level.toLowerCase()})` : (t.name as string)))
  return {
    ...toCard(offer),
    description: buildDescription(offer),
    techs,
    languages: (offer.languages ?? [])
      .filter((l) => l.name)
      .map((l) => (l.level ? `${l.name} (${l.level})` : (l.name as string))),
    perks: (offer.perks ?? []).filter((p) => p.name).map((p) => p.name as string),
    isFreelance: typeof offer.isFreelance === "boolean" ? offer.isFreelance : null,
    applyUrl: offerUrl(offer),
  }
}
