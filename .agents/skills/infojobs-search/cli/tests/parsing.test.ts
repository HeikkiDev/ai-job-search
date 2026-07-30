import { describe, test, expect } from "bun:test";
import {
  extractInitialProps,
  parseSearchPayload,
  parseDetailPayload,
  absoluteUrl,
  toCard,
  htmlToText,
  normalize,
  resolveProvince,
  provinceNames,
  teleworkingFlag,
  jobageToSinceDate,
  keywordSlug,
} from "../src/helpers";

/**
 * InfoJobs embeds its data as `window.__INITIAL_PROPS__ = JSON.parse("<js string>")`,
 * so a fixture has to double-encode the payload exactly as the site does.
 */
function page(payload: unknown, extra = ""): string {
  const inner = JSON.stringify(payload);
  return `<html><head></head><body>${extra}<script>window.__INITIAL_PROPS__ = JSON.parse(${JSON.stringify(
    inner,
  )});</script></body></html>`;
}

function searchOffer(code: string, title: string, over: Record<string, unknown> = {}) {
  return {
    code,
    title,
    companyName: "Acme",
    companyLink: "//acme.ofertas-trabajo.infojobs.net",
    city: "Madrid",
    link: `//www.infojobs.net/madrid/${title.toLowerCase().replace(/\s+/g, "-")}/of-i${code}?applicationOrigin=search`,
    publishedAt: "2026-07-30T10:00:00Z",
    teleworking: "Híbrido",
    contractType: "Indefinido",
    workday: "Completa",
    ...over,
  };
}

describe("extractInitialProps", () => {
  test("decodes the double-encoded payload", () => {
    const props = extractInitialProps(page({ offers: [], overview: { totalElements: 7 } }));
    expect((props?.overview as { totalElements: number }).totalElements).toBe(7);
  });

  test("survives escaped quotes and backslashes inside the payload", () => {
    const props = extractInitialProps(page({ note: 'He said "hola" \\ bye' }));
    expect(props?.note).toBe('He said "hola" \\ bye');
  });

  test("preserves non-ASCII text", () => {
    const props = extractInitialProps(page({ note: "Ingeniería en Málaga" }));
    expect(props?.note).toBe("Ingeniería en Málaga");
  });

  test("returns null when the marker is absent (anti-bot shell page)", () => {
    expect(extractInitialProps("<html><body>captcha</body></html>")).toBeNull();
  });

  test("returns null on a truncated string literal", () => {
    expect(extractInitialProps('<script>window.__INITIAL_PROPS__ = JSON.parse("{\\"a\\":1}')).toBeNull();
  });

  test("returns null when the payload is not valid JSON", () => {
    expect(extractInitialProps('<script>window.__INITIAL_PROPS__ = JSON.parse("not json");</script>')).toBeNull();
  });

  test("ignores an earlier unrelated JSON.parse call", () => {
    const html = `<script>var x = JSON.parse("[1,2]");</script>${page({ overview: { totalElements: 3 } })}`;
    const props = extractInitialProps(html);
    expect((props?.overview as { totalElements: number }).totalElements).toBe(3);
  });
});

describe("absoluteUrl", () => {
  test("expands protocol-relative links", () => {
    expect(absoluteUrl("//www.infojobs.net/madrid/x/of-iabc")).toBe(
      "https://www.infojobs.net/madrid/x/of-iabc",
    );
  });

  test("expands site-relative links", () => {
    expect(absoluteUrl("/madrid/x")).toBe("https://www.infojobs.net/madrid/x");
  });

  test("strips the query string", () => {
    expect(absoluteUrl("//www.infojobs.net/x?applicationOrigin=search&page=1")).toBe(
      "https://www.infojobs.net/x",
    );
  });

  test("returns an empty string for a missing link", () => {
    expect(absoluteUrl(undefined)).toBe("");
  });
});

