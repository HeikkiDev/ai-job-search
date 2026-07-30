import { describe, test, expect } from "bun:test";
import {
  formatSalary,
  toEuros,
  normalize,
  offerUrl,
  toCard,
  toDetail,
  filterOffers,
  markdownToText,
  buildDescription,
  searchableText,
  type RawOffer,
} from "../src/helpers";

function offer(over: Partial<RawOffer> = {}): RawOffer {
  return {
    id: 1,
    position: "Backend Engineer",
    slug: "acme-backend-engineer",
    locations: ["Madrid, España"],
    highlights: ["🏠 Híbrido"],
    company: { name: "Acme", web: "https://acme.example" },
    updatedAt: "2026-07-01T00:00:00.000Z",
    remotePercentage: 60,
    ...over,
  };
}

describe("toEuros", () => {
  test("scales thousands-of-euros figures up", () => {
    expect(toEuros(55)).toBe(55000);
  });

  test("leaves full-euro figures alone", () => {
    expect(toEuros(60000)).toBe(60000);
  });

  test("treats zero and undefined as unspecified", () => {
    expect(toEuros(0)).toBe(0);
    expect(toEuros(undefined)).toBe(0);
  });
});

describe("formatSalary", () => {
  test("renders a range from thousands notation", () => {
    expect(formatSalary(offer({ salaryFrom: 35, salaryTo: 40 }))).toBe("35k-40k €");
  });

  test("renders a range from full-euro notation identically", () => {
    expect(formatSalary(offer({ salaryFrom: 35000, salaryTo: 40000 }))).toBe("35k-40k €");
  });

  test("collapses an equal from/to into a single figure", () => {
    expect(formatSalary(offer({ salaryFrom: 60000, salaryTo: 60000 }))).toBe("60k €");
  });

  test("handles a one-sided range", () => {
    expect(formatSalary(offer({ salaryFrom: 0, salaryTo: 55 }))).toBe("55k €");
  });

  test("returns null when no salary is published", () => {
    expect(formatSalary(offer({ salaryFrom: 0, salaryTo: 0 }))).toBeNull();
  });

  test("honours a non-euro currency", () => {
    expect(formatSalary(offer({ salaryFrom: 50, salaryTo: 60, currency: "$" }))).toBe("50k-60k $");
  });
});

describe("normalize", () => {
  test("strips diacritics and lowercases", () => {
    expect(normalize("Málaga")).toBe("malaga");
    expect(normalize("ESPAÑA")).toBe("espana");
  });
});

describe("offerUrl", () => {
  test("builds the public offer URL from id and slug", () => {
    expect(offerUrl(offer({ id: 8414, slug: "cells-ia-senior" }))).toBe(
      "https://www.getmanfred.com/ofertas-empleo/8414/cells-ia-senior",
    );
  });

  test("falls back to the id when the slug is absent", () => {
    expect(offerUrl(offer({ id: 8414, slug: undefined }))).toBe(
      "https://www.getmanfred.com/ofertas-empleo/8414",
    );
  });
});

describe("toCard", () => {
  test("maps the API shape onto the portal-skill contract", () => {
    const card = toCard(offer({ id: 7, salaryFrom: 40, salaryTo: 50 }));
    expect(card.id).toBe("7");
    expect(card.title).toBe("Backend Engineer");
    expect(card.company).toBe("Acme");
    expect(card.location).toBe("Madrid, España");
    expect(card.date).toBe("2026-07-01T00:00:00.000Z");
    expect(card.salary).toBe("40k-50k €");
    expect(card.remotePercentage).toBe(60);
  });

  test("emits null (never undefined) for missing values", () => {
    const card = toCard({ id: 9 });
    expect(card.company).toBeNull();
    expect(card.companyUrl).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
    expect(card.salary).toBeNull();
    expect(card.title).toBe("(untitled)");
  });

  test("joins multiple locations", () => {
    const card = toCard(offer({ locations: ["Madrid, España", "Barcelona, España"] }));
    expect(card.location).toBe("Madrid, España; Barcelona, España");
  });
});

describe("searchableText", () => {
  test("includes position, company, highlights and locations", () => {
    const text = searchableText(offer({ highlights: ["Producto"] }));
    expect(text).toContain("backend engineer");
    expect(text).toContain("acme");
    expect(text).toContain("producto");
    expect(text).toContain("madrid");
  });
});

