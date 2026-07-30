import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";
import { normalizeId } from "../src/commands/detail";

describe("normalizeId", () => {
  test("accepts a bare numeric id", () => {
    expect(normalizeId("8414")).toBe("8414");
  });

  test("extracts the id from a public offer URL", () => {
    expect(normalizeId("https://www.getmanfred.com/ofertas-empleo/8414/cells-ia-senior")).toBe("8414");
  });

  test("extracts the id from an API URL", () => {
    expect(normalizeId("https://www.getmanfred.com/api/v2/public/offers/8414?lang=ES")).toBe("8414");
  });

  test("rejects input with no id", () => {
    expect(normalizeId("cells-ia-senior")).toBeNull();
  });
});

describe("CLI argument validation", () => {
  test("no arguments prints help and exits 1", async () => {
    const result = await runCLI([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("manfred-cli");
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
    const result = await runCLI(["search", "--limit", "abc"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("a non-numeric --jobage is rejected", async () => {
    const result = await runCLI(["search", "--jobage", "soon"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("--remote outside 0-100 is rejected", async () => {
    const result = await runCLI(["search", "--remote", "150"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("detail without an id is rejected", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("NO_ID");
  });

  test("detail with an unparseable id is rejected", async () => {
    const result = await runCLI(["detail", "not-an-offer"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID");
  });
});
