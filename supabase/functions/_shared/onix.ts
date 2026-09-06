import { isValidIsbn13, normalizeIsbn13 } from "./isbn.ts";
import { isScrollIdentifier } from "./scroll-identity.ts";

export type DistributionProductForm = "paperback" | "hardcover" | "epub";

export interface OnixContributor {
  displayName: string;
  role?: string;
}

export interface OnixProductInput {
  recordReference: string;
  notificationType?: string;
  proprietaryProductId?: string | null;
  isbn13: string;
  title: string;
  subtitle?: string | null;
  contributors: OnixContributor[];
  publisherName: string;
  imprintName?: string | null;
  language: string;
  productForm: DistributionProductForm;
  editionLabel?: string | null;
  publicationDate: string;
  warengruppeCode: string;
  productAvailability: string;
  publishingStatus?: string | null;
  priceType: string;
  priceCents: number;
  currency: string;
  priceCountry: string;
  taxRateCode: string;
  taxRatePercent: number;
  senderName: string;
  sentAt?: string | Date;
}

export interface OnixValidationIssue {
  field: string;
  code: string;
  message: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  en: "eng",
  de: "ger",
  fr: "fre",
  es: "spa",
  it: "ita",
  pt: "por",
  nl: "dut",
  pl: "pol",
};

const PRICE_TYPES = new Set(["02", "04", "12", "14"]);

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toOnixLanguageCode(value: string): string | null {
  const normalized = (value || "").trim().toLowerCase();
  if (/^[a-z]{3}$/.test(normalized)) return normalized;
  return LANGUAGE_MAP[normalized] ?? null;
}

export function onixProductForm(form: DistributionProductForm): {
  productForm: string;
  productFormDetail?: string;
  requiredWarengruppePrefix: "1" | "9";
} {
  switch (form) {
    case "hardcover":
      return { productForm: "BB", requiredWarengruppePrefix: "1" };
    case "paperback":
      return { productForm: "BC", productFormDetail: "B131", requiredWarengruppePrefix: "1" };
    case "epub":
      return { productForm: "EA", productFormDetail: "E101", requiredWarengruppePrefix: "9" };
  }
}

function dateYYYYMMDD(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value.replace(/-/g, "");
}

