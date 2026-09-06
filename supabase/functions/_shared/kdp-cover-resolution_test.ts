import { assessKdpFrontCoverResolution, requireKdpFrontCoverResolution } from "./kdp-cover-resolution.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("6x9 KDP front art computes the exact 300-DPI pixel floor", () => {
  const result = assessKdpFrontCoverResolution(1838, 2775, "6x9");
  assert(result.requiredWidthPx === 1838, `unexpected width floor ${result.requiredWidthPx}`);
  assert(result.requiredHeightPx === 2775, `unexpected height floor ${result.requiredHeightPx}`);
  assert(result.passes, "exact 300-DPI floor should pass");
});

Deno.test("typical 2K 3:4 art is rejected for 6x9 print when effective DPI is below 300", () => {
  const result = assessKdpFrontCoverResolution(1792, 2400, "6x9");
  assert(!result.passes, "under-resolution cover must fail");
  assert(result.effectiveDpi < 300, "effective DPI should expose the limiting dimension");
});

Deno.test("4K portrait art clears 300-DPI 6x9 print requirements", () => {
  const result = assessKdpFrontCoverResolution(3584, 4800, "6x9");
  assert(result.passes, "4K portrait art should pass 6x9 print resolution gate");
});

Deno.test("unknown dimensions fail closed", () => {
  let rejected = false;
  try {
    requireKdpFrontCoverResolution(null, 3000, "6x9");
  } catch (error) {
    rejected = error instanceof Error && error.message === "KDP_COVER_DIMENSIONS_UNKNOWN";
  }
  assert(rejected, "unknown image dimensions must block print export");
});