describe("toCard", () => {
  test("maps an offer onto the portal-skill contract", () => {
    const card = toCard(searchOffer("abc123", "Data Engineer"));
    expect(card?.id).toBe("abc123");
    expect(card?.title).toBe("Data Engineer");
    expect(card?.company).toBe("Acme");
    expect(card?.location).toBe("Madrid");
    expect(card?.date).toBe("2026-07-30T10:00:00Z");
    expect(card?.url).toBe("https://www.infojobs.net/madrid/data-engineer/of-iabc123");
  });

  test("joins city and province when both are present", () => {
    const card = toCard(searchOffer("x", "Rol", { province: "Vizcaya/Bizkaia", city: "Bilbao" }));
    expect(card?.location).toBe("Bilbao, Vizcaya/Bizkaia");
  });

  test("returns null when the record has no code or title", () => {
    expect(toCard({ title: "No code" })).toBeNull();
    expect(toCard({ code: "abc" })).toBeNull();
  });

  test("emits null (never undefined) for missing optional values", () => {
    const card = toCard({ code: "a", title: "T" });
    expect(card?.company).toBeNull();
    expect(card?.location).toBeNull();
    expect(card?.date).toBeNull();
    expect(card?.teleworking).toBeNull();
  });
});

describe("parseSearchPayload", () => {
  test("reads offers and the total from the payload", () => {
    const html = page({
      offers: [searchOffer("a1", "Uno"), searchOffer("a2", "Dos")],
      overview: { totalElements: 408 },
    });
    const { cards, total } = parseSearchPayload(html);
    expect(cards).toHaveLength(2);
    expect(total).toBe(408);
  });

  test("skips malformed records instead of failing the whole page", () => {
    const html = page({
      offers: [searchOffer("a1", "Uno"), { title: "no code" }, searchOffer("a3", "Tres")],
      overview: { totalElements: 3 },
    });
    expect(parseSearchPayload(html).cards.map((c) => c.id)).toEqual(["a1", "a3"]);
  });

  test("returns a null total when the payload has no overview", () => {
    const { cards, total } = parseSearchPayload(page({ offers: [searchOffer("a1", "Uno")] }));
    expect(cards).toHaveLength(1);
    expect(total).toBeNull();
  });

  test("an unreadable page yields no cards and a null total", () => {
    expect(parseSearchPayload("<html>captcha</html>")).toEqual({ cards: [], total: null });
  });

  test("a payload with an empty offers array is not an error", () => {
    expect(parseSearchPayload(page({ offers: [], overview: { totalElements: 0 } }))).toEqual({
      cards: [],
      total: 0,
    });
  });
});

describe("htmlToText", () => {
  test("turns <br> and block ends into newlines", () => {
    expect(htmlToText("a<br/>b")).toBe("a\nb");
    expect(htmlToText("<p>uno</p><p>dos</p>")).toBe("uno\ndos");
    expect(htmlToText("<ul><li>uno</li><li>dos</li></ul>")).toBe("uno\ndos");
  });

  test("decodes the entities InfoJobs emits", () => {
    expect(htmlToText("R&amp;D &lt;tag&gt; &quot;q&quot; &#39;s&#39;")).toBe(`R&D <tag> "q" 's'`);
  });

  test("collapses runs of blank lines", () => {
    expect(htmlToText("a<p></p><p></p><p></p>b")).toBe("a\n\nb");
  });
});

describe("parseDetailPayload", () => {
  const url = "https://www.infojobs.net/bilbao/analista/of-iabc";

  function detailPage(over: Record<string, unknown> = {}) {
    return page({
      offer: {
        offerCode: "abc",
        title: "Analista / Programador/a",
        companyName: "Acme",
        companyUrl: "//acme.ofertas-trabajo.infojobs.net",
        location: { city: "Bilbao", province: { id: 51, label: "Vizcaya/Bizkaia" } },
        contract: { type: "Indefinido", workday: "Completa" },
        minimumStudies: { ongoingStudy: false, level: "Ciclo Formativo Grado Medio" },
        minimumExperience: "Al menos 2 años",
        minimumRequirements: "SQL<br/>Python",
        desiredRequirements: "",
        description: "Descripción <b>rica</b>",
        salary: "Salario no disponible",
        remoteWork: "Presencial",
        numberOfVacancies: 1,
        level: "Empleado/a",
        category: { name: "Informática y telecomunicaciones" },
        subCategory: { name: "Programación" },
        requiredSkills: [{ name: "SQL" }, { name: "Python" }],
        socialBenefits: [],
        publishedAt: "2026-07-29T09:00:00Z",
        ...over,
      },
    });
  }

  test("flattens InfoJobs' nested objects into strings", () => {
    const job = parseDetailPayload(detailPage(), url);
    expect(job?.location).toBe("Bilbao, Vizcaya/Bizkaia");
    expect(job?.contractType).toBe("Indefinido");
    expect(job?.workday).toBe("Completa");
    expect(job?.minimumStudies).toBe("Ciclo Formativo Grado Medio");
    expect(job?.category).toBe("Informática y telecomunicaciones / Programación");
  });

  test("never leaks '[object Object]' into any string field", () => {
    const job = parseDetailPayload(detailPage(), url);
    for (const value of Object.values(job as Record<string, unknown>)) {
      if (typeof value === "string") expect(value).not.toContain("[object Object]");
    }
  });

  test("strips markup from description and requirements", () => {
    const job = parseDetailPayload(detailPage(), url);
    expect(job?.description).toBe("Descripción rica");
    expect(job?.requirements).toBe("SQL\nPython");
  });

  test("maps empty strings to null rather than empty output", () => {
    expect(parseDetailPayload(detailPage(), url)?.desiredRequirements).toBeNull();
  });

  test("collects skills and tolerates empty benefit lists", () => {
    const job = parseDetailPayload(detailPage(), url);
    expect(job?.skills).toEqual(["SQL", "Python"]);
    expect(job?.benefits).toEqual([]);
  });

  test("returns null for an expired offer with no payload", () => {
    expect(parseDetailPayload("<html>Oferta no disponible</html>", url)).toBeNull();
  });

  test("returns null when the payload carries no offer", () => {
    expect(parseDetailPayload(page({ user: null }), url)).toBeNull();
  });

  test("returns null when the offer has no code", () => {
    expect(parseDetailPayload(page({ offer: { title: "x" } }), url)).toBeNull();
  });
});

