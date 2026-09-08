import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkKdpPageCount,
  getKdpMinimumInteriorMarginsIn,
  getKdpPaperbackPageLimits,
  kdpExpectedPageSizePt,
  KDP_STRUCTURAL_RULESET_VERSION,
  resolveKdpPrintProfile,
} from "./kdp-print-rules.ts";

Deno.test("KDP structural rules expose a stable evidence version", () => {
  assertEquals(KDP_STRUCTURAL_RULESET_VERSION, "kdp-structural-v1");
});

Deno.test("6x9 page geometry is exact for no-bleed and bleed modes", () => {
  assertEquals(kdpExpectedPageSizePt("6x9", false), { widthPt: 432, heightPt: 648 });
  assertEquals(kdpExpectedPageSizePt("6x9", true), { widthPt: 441, heightPt: 666 });
});

Deno.test("current KDP inside-gutter bands include the 701–828 band", () => {
  assertEquals(getKdpMinimumInteriorMarginsIn(24, false).inside, 0.375);
  assertEquals(getKdpMinimumInteriorMarginsIn(150, false).inside, 0.375);
  assertEquals(getKdpMinimumInteriorMarginsIn(151, false).inside, 0.5);
  assertEquals(getKdpMinimumInteriorMarginsIn(300, false).inside, 0.5);
  assertEquals(getKdpMinimumInteriorMarginsIn(301, false).inside, 0.625);
  assertEquals(getKdpMinimumInteriorMarginsIn(500, false).inside, 0.625);
  assertEquals(getKdpMinimumInteriorMarginsIn(501, false).inside, 0.75);
  assertEquals(getKdpMinimumInteriorMarginsIn(700, false).inside, 0.75);
  assertEquals(getKdpMinimumInteriorMarginsIn(701, false).inside, 0.875);
  assertEquals(getKdpMinimumInteriorMarginsIn(828, false).inside, 0.875);
});

Deno.test("edge minimums differ for bleed and no-bleed", () => {
  assertEquals(getKdpMinimumInteriorMarginsIn(100, false), {
    inside: 0.375,
    outside: 0.25,
    top: 0.25,
    bottom: 0.25,
  });
  assertEquals(getKdpMinimumInteriorMarginsIn(100, true), {
    inside: 0.375,
    outside: 0.375,
    top: 0.375,
    bottom: 0.375,
  });
});

Deno.test("representative KDP page-count limits are profile/trim sensitive", () => {
  assertEquals(getKdpPaperbackPageLimits("6x9", "white"), { min: 24, max: 828 });
  assertEquals(getKdpPaperbackPageLimits("6x9", "standard_color"), { min: 72, max: 600 });
  assertEquals(getKdpPaperbackPageLimits("8.5x11", "white"), { min: 24, max: 590 });
  assertEquals(checkKdpPageCount(71, "6x9", "standard_color").reason, "below_minimum");
  assertEquals(checkKdpPageCount(601, "6x9", "standard_color").reason, "above_maximum");
});

Deno.test("invalid KDP print profile resolution fails closed", () => {
  assertThrows(() => resolveKdpPrintProfile("not-a-real-profile"), Error, "INVALID_KDP_PRINT_PROFILE");
});
