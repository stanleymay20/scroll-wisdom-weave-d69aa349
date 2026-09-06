import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateAssetRights } from "./assetRights.ts";

const base = {
  source: "wikimedia",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
  imageUrl: "https://upload.wikimedia.org/example.jpg",
  attribution: "Example Author — Wikimedia Commons",
};

Deno.test("asset rights allows explicit public domain, CC0, CC BY and CC BY-SA", () => {
  for (const license of ["Public Domain", "CC0", "CC BY 4.0", "CC-BY-SA-4.0"]) {
    const decision = evaluateAssetRights({ ...base, license });
    assertEquals(decision.allowed, true, license);
    assertEquals(decision.code, "rights_ok", license);
  }
});

Deno.test("asset rights rejects unknown, NC, ND and unsupported licenses", () => {
  const cases = [
    ["Unknown", "ambiguous_license"],
    ["CC BY-NC 4.0", "noncommercial_license"],
    ["CC BY-ND 4.0", "no_derivatives_license"],
    ["Custom Museum Terms", "unsupported_license"],
  ] as const;

  for (const [license, code] of cases) {
    const decision = evaluateAssetRights({ ...base, license });
    assertEquals(decision.allowed, false, license);
    assertEquals(decision.code, code, license);
  }
});

Deno.test("asset rights requires provenance and attribution", () => {
  assertEquals(evaluateAssetRights({ ...base, sourceUrl: "", license: "CC0" }).code, "missing_source_url");
  assertEquals(evaluateAssetRights({ ...base, imageUrl: "", license: "CC0" }).code, "missing_image_url");
  assertEquals(evaluateAssetRights({ ...base, attribution: "", license: "CC0" }).code, "missing_attribution");
  assertEquals(evaluateAssetRights({ ...base, license: "" }).code, "missing_license");
});
