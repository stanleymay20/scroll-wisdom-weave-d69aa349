import { describe, expect, it } from "vitest";
import { isAcademicCategory } from "@/lib/academicCategories";

describe("publication evidence categories", () => {
  it("requires evidence for factual business publications", () => {
    expect(isAcademicCategory("business")).toBe(true);
  });

  it("does not automatically force research evidence onto creative/general categories", () => {
    expect(isAcademicCategory("fiction")).toBe(false);
    expect(isAcademicCategory("poetry")).toBe(false);
    expect(isAcademicCategory("non_fiction")).toBe(false);
  });
});