function sentDateTime(value?: string | Date): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("ONIX_SENT_AT_INVALID");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function validateOnixProduct(input: OnixProductInput): OnixValidationIssue[] {
  const issues: OnixValidationIssue[] = [];
  const requireText = (field: keyof OnixProductInput, code: string) => {
    const value = input[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push({ field: String(field), code, message: `${String(field)} is required` });
    }
  };

  requireText("recordReference", "RECORD_REFERENCE_REQUIRED");
  requireText("title", "TITLE_REQUIRED");
  requireText("publisherName", "PUBLISHER_REQUIRED");
  requireText("senderName", "SENDER_REQUIRED");

  if (input.proprietaryProductId && !isScrollIdentifier(input.proprietaryProductId, "SLP")) {
    issues.push({ field: "proprietaryProductId", code: "SCROLL_PRODUCT_ID_INVALID", message: "Scroll proprietary product identifier must be a valid SLP identifier" });
  }

  if (!isValidIsbn13(input.isbn13)) {
    issues.push({ field: "isbn13", code: "INVALID_ISBN13", message: "A valid ISBN-13 is required" });
  }

  if (!Array.isArray(input.contributors) || input.contributors.length === 0 || input.contributors.some((c) => !c?.displayName?.trim())) {
    issues.push({ field: "contributors", code: "CONTRIBUTOR_REQUIRED", message: "At least one named contributor is required" });
  }

  if (!toOnixLanguageCode(input.language)) {
    issues.push({ field: "language", code: "UNSUPPORTED_LANGUAGE_CODE", message: "Use a supported ISO 639 language code" });
  }

  if (!dateYYYYMMDD(input.publicationDate)) {
    issues.push({ field: "publicationDate", code: "PUBLICATION_DATE_INVALID", message: "Publication date must be a real YYYY-MM-DD date" });
  }

  const form = onixProductForm(input.productForm);
  if (!/^\d{4}$/.test(input.warengruppeCode || "")) {
    issues.push({ field: "warengruppeCode", code: "WARENGRUPPE_INVALID", message: "VLB Warengruppe must contain exactly four digits" });
  } else if (!input.warengruppeCode.startsWith(form.requiredWarengruppePrefix)) {
    issues.push({
      field: "warengruppeCode",
      code: "WARENGRUPPE_PRODUCT_FORM_MISMATCH",
      message: `${input.productForm} requires a Warengruppe beginning with ${form.requiredWarengruppePrefix}`,
    });
  }

  if (!/^\d{2}$/.test(input.productAvailability || "")) {
    issues.push({ field: "productAvailability", code: "AVAILABILITY_INVALID", message: "ONIX ProductAvailability must be a two-digit code" });
  }
  if (input.publishingStatus && !/^\d{2}$/.test(input.publishingStatus)) {
    issues.push({ field: "publishingStatus", code: "PUBLISHING_STATUS_INVALID", message: "ONIX PublishingStatus must be a two-digit code" });
  }

  if (!PRICE_TYPES.has(input.priceType)) {
    issues.push({ field: "priceType", code: "PRICE_TYPE_REQUIRED", message: "An explicit supported ONIX price type is required; it is never inferred" });
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    issues.push({ field: "priceCents", code: "PRICE_REQUIRED", message: "A non-negative price in cents is required for the initial VLB export" });
  }
  if (!/^[A-Z]{3}$/.test(input.currency || "")) {
    issues.push({ field: "currency", code: "CURRENCY_INVALID", message: "Currency must be a three-letter uppercase code" });
  }
  if (!/^[A-Z]{2}$/.test(input.priceCountry || "")) {
    issues.push({ field: "priceCountry", code: "PRICE_COUNTRY_INVALID", message: "Price country must be a two-letter uppercase code" });
  }
  if (!/^[A-Z]$/.test(input.taxRateCode || "")) {
    issues.push({ field: "taxRateCode", code: "TAX_RATE_CODE_REQUIRED", message: "Tax rate code must be explicitly supplied" });
  }
  if (typeof input.taxRatePercent !== "number" || !Number.isFinite(input.taxRatePercent) || input.taxRatePercent < 0 || input.taxRatePercent > 100) {
    issues.push({ field: "taxRatePercent", code: "TAX_RATE_REQUIRED", message: "Tax rate percent must be explicitly supplied" });
  }

  return issues;
}

function contributorXml(contributor: OnixContributor, sequence: number): string {
  return [
    "      <Contributor>",
    `        <SequenceNumber>${sequence}</SequenceNumber>`,
    `        <ContributorRole>${xml(contributor.role || "A01")}</ContributorRole>`,
    `        <PersonName>${xml(contributor.displayName.trim())}</PersonName>`,
    "      </Contributor>",
  ].join("\n");
}

