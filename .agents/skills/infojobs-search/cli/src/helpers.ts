// Data source: InfoJobs public SEO search pages (www.infojobs.net/ofertas-trabajo/...)
// and public offer pages. Both server-render a `window.__INITIAL_PROPS__ = JSON.parse("...")`
// payload that carries the structured offer data, so we read that instead of
// scraping the rendered markup — it is both cleaner and far more stable.
//
// Personal use only. Keep volume low; see SKILL.md for the full notice.

export const SITE = "https://www.infojobs.net"
export const SEARCH_BASE = `${SITE}/ofertas-trabajo`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/**
 * Pull `window.__INITIAL_PROPS__ = JSON.parse("<escaped json>")` out of a page.
 * The argument is a JS string literal, so it is unescaped by parsing it as JSON
 * first, then parsing the result. Returns null when the marker is absent (the
 * anti-bot shell page and expired offers have no payload).
 */
export function extractInitialProps(html: string): Record<string, unknown> | null {
  const marker = html.indexOf("window.__INITIAL_PROPS__")
  if (marker === -1) return null
  const call = html.indexOf("JSON.parse(", marker)
  if (call === -1) return null

  const start = html.indexOf('"', call)
  if (start === -1) return null

  // Walk the string literal, honouring backslash escapes, to find its end.
  let i = start + 1
  let escaped = false
  while (i < html.length) {
    const ch = html[i]
    if (escaped) escaped = false
    else if (ch === "\\") escaped = true
    else if (ch === '"') break
    i++
  }
  if (i >= html.length) return null

  try {
    const inner = JSON.parse(html.slice(start, i + 1)) as string
    const data = JSON.parse(inner) as unknown
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export interface RawOffer {
  code?: string
  title?: string
  companyName?: string
  companyLink?: string
  city?: string
  province?: string
  link?: string
  publishedAt?: string
  teleworking?: string
  contractType?: string
  workday?: string
  description?: string
  salary?: string
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  teleworking: string | null
  contractType: string | null
  workday: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  salary: string | null
  minimumExperience: string | null
  minimumStudies: string | null
  requirements: string | null
  desiredRequirements: string | null
  vacancies: number | null
  level: string | null
  category: string | null
  skills: string[]
  benefits: string[]
  applyUrl: string
}

/** InfoJobs emits protocol-relative links (//www.infojobs.net/...). */
export function absoluteUrl(link: string | undefined): string {
  if (!link) return ""
  const clean = link.split("?")[0]
  if (clean.startsWith("//")) return `https:${clean}`
  if (clean.startsWith("/")) return `${SITE}${clean}`
  return clean
}

export function toCard(offer: RawOffer): JobCard | null {
  if (!offer.code || !offer.title) return null
  const location = [offer.city, offer.province].filter(Boolean).join(", ") || null
  return {
    id: offer.code,
    title: offer.title,
    company: offer.companyName || null,
    companyUrl: offer.companyLink ? absoluteUrl(offer.companyLink) : null,
    location,
    date: offer.publishedAt || null,
    url: absoluteUrl(offer.link),
    teleworking: offer.teleworking || null,
    contractType: offer.contractType || null,
    workday: offer.workday || null,
  }
}

/** Parse the `offers` array out of a search page payload. */
export function parseSearchPayload(html: string): { cards: JobCard[]; total: number | null } {
  const props = extractInitialProps(html)
  if (!props) return { cards: [], total: null }

  const offers = Array.isArray(props.offers) ? (props.offers as RawOffer[]) : []
  const cards: JobCard[] = []
  for (const offer of offers) {
    // Parse each offer independently so one malformed record cannot break the rest.
    try {
      const card = toCard(offer)
      if (card) cards.push(card)
    } catch {
      continue
    }
  }

  const overview = props.overview as { totalElements?: number } | undefined
  const total = typeof overview?.totalElements === "number" ? overview.totalElements : null
  return { cards, total }
}

interface RawDetailOffer extends RawOffer {
  offerCode?: string
  location?: { city?: string; province?: { label?: string } }
  minimumExperience?: string
  minimumStudies?: { level?: string; ongoingStudy?: boolean }
  minimumRequirements?: string
  desiredRequirements?: string
  numberOfVacancies?: number
  remoteWork?: string
  contract?: { type?: string; workday?: string }
  category?: { name?: string }
  subCategory?: { name?: string }
  requiredSkills?: { name?: string }[]
  socialBenefits?: { name?: string }[]
  level?: string
  companyUrl?: string
}

/** Strip the light HTML InfoJobs allows inside description fields. */
export function htmlToText(input: string): string {
  return input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Parse a single offer page payload. Returns null for expired/blocked pages. */
export function parseDetailPayload(html: string, url: string): JobDetail | null {
  const props = extractInitialProps(html)
  if (!props || typeof props.offer !== "object" || props.offer === null) return null
  const offer = props.offer as RawDetailOffer

  const code = offer.offerCode || offer.code
  if (!code) return null

  const text = (value: string | undefined): string | null =>
    value && value.trim() !== "" ? htmlToText(value) : null

  const location =
    [offer.location?.city, offer.location?.province?.label].filter(Boolean).join(", ") || null

  const contractType =
    [offer.contract?.type, offer.contractType].find((v) => typeof v === "string" && v !== "") ?? null
  const workday =
    [offer.contract?.workday, offer.workday].find((v) => typeof v === "string" && v !== "") ?? null

  const names = (items: { name?: string }[] | undefined): string[] =>
    (items ?? []).map((i) => i.name).filter((n): n is string => typeof n === "string" && n !== "")

  const category =
    [offer.category?.name, offer.subCategory?.name].filter(Boolean).join(" / ") || null

  return {
    id: code,
    title: offer.title || "(untitled)",
    company: offer.companyName || null,
    companyUrl: offer.companyUrl ? absoluteUrl(offer.companyUrl) : null,
    location,
    date: offer.publishedAt || null,
    url,
    teleworking: offer.remoteWork || offer.teleworking || null,
    contractType,
    workday,
    description: text(offer.description),
    salary: offer.salary || null,
    minimumExperience: offer.minimumExperience || null,
    minimumStudies: offer.minimumStudies?.level || null,
    requirements: text(offer.minimumRequirements),
    desiredRequirements: text(offer.desiredRequirements),
    vacancies: typeof offer.numberOfVacancies === "number" ? offer.numberOfVacancies : null,
    level: offer.level || null,
    category,
    skills: names(offer.requiredSkills),
    benefits: names(offer.socialBenefits),
    applyUrl: url,
  }
}

/**
 * InfoJobs province filter ids, as published in the search page's own
 * `aggregation.province` facet. Spanish provinces only; the portal also exposes
 * foreign regions, which this CLI does not target.
 */
export const PROVINCE_IDS: Record<string, string> = {
  "a coruna": "28",
  alava: "2",
  albacete: "3",
  alicante: "4",
  almeria: "5",
  asturias: "6",
  avila: "7",
  badajoz: "8",
  baleares: "26",
  barcelona: "9",
  burgos: "10",
  caceres: "11",
  cadiz: "12",
  cantabria: "13",
  castellon: "14",
  ceuta: "15",
  "ciudad real": "16",
  cordoba: "17",
  cuenca: "18",
  girona: "19",
  granada: "21",
  guadalajara: "22",
  guipuzcoa: "23",
  huelva: "24",
  huesca: "25",
  jaen: "27",
  "la rioja": "29",
  "las palmas": "20",
  leon: "30",
  lleida: "31",
  lugo: "32",
  madrid: "33",
  malaga: "34",
  melilla: "35",
  murcia: "36",
  navarra: "37",
  ourense: "38",
  palencia: "39",
  pontevedra: "40",
  salamanca: "41",
  "santa cruz de tenerife": "46",
  segovia: "42",
  sevilla: "43",
  soria: "44",
  tarragona: "45",
  teruel: "47",
  toledo: "48",
  valencia: "49",
  valladolid: "50",
  vizcaya: "51",
  zamora: "52",
  zaragoza: "53",
}

/** Aliases for provinces whose official name is bilingual or commonly shortened. */
const PROVINCE_ALIASES: Record<string, string> = {
  coruna: "a coruna",
  "la coruna": "a coruna",
  araba: "alava",
  alacant: "alicante",
  "illes balears": "baleares",
  "islas baleares": "baleares",
  mallorca: "baleares",
  castello: "castellon",
  gerona: "girona",
  gipuzkoa: "guipuzcoa",
  "san sebastian": "guipuzcoa",
  bizkaia: "vizcaya",
  bilbao: "vizcaya",
  lerida: "lleida",
  orense: "ourense",
  tenerife: "santa cruz de tenerife",
  valencia_valencia: "valencia",
  bcn: "barcelona",
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Resolve a province name to InfoJobs' numeric id, or null if unknown. */
export function resolveProvince(input: string): string | null {
  const key = normalize(input)
  const canonical = PROVINCE_ALIASES[key] ?? key
  return PROVINCE_IDS[canonical] ?? null
}

export function provinceNames(): string[] {
  return Object.keys(PROVINCE_IDS).sort()
}

/** Teleworking facet ids used by InfoJobs. */
export function teleworkingFlag(mode: string | undefined): string | null {
  switch (normalize(mode || "")) {
    case "onsite":
    case "presencial":
      return "1"
    case "remote":
    case "remoto":
    case "teletrabajo":
      return "2"
    case "hybrid":
    case "hibrido":
      return "3"
    default:
      return null
  }
}

/**
 * Map a job age in days onto InfoJobs' `sinceDate` enum. The portal only offers
 * these buckets, so the value is rounded up to the next one it supports.
 */
export function jobageToSinceDate(days: number): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  if (days <= 1) return "_24_HOURS"
  if (days <= 7) return "_7_DAYS"
  if (days <= 15) return "_15_DAYS"
  return null
}

/** Build the SEO-path slug InfoJobs uses for a keyword search. */
export function keywordSlug(query: string | undefined): string {
  const slug = normalize(query || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "empleo"
}
