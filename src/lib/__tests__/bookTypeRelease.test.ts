import { describe, expect, it } from "vitest";
import {
  isBookTypeReleasedForClient,
  parseQualifiedBookTypes,
} from "@/lib/bookTypeRelease";

describe("book type release gate", () => {
  it("normalizes and filters the qualification allow-list", () => {
    expect([...parseQualifiedBookTypes("Academic, technical,unknown, FICTION")].sort())
      .toEqual(["academic", "fiction", "technical"]);
  });

  it("keeps standard text available regardless of advanced authoring", () => {
    expect(isBookTypeReleasedForClient("text", false, "")).toBe(true);
  });

  it("keeps advanced modes hidden while the global switch is closed", () => {
    expect(isBookTypeReleasedForClient("academic", false, "academic")).toBe(false);
  });

  it("does not expose modes missing from the exact qualification allow-list", () => {
    expect(isBookTypeReleasedForClient("academic", true, "technical")).toBe(false);
    expect(isBookTypeReleasedForClient("fiction", true, "academic,technical")).toBe(false);
  });

  it("exposes only explicitly qualified advanced modes", () => {
    expect(isBookTypeReleasedForClient("academic", true, "academic,technical")).toBe(true);
    expect(isBookTypeReleasedForClient("technical", true, "academic,technical")).toBe(true);
  });
});
