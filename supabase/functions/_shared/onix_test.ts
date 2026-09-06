import { onixProductForm, renderOnix31Product, toOnixLanguageCode, validateOnixProduct } from "./onix.ts";

function base(overrides: Record<string, unknown> = {}) {
  return {
    recordReference: "SLP-0123456789ABCDEF0123456789ABCDEF",
    proprietaryProductId: "SLP-0123456789ABCDEF0123456789ABCDEF",
    isbn13: "9780306406157",
    title: "The Code Behind Money",
    subtitle: "A Practical Guide",
    contributors: [{ displayName: "Stanley Osei-Wusu" }],
    publisherName: "ScrollLibrary Publishing",
    imprintName: "ScrollLibrary Press",
    language: "en",
    productForm: "paperback" as const,
    editionLabel: "First edition",
    publicationDate: "2026-09-06",
    warengruppeCode: "1977",
    productAvailability: "20",
    publishingStatus: "04",
    priceType: "04",
    priceCents: 2499,
    currency: "EUR",
    priceCountry: "DE",
    taxRateCode: "R",
    taxRatePercent: 7,
    senderName: "ScrollLibrary Publishing",
    sentAt: "2026-09-06T12:34:56Z",
    ...overrides,
  };
}

Deno.test("renders VLB-shaped ONIX 3.1 metadata with Scroll Product ID plus ISBN", () => {
  const output = renderOnix31Product(base());
  const required = [
    '<ONIXMessage release="3.1" xmlns="http://ns.editeur.org/onix/3.1/reference">',
    "<ProductIDType>01</ProductIDType>",
    "<IDTypeName>ScrollLibrary Product ID</IDTypeName>",
    "<IDValue>SLP-0123456789ABCDEF0123456789ABCDEF</IDValue>",
    "<ProductIDType>15</ProductIDType>",
    "<IDValue>9780306406157</IDValue>",
    "<ProductForm>BC</ProductForm>",
    "<ProductFormDetail>B131</ProductFormDetail>",
    "<SubjectSchemeIdentifier>26</SubjectSchemeIdentifier>",
    "<SubjectCode>1977</SubjectCode>",
    "<PublishingRole>01</PublishingRole>",
    "<PublisherName>ScrollLibrary Publishing</PublisherName>",
    "<ImprintName>ScrollLibrary Press</ImprintName>",
    "<LanguageRole>01</LanguageRole>",
    "<LanguageCode>eng</LanguageCode>",
    '<Date dateformat="00">20260906</Date>',
    "<ProductAvailability>20</ProductAvailability>",
    "<PriceType>04</PriceType>",
    "<PriceAmount>24.99</PriceAmount>",
    "<TaxRatePercent>7</TaxRatePercent>",
    "<CountriesIncluded>DE</CountriesIncluded>",
  ];
  for (const needle of required) {
    if (!output.includes(needle)) throw new Error(`missing ONIX field: ${needle}`);
  }
});

Deno.test("rejects malformed Scroll Product IDs without confusing them with ISBN", () => {
  const issues = validateOnixProduct(base({ proprietaryProductId: "9780306406157" }) as any);
  if (!issues.some((issue) => issue.code === "SCROLL_PRODUCT_ID_INVALID")) {
    throw new Error("ISBN-shaped proprietary ID was not rejected");
  }
  if (issues.some((issue) => issue.code === "INVALID_ISBN13")) {
    throw new Error("valid ISBN should remain independently valid");
  }
});

Deno.test("maps EPUB to its own product form and requires e-book Warengruppe", () => {
  const form = onixProductForm("epub");
  if (form.productForm !== "EA" || form.productFormDetail !== "E101") throw new Error("EPUB product mapping failed");

  const valid = validateOnixProduct(base({
    productForm: "epub",
    isbn13: "9781861972712",
    warengruppeCode: "9977",
  }) as any);
  if (valid.length !== 0) throw new Error(`valid EPUB metadata rejected: ${valid.map((i) => i.code).join(",")}`);

  const invalid = validateOnixProduct(base({
    productForm: "epub",
    isbn13: "9781861972712",
    warengruppeCode: "1977",
  }) as any);
  if (!invalid.some((i) => i.code === "WARENGRUPPE_PRODUCT_FORM_MISMATCH")) {
    throw new Error("EPUB Warengruppe mismatch was not blocked");
  }
});

Deno.test("rejects print records with e-book Warengruppe", () => {
  const issues = validateOnixProduct(base({ warengruppeCode: "9977" }) as any);
  if (!issues.some((i) => i.code === "WARENGRUPPE_PRODUCT_FORM_MISMATCH")) {
    throw new Error("print Warengruppe mismatch was not blocked");
  }
});

Deno.test("rejects invalid ISBN and never infers price binding or tax", () => {
  const issues = validateOnixProduct(base({
    isbn13: "9780306406158",
    priceType: "",
    taxRateCode: "",
    taxRatePercent: Number.NaN,
  }) as any);
  const codes = new Set(issues.map((i) => i.code));
  for (const code of ["INVALID_ISBN13", "PRICE_TYPE_REQUIRED", "TAX_RATE_CODE_REQUIRED", "TAX_RATE_REQUIRED"]) {
    if (!codes.has(code)) throw new Error(`missing fail-closed validation: ${code}`);
  }
});

Deno.test("escapes XML metadata", () => {
  const output = renderOnix31Product(base({
    title: "Money & Power <2026>",
    publisherName: 'ScrollLibrary "Publishing"',
  }) as any);
  if (!output.includes("Money &amp; Power &lt;2026&gt;")) throw new Error("title XML escaping failed");
  if (!output.includes("ScrollLibrary &quot;Publishing&quot;")) throw new Error("publisher XML escaping failed");
});

Deno.test("maps supported two-letter language codes and accepts three-letter ONIX codes", () => {
  if (toOnixLanguageCode("en") !== "eng") throw new Error("English mapping failed");
  if (toOnixLanguageCode("de") !== "ger") throw new Error("German mapping failed");
  if (toOnixLanguageCode("eng") !== "eng") throw new Error("three-letter pass-through failed");
  if (toOnixLanguageCode("xx") !== null) throw new Error("unknown language must fail closed");
});
