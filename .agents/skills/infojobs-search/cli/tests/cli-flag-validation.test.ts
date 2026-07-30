import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";
import { buildUrl, type SearchOpts } from "../src/commands/search";
import { normalizeUrl } from "../src/commands/detail";

const base: SearchOpts = { jobage: 9999, page: 1, sort: "relevance", format: "json" };

describe("buildUrl", () => {
  test("uses the crawlable /ofertas-trabajo path, not the disallowed search endpoint", () => {
    const url = buildUrl({ ...base, query: "python" }) as string;
    expect(url).toStartWith("https://www.infojobs.net/ofertas-trabajo/python?");
    expect(url).not.toContain("list.xhtml");
  });

  test("keeps the keyword as a parameter as well as in the path", () => {
    const url = buildUrl({ ...base, query: "data engineer" }) as string;
    expect(url).toContain("/ofertas-trabajo/data-engineer?");
    expect(url).toContain("keyword=data+engineer");
  });

  test("resolves a province name to its numeric id", () => {
    expect(buildUrl({ ...base, query: "x", location: "Madrid" }) as string).toContain("provinceIds=33");
  });

  test("rejects an unknown province with a helpful error", () => {
    const result = buildUrl({ ...base, query: "x", location: "Narnia" });
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toBe("BAD_LOCATION");
    expect((result as { error: string }).error).toContain("madrid");
  });

  test("maps --remote onto the teleworking facet", () => {
    expect(buildUrl({ ...base, query: "x", remote: "remote" }) as string).toContain("teleworkingIds=2");
  });

  test("rejects an unknown --remote mode", () => {
    const result = buildUrl({ ...base, query: "x", remote: "telepathy" });
    expect((result as { code: string }).code).toBe("BAD_ARG");
  });

  test("maps --jobage onto sinceDate", () => {
    expect(buildUrl({ ...base, query: "x", jobage: 7 }) as string).toContain("sinceDate=_7_DAYS");
  });

  test("omits sinceDate when no job age applies", () => {
    expect(buildUrl({ ...base, query: "x" }) as string).not.toContain("sinceDate");
  });

  test("adds sortBy only when sorting by date", () => {
    expect(buildUrl({ ...base, query: "x", sort: "date" }) as string).toContain("sortBy=PUBLICATION_DATE");
    expect(buildUrl({ ...base, query: "x" }) as string).not.toContain("sortBy");
  });

  test("omits the page parameter on page 1", () => {
    expect(buildUrl({ ...base, query: "x" }) as string).not.toContain("page=");
    expect(buildUrl({ ...base, query: "x", page: 3 }) as string).toContain("page=3");
  });

  test("falls back to a generic path when no query is given", () => {
    expect(buildUrl({ ...base }) as string).toContain("/ofertas-trabajo/empleo");
  });
});

describe("normalizeUrl", () => {
  test("accepts a full offer URL and strips its query string", () => {
    expect(normalizeUrl("https://www.infojobs.net/madrid/rol/of-iabc123?applicationOrigin=search")).toBe(
      "https://www.infojobs.net/madrid/rol/of-iabc123",
    );
  });

  test("accepts a protocol-relative URL", () => {
    expect(normalizeUrl("//www.infojobs.net/madrid/rol/of-iabc123")).toBe(
      "https://www.infojobs.net/madrid/rol/of-iabc123",
    );
  });

  test("accepts a site-relative path with or without a leading slash", () => {
    expect(normalizeUrl("/madrid/rol/of-iabc123")).toBe("https://www.infojobs.net/madrid/rol/of-iabc123");
    expect(normalizeUrl("madrid/rol/of-iabc123")).toBe("https://www.infojobs.net/madrid/rol/of-iabc123");
  });

  test("rejects a bare offer code", () => {
    expect(normalizeUrl("c53b4193194dbda16476f89b69064b")).toBeNull();
  });

  test("rejects unrelated input", () => {
    expect(normalizeUrl("https://example.com/job/1")).toBeNull();
  });
});

describe("CLI argument validation", () => {
  test("no arguments prints help and exits 1", async () => {
    const result = await runCLI([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("infojobs-cli");
  });

  test("--help exits 0", async () => {
    const result = await runCLI(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USAGE");
  });

  test("an unknown command errors as JSON on stderr", async () => {
    const result = await runCLI(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).code).toBe("BAD_CMD");
  });

  test("a non-numeric --limit is rejected", async () => {
    const result = await runCLI(["search", "-q", "x", "--limit", "abc"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("an unknown --sort is rejected", async () => {
    const result = await runCLI(["search", "-q", "x", "--sort", "salary"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("an unknown province is rejected without a network call", async () => {
    const result = await runCLI(["search", "-q", "x", "-l", "Narnia"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_LOCATION");
  });

  test("detail without an argument is rejected", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("NO_ID");
  });

  test("detail with a bare code explains that a URL is required", async () => {
    const result = await runCLI(["detail", "c53b4193194dbda16476f89b69064b"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NEED_URL");
    expect(err.error).toContain("full offer URL");
  });

  test("detail with unrelated input is rejected", async () => {
    const result = await runCLI(["detail", "https://example.com/job/1"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID");
  });
});
