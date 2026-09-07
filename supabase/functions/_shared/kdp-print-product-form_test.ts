import {
  KDP_HARDCOVER_ERROR,
  KDP_PRINT_PRODUCT_FORM_ERROR,
  resolveKdpPrintProductForm,
} from "./kdp-print-product-form.ts";
import { isbnForPublicationSnapshot, productFormForExport } from "./isbn.ts";

Deno.test("omitted legacy print product form resolves to paperback", () => {
  for (const value of [undefined, null, ""]) {
    const result = resolveKdpPrintProductForm(value);
    if (!result.ok || result.productForm !== "paperback") {
      throw new Error(`legacy caller (${String(value)}) should default to paperback`);
    }
  }
});

Deno.test("explicit paperback is accepted", () => {
  const result = resolveKdpPrintProductForm("paperback");
  if (!result.ok || result.productForm !== "paperback") throw new Error("paperback rejected");
});

Deno.test("hardcover is rejected with a stable error code", () => {
  const result = resolveKdpPrintProductForm("hardcover");
  if (result.ok) throw new Error("hardcover must not be accepted");
  if (result.code !== KDP_HARDCOVER_ERROR) throw new Error("unstable hardcover error code");
});

Deno.test("unknown product forms are rejected, never coerced", () => {
  const result = resolveKdpPrintProductForm("spiral");
  if (result.ok) throw new Error("unknown product form must not be coerced to paperback");
  if (result.code !== KDP_PRINT_PRODUCT_FORM_ERROR) throw new Error("unstable unsupported error code");
});

Deno.test("KDP ISBN mapping stays paperback-only", () => {
  if (productFormForExport("kdp-pdf") !== "paperback") throw new Error("KDP export must map to paperback");
  const snapshot = {
    isbn_by_format: { hardcover: "9780306406157" },
    identifiers: [{ scheme: "ISBN-13", value: "9780306406157", product_form: "hardcover" }],
  };
  if (isbnForPublicationSnapshot(snapshot, "kdp-pdf") !== null) {
    throw new Error("hardcover ISBN must not satisfy a KDP paperback export");
  }
});
