import { isScrollIdentifier, newScrollIdentifier, parseScrollIdentifier, scrollIdentityLabel } from "./scroll-identity.ts";

Deno.test("creates namespaced non-ISBN Scroll identifiers", () => {
  const work = newScrollIdentifier("SLW");
  const edition = newScrollIdentifier("SLE");
  const product = newScrollIdentifier("SLP");
  if (!isScrollIdentifier(work, "SLW")) throw new Error("work identifier invalid");
  if (!isScrollIdentifier(edition, "SLE")) throw new Error("edition identifier invalid");
  if (!isScrollIdentifier(product, "SLP")) throw new Error("product identifier invalid");
  if (/^97[89]/.test(work)) throw new Error("Scroll ID must not resemble ISBN-13");
});

Deno.test("rejects malformed and cross-kind identifiers", () => {
  const product = "SLP-0123456789ABCDEF0123456789ABCDEF";
  if (!isScrollIdentifier(product, "SLP")) throw new Error("valid product ID rejected");
  if (isScrollIdentifier(product, "SLW")) throw new Error("cross-kind ID accepted");
  if (isScrollIdentifier("SBN-0123456789ABCDEF0123456789ABCDEF")) throw new Error("historical SBN label must not be accepted");
  if (isScrollIdentifier("9780306406157")) throw new Error("ISBN must not be accepted as Scroll ID");
  if (parseScrollIdentifier("SLP-short")) throw new Error("short token accepted");
});

Deno.test("labels make proprietary scope explicit", () => {
  if (scrollIdentityLabel("SLW") !== "ScrollLibrary Work ID") throw new Error("work label mismatch");
  if (scrollIdentityLabel("SLE") !== "ScrollLibrary Edition ID") throw new Error("edition label mismatch");
  if (scrollIdentityLabel("SLP") !== "ScrollLibrary Product ID") throw new Error("product label mismatch");
});
