import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

function apiOffer(id: number, position: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    position,
    slug: `slug-${id}`,
    status: "ACTIVE",
    locations: ["Madrid, España"],
    highlights: [],
    company: { name: "Acme" },
    updatedAt: new Date().toISOString(),
    remotePercentage: 100,
    salaryFrom: 40,
    salaryTo: 50,
    ...extra,
  };
}

function mockApi(payload: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

function captureStdout(): () => string {
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return () => out;
}

function captureStderr(): () => string {
  let out = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  return () => out;
}

const base = { jobage: 9999, page: 1, format: "json" as const };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
});

describe("runSearch", () => {
  test("emits the documented JSON envelope", async () => {
    mockApi([apiOffer(1, "Backend Engineer")]);
    const stdout = captureStdout();

    const code = await runSearch({ ...base });
    expect(code).toBe(0);

    const parsed = JSON.parse(stdout());
    expect(parsed.meta.count).toBe(1);
    expect(parsed.meta.page).toBe(1);
    expect(parsed.results[0].id).toBe("1");
    expect(parsed.results[0].url).toContain("/ofertas-empleo/1/slug-1");
  });

  test("--limit 0 emits zero results", async () => {
    mockApi([apiOffer(1, "Backend Engineer"), apiOffer(2, "Frontend Engineer")]);
    const stdout = captureStdout();

    await runSearch({ ...base, limit: 0 });
    expect(JSON.parse(stdout()).results).toHaveLength(0);
  });

  test("reports total matches independently of the page window", async () => {
    mockApi(Array.from({ length: 25 }, (_, i) => apiOffer(i + 1, "Engineer")));
    const stdout = captureStdout();

    await runSearch({ ...base, page: 2 });
    const parsed = JSON.parse(stdout());
    expect(parsed.meta.totalMatches).toBe(25);
    expect(parsed.results).toHaveLength(5);
    expect(parsed.results[0].id).toBe("21");
  });

  test("a page beyond the result set yields an empty list, not an error", async () => {
    mockApi([apiOffer(1, "Engineer")]);
    const stdout = captureStdout();

    const code = await runSearch({ ...base, page: 9 });
    expect(code).toBe(0);
    expect(JSON.parse(stdout()).results).toHaveLength(0);
  });

  test("table format renders a header and no JSON", async () => {
    mockApi([apiOffer(1, "Backend Engineer")]);
    const stdout = captureStdout();

    await runSearch({ ...base, format: "table" });
    expect(stdout()).toContain("TITLE");
    expect(stdout()).toContain("Backend Engineer");
  });

  test("table format says so when nothing matches", async () => {
    mockApi([]);
    const stdout = captureStdout();

    await runSearch({ ...base, format: "table" });
    expect(stdout().trim()).toBe("No results.");
  });

  test("a non-array payload is a clean error on stderr", async () => {
    mockApi({ statusCode: 400 });
    const stderr = captureStderr();

    const code = await runSearch({ ...base });
    expect(code).toBe(1);
    expect(JSON.parse(stderr()).code).toBe("BAD_RESPONSE");
  });

  test("a transport failure is reported as SEARCH_FAILED", async () => {
    globalThis.fetch = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    const stderr = captureStderr();

    const code = await runSearch({ ...base });
    expect(code).toBe(1);
    expect(JSON.parse(stderr()).code).toBe("SEARCH_FAILED");
  });
});