describe("filterOffers", () => {
  const now = new Date("2026-07-30T00:00:00.000Z");

  test("requires every query term to match", () => {
    const offers = [offer({ id: 1, position: "Senior Backend Engineer" }), offer({ id: 2, position: "Frontend Engineer" })];
    expect(filterOffers(offers, { query: "backend engineer", now }).map((o) => o.id)).toEqual([1]);
  });

  test("query matching ignores accents and case", () => {
    const offers = [offer({ position: "Ingeniero de Investigación" })];
    expect(filterOffers(offers, { query: "investigacion", now })).toHaveLength(1);
  });

  test("filters by location substring", () => {
    const offers = [offer({ id: 1, locations: ["Madrid, España"] }), offer({ id: 2, locations: ["Barcelona, España"] })];
    expect(filterOffers(offers, { location: "barcelona", now }).map((o) => o.id)).toEqual([2]);
  });

  test("filters by minimum remote percentage", () => {
    const offers = [offer({ id: 1, remotePercentage: 100 }), offer({ id: 2, remotePercentage: 60 })];
    expect(filterOffers(offers, { remote: 100, now }).map((o) => o.id)).toEqual([1]);
  });

  test("treats a missing remotePercentage as zero", () => {
    expect(filterOffers([offer({ remotePercentage: undefined })], { remote: 1, now })).toHaveLength(0);
  });

  test("filters by job age in days", () => {
    const offers = [
      offer({ id: 1, updatedAt: "2026-07-29T00:00:00.000Z" }),
      offer({ id: 2, updatedAt: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(filterOffers(offers, { jobage: 7, now }).map((o) => o.id)).toEqual([1]);
  });

  test("drops offers with an unparseable date when a job age is set", () => {
    expect(filterOffers([offer({ updatedAt: "not-a-date" })], { jobage: 7, now })).toHaveLength(0);
  });

  test("a sentinel job age keeps everything", () => {
    const offers = [offer({ updatedAt: "2020-01-01T00:00:00.000Z" })];
    expect(filterOffers(offers, { jobage: 9999, now })).toHaveLength(1);
  });

  test("no filters means no filtering", () => {
    const offers = [offer({ id: 1 }), offer({ id: 2 })];
    expect(filterOffers(offers, { now })).toHaveLength(2);
  });
});

describe("markdownToText", () => {
  test("unwraps bold, italics and inline code", () => {
    expect(markdownToText("**Bold** and *italic* and `code`")).toBe("Bold and italic and code");
  });

  test("keeps link text and target", () => {
    expect(markdownToText("[Manfred](https://x.example)")).toBe("Manfred (https://x.example)");
  });

  test("drops images and heading markers", () => {
    expect(markdownToText("![alt](img.png)\n## Title")).toBe("Title");
  });

  test("collapses runs of blank lines", () => {
    expect(markdownToText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("buildDescription", () => {
  test("joins only the populated sections, in order", () => {
    const text = buildDescription({ id: 1, introduction: "Intro", whatTheyAskFor: "Ask", whatOffering: "" });
    expect(text).toContain("## Introducción");
    expect(text).toContain("## Qué piden");
    expect(text).not.toContain("Qué ofrecen");
    expect((text as string).indexOf("Introducción")).toBeLessThan((text as string).indexOf("Qué piden"));
  });

  test("returns null when the offer has no prose at all", () => {
    expect(buildDescription({ id: 1 })).toBeNull();
  });
});

describe("toDetail", () => {
  test("flattens techs, languages and perks to strings", () => {
    const detail = toDetail({
      ...offer({ id: 3 }),
      techs: [{ name: "Python", level: "ADVANCED" }, { name: "Django" }],
      languages: [{ name: "Inglés", level: "Fluent" }],
      perks: [{ name: "Clases de Idiomas" }],
      introduction: "Hola",
    });
    expect(detail.techs).toEqual(["Python (advanced)", "Django"]);
    expect(detail.languages).toEqual(["Inglés (Fluent)"]);
    expect(detail.perks).toEqual(["Clases de Idiomas"]);
    expect(detail.applyUrl).toBe(detail.url);
  });

  test("defaults collections to empty arrays", () => {
    const detail = toDetail({ id: 4 });
    expect(detail.techs).toEqual([]);
    expect(detail.languages).toEqual([]);
    expect(detail.perks).toEqual([]);
    expect(detail.description).toBeNull();
  });
});