export function renderOnix31Product(input: OnixProductInput): string {
  const issues = validateOnixProduct(input);
  if (issues.length > 0) {
    const error = new Error(`ONIX_VALIDATION_FAILED:${issues.map((issue) => issue.code).join(",")}`);
    (error as Error & { issues?: OnixValidationIssue[] }).issues = issues;
    throw error;
  }

  const isbn = normalizeIsbn13(input.isbn13);
  const lang = toOnixLanguageCode(input.language)!;
  const form = onixProductForm(input.productForm);
  const pubDate = dateYYYYMMDD(input.publicationDate)!;
  const price = (input.priceCents / 100).toFixed(2);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ONIXMessage release="3.1" xmlns="http://ns.editeur.org/onix/3.1/reference">',
    "  <Header>",
    "    <Sender>",
    `      <SenderName>${xml(input.senderName.trim())}</SenderName>`,
    "    </Sender>",
    `    <SentDateTime>${xml(sentDateTime(input.sentAt))}</SentDateTime>`,
    "  </Header>",
    "  <Product>",
    `    <RecordReference>${xml(input.recordReference.trim())}</RecordReference>`,
    `    <NotificationType>${xml(input.notificationType || "03")}</NotificationType>`,
    ...(input.proprietaryProductId ? [
      "    <ProductIdentifier>",
      "      <ProductIDType>01</ProductIDType>",
      "      <IDTypeName>ScrollLibrary Product ID</IDTypeName>",
      `      <IDValue>${xml(input.proprietaryProductId)}</IDValue>`,
      "    </ProductIdentifier>",
    ] : []),
    "    <ProductIdentifier>",
    "      <ProductIDType>15</ProductIDType>",
    `      <IDValue>${isbn}</IDValue>`,
    "    </ProductIdentifier>",
    "    <DescriptiveDetail>",
    "      <ProductComposition>00</ProductComposition>",
    `      <ProductForm>${form.productForm}</ProductForm>`,
    ...(form.productFormDetail ? [`      <ProductFormDetail>${form.productFormDetail}</ProductFormDetail>`] : []),
    "      <TitleDetail>",
    "        <TitleType>01</TitleType>",
    "        <TitleElement>",
    "          <TitleElementLevel>01</TitleElementLevel>",
    `          <TitleText>${xml(input.title.trim())}</TitleText>`,
    ...(input.subtitle?.trim() ? [`          <Subtitle>${xml(input.subtitle.trim())}</Subtitle>`] : []),
    "        </TitleElement>",
    "      </TitleDetail>",
    ...input.contributors.map((contributor, index) => contributorXml(contributor, index + 1)),
    "      <Language>",
    "        <LanguageRole>01</LanguageRole>",
    `        <LanguageCode>${lang}</LanguageCode>`,
    "      </Language>",
    "      <Subject>",
    "        <MainSubject/>",
    "        <SubjectSchemeIdentifier>26</SubjectSchemeIdentifier>",
    `        <SubjectCode>${xml(input.warengruppeCode)}</SubjectCode>`,
    "      </Subject>",
    ...(input.editionLabel?.trim() ? [`      <EditionStatement>${xml(input.editionLabel.trim())}</EditionStatement>`] : []),
    "    </DescriptiveDetail>",
    "    <PublishingDetail>",
    ...(input.imprintName?.trim()
      ? ["      <Imprint>", `        <ImprintName>${xml(input.imprintName.trim())}</ImprintName>`, "      </Imprint>"]
      : []),
    "      <Publisher>",
    "        <PublishingRole>01</PublishingRole>",
    `        <PublisherName>${xml(input.publisherName.trim())}</PublisherName>`,
    "      </Publisher>",
    ...(input.publishingStatus ? [`      <PublishingStatus>${xml(input.publishingStatus)}</PublishingStatus>`] : []),
    "      <PublishingDate>",
    "        <PublishingDateRole>01</PublishingDateRole>",
    `        <Date dateformat="00">${pubDate}</Date>`,
    "      </PublishingDate>",
    "    </PublishingDetail>",
    "    <ProductSupply>",
    "      <SupplyDetail>",
    `        <ProductAvailability>${xml(input.productAvailability)}</ProductAvailability>`,
    "        <Price>",
    `          <PriceType>${xml(input.priceType)}</PriceType>`,
    `          <PriceAmount>${price}</PriceAmount>`,
    "          <Tax>",
    "            <TaxType>01</TaxType>",
    `            <TaxRateCode>${xml(input.taxRateCode)}</TaxRateCode>`,
    `            <TaxRatePercent>${xml(input.taxRatePercent)}</TaxRatePercent>`,
    "          </Tax>",
    `          <CurrencyCode>${xml(input.currency)}</CurrencyCode>`,
    "          <Territory>",
    `            <CountriesIncluded>${xml(input.priceCountry)}</CountriesIncluded>`,
    "          </Territory>",
    "        </Price>",
    "      </SupplyDetail>",
    "    </ProductSupply>",
    "  </Product>",
    "</ONIXMessage>",
    "",
  ];

  return lines.join("\n");
}
