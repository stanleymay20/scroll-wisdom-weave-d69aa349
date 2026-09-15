import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  preflight,
  json,
  badRequest,
  forbidden,
  serverError,
  requireUser,
  validateBody,
  z,
  serviceClient,
  enforceRateLimit,
} from "../_shared/http.ts";

const ProductForm = z.enum(["paperback", "hardcover", "epub"]);
const PackagingResponsibility = z.enum(["not_applicable", "third_party_confirmed", "publisher_responsible"]);
const LucidStatus = z.enum(["not_applicable", "registered", "required_missing"]);

const GetSchema = z.object({
  action: z.literal("get"),
  bookId: z.string().uuid(),
  productForm: ProductForm,
});

const SaveSchema = z.object({
  action: z.literal("save"),
  bookId: z.string().uuid(),
  productForm: ProductForm,
  germanMarketIntended: z.boolean(),
  commercialRelease: z.boolean(),
  publisherStateCode: z.string().trim().regex(/^[A-Za-z]{2}$/).nullable().optional(),
  publisherOperatingBasisConfirmed: z.boolean(),
  imprintNoticeConfirmed: z.boolean(),
  dnbDepositPlanConfirmed: z.boolean(),
  stateDepositPlanConfirmed: z.boolean(),
  distributionStartedAt: z.string().datetime().nullable().optional(),
  dnbDepositCompleted: z.boolean().default(false),
  stateDepositCompleted: z.boolean().default(false),
  depositEvidenceReference: z.string().trim().max(1000).nullable().optional(),
  directSalesEnabled: z.boolean(),
  directSalesLegalNoticeConfirmed: z.boolean(),
  packagingResponsibility: PackagingResponsibility,
  lucidStatus: LucidStatus,
  notes: z.string().max(4000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.directSalesEnabled && value.directSalesLegalNoticeConfirmed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["directSalesLegalNoticeConfirmed"],
      message: "Direct-sales legal-notice confirmation is only valid when direct sales are enabled",
    });
  }
  if (value.packagingResponsibility === "publisher_responsible" && value.lucidStatus === "not_applicable") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lucidStatus"],
      message: "Select registered or required_missing when the publisher is responsible for packaging",
    });
  }
  if (value.packagingResponsibility !== "publisher_responsible" && value.lucidStatus !== "not_applicable") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lucidStatus"],
      message: "LUCID status must be not_applicable unless the publisher is responsible for packaging",
    });
  }
});

const BodySchema = z.union([GetSchema, SaveSchema]);
type Service = ReturnType<typeof serviceClient>;
type ProductForm = z.infer<typeof ProductForm>;

type ReadinessCheck = {
  id: string;
  label: string;
  source: "system" | "publisher_declaration";
  status: "passed" | "missing" | "not_applicable" | "manual_review" | "pending" | "overdue";
  blocking: boolean;
  detail: string;
};

const LEGAL_SOURCES = [
  {
    id: "buchprg",
    label: "German Book Price Fixing Act (BuchPrG §§ 2, 3, 5)",
    url: "https://www.gesetze-im-internet.de/buchprg/",
  },
  {
    id: "dnbg",
    label: "German National Library Act (DNBG §§ 14–16)",
    url: "https://www.gesetze-im-internet.de/dnbg/",
  },
  {
    id: "bbgpg",
    label: "Brandenburg Press Act (BbgPG §§ 8, 13)",
    url: "https://bravors.brandenburg.de/gesetze/bbgpg",
  },
  {
    id: "lucid",
    label: "Central Agency Packaging Register — LUCID",
    url: "https://www.verpackungsregister.org/",
  },
] as const;

async function authorizeBook(sc: Service, bookId: string, userId: string) {
  const { data: book, error } = await sc
    .from("books")
    .select("id,user_id,creator_id,title,current_publication_id")
    .eq("id", bookId)
    .maybeSingle();
  if (error) throw error;
  if (!book) return { found: false, authorized: false, book: null };

  let authorized = book.user_id === userId || book.creator_id === userId;
  if (!authorized) {
    const { data: admin, error: adminErr } = await sc
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminErr) throw adminErr;
    authorized = !!admin;
  }
  return { found: true, authorized, book };
}