describe("normalize", () => {
  test("strips diacritics and lowercases", () => {
    expect(normalize("MÁLAGA")).toBe("malaga");
    expect(normalize("  Gipuzkoa  ")).toBe("gipuzkoa");
  });
});

describe("resolveProvince", () => {
  test("resolves a plain province name", () => {
    expect(resolveProvince("Madrid")).toBe("33");
  });

  test("is accent- and case-insensitive", () => {
    expect(resolveProvince("MÁLAGA")).toBe("34");
  });

  test("resolves bilingual and colloquial aliases", () => {
    expect(resolveProvince("Bizkaia")).toBe("51");
    expect(resolveProvince("Gipuzkoa")).toBe("23");
    expect(resolveProvince("Islas Baleares")).toBe("26");
    expect(resolveProvince("A Coruña")).toBe("28");
  });

  test("returns null for an unknown place", () => {
    expect(resolveProvince("Narnia")).toBeNull();
  });

  test("exposes every province for the error message", () => {
    const names = provinceNames();
    expect(names.length).toBeGreaterThan(45);
    expect(names).toContain("madrid");
    expect(names).toEqual([...names].sort());
  });
});

describe("teleworkingFlag", () => {
  test("maps English and Spanish modes to InfoJobs ids", () => {
    expect(teleworkingFlag("onsite")).toBe("1");
    expect(teleworkingFlag("presencial")).toBe("1");
    expect(teleworkingFlag("remote")).toBe("2");
    expect(teleworkingFlag("teletrabajo")).toBe("2");
    expect(teleworkingFlag("hybrid")).toBe("3");
    expect(teleworkingFlag("híbrido")).toBe("3");
  });

  test("returns null for an unknown or missing mode", () => {
    expect(teleworkingFlag("carrier pigeon")).toBeNull();
    expect(teleworkingFlag(undefined)).toBeNull();
  });
});

describe("jobageToSinceDate", () => {
  test("rounds up to the nearest bucket InfoJobs supports", () => {
    expect(jobageToSinceDate(1)).toBe("_24_HOURS");
    expect(jobageToSinceDate(3)).toBe("_7_DAYS");
    expect(jobageToSinceDate(7)).toBe("_7_DAYS");
    expect(jobageToSinceDate(10)).toBe("_15_DAYS");
  });

  test("returns null when no filter applies", () => {
    expect(jobageToSinceDate(0)).toBeNull();
    expect(jobageToSinceDate(30)).toBeNull();
    expect(jobageToSinceDate(9999)).toBeNull();
  });
});

describe("keywordSlug", () => {
  test("slugifies a multi-word query", () => {
    expect(keywordSlug("data engineer")).toBe("data-engineer");
  });

  test("strips accents and punctuation", () => {
    expect(keywordSlug("Diseñador/a UX")).toBe("disenador-a-ux");
  });

  test("falls back to a generic path when there is no query", () => {
    expect(keywordSlug(undefined)).toBe("empleo");
    expect(keywordSlug("  ")).toBe("empleo");
  });
});
