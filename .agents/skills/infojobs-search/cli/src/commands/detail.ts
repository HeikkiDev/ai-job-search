import { SITE, htmlFetch, parseDetailPayload, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * InfoJobs only server-renders an offer on its canonical SEO URL
 * (/<city>/<slug>/of-i<code>). The bare /of-i<code> shortcut is served an
 * anti-bot challenge instead, so a code on its own cannot be resolved — callers
 * must pass the `url` that `search` returns for the offer.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (/^https?:\/\/(www\.)?infojobs\.net\//i.test(trimmed)) return trimmed.split("?")[0]
  if (trimmed.startsWith("//www.infojobs.net/")) return `https:${trimmed.split("?")[0]}`
  // A site-relative path, with or without the leading slash.
  if (/^\/?[a-z0-9-]+\/[^\s]*of-i[a-f0-9]+/i.test(trimmed)) {
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
    return `${SITE}${path.split("?")[0]}`
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = normalizeUrl(opts.id)
  if (!url) {
    if (/^[a-f0-9]{20,}$/i.test(opts.id.trim())) {
      writeError(
        `InfoJobs cannot resolve an offer from its code alone ("${opts.id}") — the /of-i<code> ` +
          "shortcut is served an anti-bot challenge. Pass the full offer URL from the search " +
          "results instead (the `url` field of each result).",
        "NEED_URL",
      )
      return 1
    }
    writeError(`Could not parse an InfoJobs offer URL from "${opts.id}"`, "BAD_ID")
    return 1
  }

  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Offer not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetailPayload(html, url)
    if (!job) {
      writeError(
        "Offer has no readable payload — it has most likely expired or been removed by the company.",
        "NOT_AVAILABLE",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.teleworking ? `Modalidad: ${job.teleworking}` : "",
        job.contractType ? `Contrato: ${job.contractType}` : "",
        job.workday ? `Jornada: ${job.workday}` : "",
        job.salary ? `Salario: ${job.salary}` : "",
        job.minimumExperience ? `Experiencia mínima: ${job.minimumExperience}` : "",
        job.minimumStudies ? `Estudios mínimos: ${job.minimumStudies}` : "",
        job.level ? `Nivel: ${job.level}` : "",
        job.category ? `Categoría: ${job.category}` : "",
        job.skills.length ? `Competencias: ${job.skills.join(", ")}` : "",
        job.benefits.length ? `Beneficios: ${job.benefits.join(", ")}` : "",
        job.vacancies !== null ? `Vacantes: ${job.vacancies}` : "",
        job.date ? `Publicada: ${job.date.slice(0, 10)}` : "",
        "",
        job.description || "(sin descripción)",
        job.requirements ? `\nRequisitos mínimos\n${job.requirements}` : "",
        job.desiredRequirements ? `\nRequisitos deseados\n${job.desiredRequirements}` : "",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