async function readContext(sc: Service, bookId: string, productForm: ProductForm) {
  const { data: profile, error: profileErr } = await sc
    .from("book_publishing_profiles")
    .select("imprint_id,publisher_mode,edition_label,publication_language,distribution_scope")
    .eq("book_id", bookId)
    .maybeSingle();
  if (profileErr) throw profileErr;

  if (!profile) {
    return {
      profile: null,
      imprint: null,
      assignment: null,
      distribution: null,
      declaration: null,
      publicationGatesCurrent: false,
    };
  }

  const language = profile.publication_language;
  const editionLabel = profile.edition_label;

  const imprintResult = profile.imprint_id
    ? await sc.from("publishing_imprints")
      .select("id,scope,publisher_name,imprint_name,country_code,verified")
      .eq("id", profile.imprint_id)
      .maybeSingle()
    : { data: null, error: null };
  if (imprintResult.error) throw imprintResult.error;

  const { data: assignment, error: assignmentErr } = await sc
    .from("book_isbn_assignments")
    .select("id,isbn_id,product_form,language,edition_label,locked_at")
    .eq("book_id", bookId)
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (assignmentErr) throw assignmentErr;

  const { data: distribution, error: distributionErr } = await sc
    .from("book_distribution_metadata")
    .select("publication_date,price_type,price_cents,currency,price_country,product_availability,publishing_status,warengruppe_code")
    .eq("book_id", bookId)
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (distributionErr) throw distributionErr;

  const { data: declaration, error: declarationErr } = await sc
    .from("publication_compliance_declarations")
    .select("*")
    .eq("book_id", bookId)
    .eq("jurisdiction", "DE")
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (declarationErr) throw declarationErr;

  const { data: publicationGatesCurrent, error: gatesErr } = await sc
    .rpc("has_current_publication_attestations", { p_book_id: bookId });
  if (gatesErr) throw gatesErr;

  return {
    profile,
    imprint: imprintResult.data,
    assignment,
    distribution,
    declaration,
    publicationGatesCurrent: publicationGatesCurrent === true,
  };
}

function check(
  id: string,
  label: string,
  source: ReadinessCheck["source"],
  ok: boolean,
  detail: string,
  missingDetail: string,
  blocking = true,
): ReadinessCheck {
  return {
    id,
    label,
    source,
    status: ok ? "passed" : "missing",
    blocking: ok ? false : blocking,
    detail: ok ? detail : missingDetail,
  };
}

function notApplicable(id: string, label: string, source: ReadinessCheck["source"], detail: string): ReadinessCheck {
  return { id, label, source, status: "not_applicable", blocking: false, detail };
}

function manualReview(id: string, label: string, detail: string): ReadinessCheck {
  return { id, label, source: "publisher_declaration", status: "manual_review", blocking: true, detail };
}

