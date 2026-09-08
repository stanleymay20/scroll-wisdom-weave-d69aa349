import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { getKdpMinimumInteriorMarginsPt } from "./kdp-print-rules.ts";

export interface KdpRenderAttempt {
  bytes: Uint8Array;
  /** Actual inside margin used by this render, including any deliberate comfort allowance. */
  usedInsideMarginPt: number;
}

export interface StableKdpRenderResult extends KdpRenderAttempt {
  pageCount: number;
  requiredInsideMarginPt: number;
  iterations: number;
  /** The page-count basis whose official minimum was supplied to the final render. */
  marginBasisPageCount: number;
}

export interface StabilizeKdpRenderOptions {
  initialPageCountEstimate: number;
  bleed: boolean;
  /**
   * Render using at least the supplied official KDP minimum gutter. The callback
   * may add a separate layout comfort allowance, but must report the real inside
   * margin used so the convergence gate can verify it against the actual count.
   */
  render: (officialMinimumInsideMarginPt: number, marginBasisPageCount: number) => Promise<KdpRenderAttempt>;
  maxIterations?: number;
  inspectPageCount?: (bytes: Uint8Array) => Promise<number>;
}

async function defaultInspectPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  return pdf.getPageCount();
}

/**
 * Render/check/re-render loop that prevents an estimated page count from
 * silently selecting a gutter below the KDP minimum required by the final PDF.
 *
 * The process succeeds only when the ACTUAL rendered page count requires no
 * larger gutter than the actual gutter used by that same render. Iterations are
 * deliberately bounded; failure to stabilize is a hard error.
 */
export async function stabilizeKdpRender(
  options: StabilizeKdpRenderOptions,
): Promise<StableKdpRenderResult> {
  const maxIterations = options.maxIterations ?? 4;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10) {
    throw new Error("INVALID_KDP_GUTTER_MAX_ITERATIONS");
  }
  if (!Number.isFinite(options.initialPageCountEstimate) || options.initialPageCountEstimate < 1) {
    throw new Error("INVALID_KDP_INITIAL_PAGE_ESTIMATE");
  }

  const inspect = options.inspectPageCount ?? defaultInspectPageCount;
  let basis = Math.max(1, Math.ceil(options.initialPageCountEstimate));

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const officialMinimum = getKdpMinimumInteriorMarginsPt(basis, options.bleed).inside;
    const rendered = await options.render(officialMinimum, basis);
    if (!(rendered.bytes instanceof Uint8Array) || rendered.bytes.length === 0) {
      throw new Error("KDP_RENDER_RETURNED_EMPTY_ARTIFACT");
    }
    if (!Number.isFinite(rendered.usedInsideMarginPt) || rendered.usedInsideMarginPt < officialMinimum) {
      throw new Error("KDP_RENDER_USED_GUTTER_BELOW_REQUESTED_MINIMUM");
    }

    const actualPageCount = await inspect(rendered.bytes);
    if (!Number.isInteger(actualPageCount) || actualPageCount < 1) {
      throw new Error("KDP_RENDER_INVALID_ACTUAL_PAGE_COUNT");
    }

    const requiredForActual = getKdpMinimumInteriorMarginsPt(actualPageCount, options.bleed).inside;
    if (rendered.usedInsideMarginPt + 1e-7 >= requiredForActual) {
      return {
        ...rendered,
        pageCount: actualPageCount,
        requiredInsideMarginPt: requiredForActual,
        iterations: iteration,
        marginBasisPageCount: basis,
      };
    }

    // Re-render using the ACTUAL count as the next margin basis. Reflow from the
    // larger gutter can itself alter page count, hence the bounded loop.
    basis = actualPageCount;
  }

  throw new Error("KDP_GUTTER_DID_NOT_STABILIZE");
}
