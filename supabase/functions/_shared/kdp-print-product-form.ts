/**
 * KDP print product form contract.
 *
 * The KDP bundle generator is paperback-specific: `kdp-pdf` maps to the
 * paperback product form, and `_shared/kdp-print-cover.ts` carries
 * paperback-only spine/bleed geometry and page limits. There is no hardcover
 * geometry, so a hardcover request must be rejected at the server boundary
 * rather than silently coerced into a paperback bundle.
 */

export type KdpPrintProductForm = "paperback";

export const KDP_PRINT_PRODUCT_FORM_ERROR = "KDP_PRINT_PRODUCT_FORM_UNSUPPORTED";
export const KDP_HARDCOVER_ERROR = "KDP_HARDCOVER_EXPORT_NOT_SUPPORTED";

export type KdpPrintProductFormResolution =
  | { ok: true; productForm: KdpPrintProductForm }
  | { ok: false; code: string; message: string };

/**
 * Resolve the requested KDP print product form.
 * Legacy callers that omit the option default to `paperback` for backward
 * compatibility; any other explicit value is rejected.
 */
export function resolveKdpPrintProductForm(value: unknown): KdpPrintProductFormResolution {
  if (value === undefined || value === null || value === "") {
    return { ok: true, productForm: "paperback" };
  }
  if (value === "paperback") {
    return { ok: true, productForm: "paperback" };
  }
  if (value === "hardcover") {
    return {
      ok: false,
      code: KDP_HARDCOVER_ERROR,
      message:
        "KDP hardcover export is not supported. The KDP print bundle generates a paperback interior and paperback cover geometry only.",
    };
  }
  return {
    ok: false,
    code: KDP_PRINT_PRODUCT_FORM_ERROR,
    message: `Unsupported KDP print product form: ${String(value)}. Only "paperback" is supported.`,
  };
}