function evaluatePreRelease(context: Awaited<ReturnType<typeof readContext>>, productForm: ProductForm): ReadinessCheck[] {
  const d = context.declaration;
  const profile = context.profile;
  const imprint = context.imprint;
  const metadata = context.distribution;
  const germanMarket = d?.german_market_intended ?? true;
  const commercial = d?.commercial_release ?? true;
  const isPhysical = productForm === "paperback" || productForm === "hardcover";
  const dePublisher = imprint?.country_code === "DE";
  const checks: ReadinessCheck[] = [];

  checks.push(check(
    "publication_gates",
    "Current publication trust gates",
    "system",
    context.publicationGatesCurrent,
    "Editorial, evidence, QA, structural, production and rights gates are current for the manuscript state.",
    "Run the required publication gates again for the current manuscript state.",
  ));

  checks.push(check(
    "publishing_identity",
    "Publishing identity",
    "system",
    !!profile && !!imprint && imprint.verified === true,
    `${imprint?.imprint_name ?? "Imprint"} is attached to the canonical publishing profile and marked verified.`,
    "Configure a verified publisher/imprint identity before controlled release.",
  ));

  if (profile?.publisher_mode === "kdp_independent") {
    checks.push({
      id: "isbn_product_identity",
      label: "ISBN / product identity",
      source: "system",
      status: "manual_review",
      blocking: true,
      detail: "KDP free-ISBN mode is KDP-only and is not eligible for ScrollLibrary's Germany trade-release readiness status.",
    });
  } else {
    checks.push(check(
      "isbn_product_identity",
      "Format-specific ISBN",
      "system",
      !!context.assignment,
      `A distinct ISBN is assigned to this ${productForm} product record.`,
      `Assign an ISBN to the ${productForm} record before controlled trade release.`,
    ));
  }

  if (!germanMarket || !commercial) {
    checks.push(notApplicable(
      "german_fixed_price",
      "German fixed retail price",
      "system",
      "Not evaluated because this record is not declared as a commercial release intended for the German market.",
    ));
  } else {
    const fixedPriceReady = metadata?.price_country === "DE"
      && metadata?.price_type === "04"
      && metadata?.price_cents != null
      && metadata?.currency === "EUR";
    checks.push(check(
      "german_fixed_price",
      "German fixed retail price",
      "system",
      fixedPriceReady,
      `German retail price metadata is explicit (${((metadata?.price_cents ?? 0) / 100).toFixed(2)} EUR; ONIX price type 04).`,
      "Set an explicit Germany retail price, EUR currency and the fixed-price ONIX type before commercial release in Germany.",
    ));
  }

  checks.push(check(
    "publisher_operating_basis",
    "Publisher operating basis",
    "publisher_declaration",
    d?.publisher_operating_basis_confirmed === true,
    "The publisher has declared that its business/tax/operating basis for this publishing activity has been reviewed and is appropriate.",
    "Publisher must confirm its operating/business basis. This is a declaration, not ScrollLibrary legal verification.",
  ));

  checks.push(check(
    "imprint_notice",
    "Book imprint / Impressum",
    "publisher_declaration",
    d?.imprint_notice_confirmed === true,
    "Publisher declares the edition contains the required publisher/printer imprint information for its applicable format and jurisdiction.",
    "Confirm the edition's imprint/Impressum before release.",
  ));

  if (!dePublisher) {
    checks.push(manualReview(
      "dnb_deposit_plan",
      "German National Library deposit",
      "The publisher/imprint is not recorded as Germany-based. DNBG applicability must be reviewed manually; this V1 engine will not infer it.",
    ));
  } else {
    checks.push(check(
      "dnb_deposit_plan",
      "German National Library deposit plan",
      "publisher_declaration",
      d?.dnb_deposit_plan_confirmed === true,
      "A DNB legal-deposit plan has been acknowledged for this product.",
      "Acknowledge the DNB deposit plan before release. Completion is tracked separately after distribution begins.",
    ));
  }

  if (!dePublisher) {
    checks.push(notApplicable(
      "state_deposit_plan",
      "State legal deposit",
      "publisher_declaration",
      "State deposit is not evaluated by this Germany-based publisher workflow.",
    ));
  } else if (!d?.publisher_state_code) {
    checks.push(manualReview(
      "state_deposit_plan",
      "State legal deposit",
      "Select the publisher's German state. V1 has an explicit Brandenburg rule and fails closed for other/unknown states.",
    ));
  } else if (d.publisher_state_code === "BB") {
    checks.push(check(
      "state_deposit_plan",
      "Brandenburg legal-deposit plan",
      "publisher_declaration",
      d?.state_deposit_plan_confirmed === true,
      "Publisher has acknowledged the Brandenburg state legal-deposit plan.",
      "Acknowledge the Brandenburg state legal-deposit plan before release.",
    ));
  } else {
    checks.push(manualReview(
      "state_deposit_plan",
      "State legal deposit",
      `Publisher state ${d.publisher_state_code} is outside the Brandenburg rule modeled in V1. Review that state's deposit law before release.`,
    ));
  }

  if (d?.direct_sales_enabled) {
    checks.push(check(
      "direct_sales_legal_notice",
      "Direct-sales legal notice",
      "publisher_declaration",
      d?.direct_sales_legal_notice_confirmed === true,
      "Publisher declares the direct-sales channel has the required legal notice and consumer-facing business information.",
      "Confirm the direct-sales legal notice before enabling a direct commercial release.",
    ));
  } else {
    checks.push(notApplicable(
      "direct_sales_legal_notice",
      "Direct-sales legal notice",
      "publisher_declaration",
      "No direct publisher-to-consumer sales are declared for this product.",
    ));
  }

  if (!isPhysical || !germanMarket || !commercial) {
    checks.push(notApplicable(
      "packaging_lucid",
      "Packaging / LUCID responsibility",
      "publisher_declaration",
      "Not evaluated for this format/release scope.",
    ));
  } else if (d?.packaging_responsibility === "third_party_confirmed") {
    checks.push({
      id: "packaging_lucid",
      label: "Packaging / LUCID responsibility",
      source: "publisher_declaration",
      status: "passed",
      blocking: false,
      detail: "Publisher declares that a third party is contractually responsible for the relevant packaging obligations. Keep supporting evidence.",
    });
  } else if (d?.packaging_responsibility === "publisher_responsible") {
    checks.push(check(
      "packaging_lucid",
      "Packaging / LUCID responsibility",
      "publisher_declaration",
      d?.lucid_status === "registered",
      "Publisher declares that its applicable LUCID registration is active.",
      "Publisher is marked responsible for packaging but LUCID registration is not confirmed.",
    ));
  } else {
    checks.push({
      id: "packaging_lucid",
      label: "Packaging / LUCID responsibility",
      source: "publisher_declaration",
      status: "missing",
      blocking: true,
      detail: "Choose who is responsible for packaging obligations for physical German-market fulfillment.",
    });
  }

  return checks;
}

