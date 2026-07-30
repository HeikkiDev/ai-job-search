import { API_BASE, jsonFetch, toDetail, writeError, type RawDetail } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a numeric offer id or any getmanfred.com offer URL containing one. */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d+$/)
  if (bare) return input
  const fromUrl = input.match(/ofertas-empleo\/(\d+)/) || input.match(/offers\/(\d+)/)
  if (fromUrl) return fromUrl[1]
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an offer ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await jsonFetch<RawDetail>(`${API_BASE}/${id}?lang=ES`)
    if (!raw || typeof raw.id !== "number") {
      writeError("Offer not found", "NOT_FOUND")
      return 1
    }
    const job = toDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.salary ? `Salario: ${job.salary}` : "",
        job.remotePercentage === null ? "" : `Remoto: ${job.remotePercentage}%`,
        job.isFreelance ? "Modalidad: freelance" : "",
        job.techs.length ? `Tecnologías: ${job.techs.join(", ")}` : "",
        job.languages.length ? `Idiomas: ${job.languages.join(", ")}` : "",
        job.perks.length ? `Beneficios: ${job.perks.join(", ")}` : "",
        "",
        job.description || "(sin descripción)",
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