function evaluatePostRelease(
  context: Awaited<ReturnType<typeof readContext>>,
  publishedAt: string | null,
): { checks: ReadinessCheck[]; dnbDueAt: string | null } {
  if (!publishedAt) return { checks: [], dnbDueAt: null };

  const d = context.declaration;
  const imprint = context.imprint;
  const dePublisher = imprint?.country_code === "DE";
  const checks: ReadinessCheck[] = [];

  if (!dePublisher) {
    checks.push(manualReview(
      "dnb_deposit_completion",
      "DNB deposit completion",
      "Publisher is not recorded as Germany-based; post-release DNBG applicability requires manual review.",
    ));
    return { checks, dnbDueAt: null };
  }

  const distributionStartedAt = d?.distribution_started_at ?? null;
  if (!distributionStartedAt) {
    checks.push({
      id: "distribution_start",
      label: "Actual distribution/public-access start",
      source: "publisher_declaration",
      status: "pending",
      blocking: true,
      detail: "Record when distribution or public access actually began. ScrollLibrary does not substitute its internal publication timestamp for the legal trigger.",
    });
  } else {
    checks.push({
      id: "distribution_start",
      label: "Actual distribution/public-access start",
      source: "publisher_declaration",
      status: "passed",
      blocking: false,
      detail: `Publisher recorded distribution/public access starting at ${distributionStartedAt}.`,
    });
  }

  const due = distributionStartedAt
    ? new Date(new Date(distributionStartedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;
  const dueIso = due?.toISOString() ?? null;

  if (d?.dnb_deposit_completed_at) {
    checks.push({
      id: "dnb_deposit_completion",
      label: "DNB deposit completion",
      source: "publisher_declaration",
      status: "passed",
      blocking: false,
      detail: `Publisher recorded DNB deposit completion at ${d.dnb_deposit_completed_at}.`,
    });
  } else if (!due) {
    checks.push({
      id: "dnb_deposit_completion",
      label: "DNB deposit completion",
      source: "publisher_declaration",
      status: "pending",
      blocking: true,
      detail: "DNB completion is not recorded. The statutory deadline cannot be calculated until the actual distribution/public-access start is recorded.",
    });
  } else {
    const overdue = Date.now() > due.getTime();
    checks.push({
      id: "dnb_deposit_completion",
      label: "DNB deposit completion",
      source: "publisher_declaration",
      status: overdue ? "overdue" : "pending",
      blocking: true,
      detail: overdue
        ? `No DNB completion is recorded and the one-week window calculated from distribution start has passed (${dueIso}).`
        : `DNB completion is not yet recorded. The one-week window calculated from distribution start ends ${dueIso}.`,
    });
  }

  if (d?.publisher_state_code === "BB") {
    if (d?.state_deposit_completed_at) {
      checks.push({
        id: "state_deposit_completion",
        label: "Brandenburg deposit completion",
        source: "publisher_declaration",
        status: "passed",
        blocking: false,
        detail: `Publisher recorded Brandenburg deposit completion at ${d.state_deposit_completed_at}.`,
      });
    } else {
      checks.push({
        id: "state_deposit_completion",
        label: "Brandenburg deposit completion",
        source: "publisher_declaration",
        status: "pending",
        blocking: true,
        detail: distributionStartedAt
          ? "Brandenburg deposit completion is not yet recorded. The state rule is tied to the beginning of distribution."
          : "Brandenburg deposit completion is not recorded, and the actual distribution start is still missing.",
      });
    }
  } else if (d?.publisher_state_code) {
    checks.push(manualReview(
      "state_deposit_completion",
      "State deposit completion",
      `Post-release deposit rules for state ${d.publisher_state_code} are not modeled in V1.`,
    ));
  }

  return { checks, dnbDueAt: dueIso };
}

async function buildResponse(sc: Service, book: Record<string, unknown>, productForm: ProductForm) {
  const context = await readContext(sc, String(book.id), productForm);
  let publishedAt: string | null = null;
  if (book.current_publication_id) {
    const { data: publication, error } = await sc
      .from("publications")
      .select("published_at")
      .eq("id", String(book.current_publication_id))
      .maybeSingle();
    if (error) throw error;
    publishedAt = publication?.published_at ?? null;
  }

  const preReleaseChecks = evaluatePreRelease(context, productForm);
  const post = evaluatePostRelease(context, publishedAt);
  const preReleaseReady = preReleaseChecks.every((item) => !item.blocking);
  const postReleaseReady = post.checks.every((item) => !item.blocking);

  return {
    book: { id: book.id, title: book.title },
    jurisdiction: "DE",
    productForm,
    canonicalLanguage: context.profile?.publication_language ?? null,
    canonicalEditionLabel: context.profile?.edition_label ?? null,
    publisherMode: context.profile?.publisher_mode ?? null,
    imprint: context.imprint,
    distributionMetadata: context.distribution,
    declaration: context.declaration,
    publishedAt,
    dnbDueAt: post.dnbDueAt,
    preReleaseChecks,
    postReleaseChecks: post.checks,
    preReleaseReady,
    postReleaseReady,
    overallReady: preReleaseReady && (!publishedAt || postReleaseReady),
    statusLabel: preReleaseReady
      ? (publishedAt && !postReleaseReady ? "POST_RELEASE_ACTION_REQUIRED" : "CONTROLLED_RELEASE_READY")
      : "REQUIRES_ATTENTION",
    assurance: {
      legalCertification: false,
      message: "ScrollLibrary readiness is a control checklist combining system checks and publisher declarations; it is not legal advice or a legal certification.",
    },
    legalSources: LEGAL_SOURCES,
  };
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const rate = enforceRateLimit({ name: "de-publication-compliance", key: auth.userId, limit: 30, windowSec: 60 });
    if (rate) return rate;

    const sc = serviceClient();
    const access = await authorizeBook(sc, body.bookId, auth.userId);
    if (!access.found) return badRequest("Book not found");
    if (!access.authorized || !access.book) return forbidden("Not the owner of this book");

    if (body.action === "save") {
      const { data: profile, error: profileErr } = await sc
        .from("book_publishing_profiles")
        .select("edition_label,publication_language")
        .eq("book_id", body.bookId)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile) return json({ error: "PUBLISHING_IDENTITY_REQUIRED", message: "Configure Publishing Identity first." }, 409);

      const { data: existing, error: existingErr } = await sc
        .from("publication_compliance_declarations")
        .select("dnb_deposit_completed_at,state_deposit_completed_at")
        .eq("book_id", body.bookId)
        .eq("jurisdiction", "DE")
        .eq("product_form", body.productForm)
        .eq("language", profile.publication_language)
        .eq("edition_label", profile.edition_label)
        .maybeSingle();
      if (existingErr) throw existingErr;

      const now = new Date().toISOString();
      const payload = {
        book_id: body.bookId,
        owner_user_id: access.book.user_id ?? access.book.creator_id ?? auth.userId,
        jurisdiction: "DE",
        product_form: body.productForm,
        language: profile.publication_language,
        edition_label: profile.edition_label,
        german_market_intended: body.germanMarketIntended,
        commercial_release: body.commercialRelease,
        publisher_state_code: body.publisherStateCode?.toUpperCase() ?? null,
        publisher_operating_basis_confirmed: body.publisherOperatingBasisConfirmed,
        imprint_notice_confirmed: body.imprintNoticeConfirmed,
        dnb_deposit_plan_confirmed: body.dnbDepositPlanConfirmed,
        state_deposit_plan_confirmed: body.stateDepositPlanConfirmed,
        distribution_started_at: body.distributionStartedAt ?? null,
        dnb_deposit_completed_at: body.dnbDepositCompleted
          ? (existing?.dnb_deposit_completed_at ?? now)
          : null,
        state_deposit_completed_at: body.stateDepositCompleted
          ? (existing?.state_deposit_completed_at ?? now)
          : null,
        deposit_evidence_reference: body.depositEvidenceReference || null,
        direct_sales_enabled: body.directSalesEnabled,
        direct_sales_legal_notice_confirmed: body.directSalesLegalNoticeConfirmed,
        packaging_responsibility: body.packagingResponsibility,
        lucid_status: body.lucidStatus,
        notes: body.notes || null,
        acknowledged_at: now,
      };

      const { error: saveErr } = await sc
        .from("publication_compliance_declarations")
        .upsert(payload, { onConflict: "book_id,jurisdiction,product_form,language,edition_label" });
      if (saveErr) throw saveErr;
    }

    return json(await buildResponse(sc, access.book as Record<string, unknown>, body.productForm));
  } catch (error) {
    return serverError(error);
  }
});
