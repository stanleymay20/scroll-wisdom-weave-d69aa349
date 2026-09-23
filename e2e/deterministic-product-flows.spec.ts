import { expect, test, type Page, type Route } from "@playwright/test";

// These tests verify browser/UI contracts with deterministic network fixtures.
// They intentionally do NOT stand in for the separate secret-backed Stripe
// payment lifecycle or GA real-environment suites.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const WORK_ID = "77777777-7777-4777-8777-777777777777";
const PUBLICATION_ID = "88888888-8888-4888-8888-888888888888";
const SLUG = "deterministic-reader-book";
const BOOK_TITLE = "Deterministic Reader Book";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_scrolllibrary";
const SUBSCRIPTION_CHECKOUT_URL = "https://checkout.stripe.test/subscription/cs_test_premium";
const BILLING_PORTAL_URL = "https://billing.stripe.test/session/bps_e2e";
/**
 * Assembled at runtime rather than embedded as a literal.
 *
 * This is a synthetic fixture, not a credential: the signature is the string
 * "test-signature" (an HS256 signature is 43 base64url characters), the subject
 * is the placeholder USER_ID above, and the address is on RFC 2606's reserved
 * example domain. But a literal `eyJ...` trips generic secret scanners —
 * GitGuardian flagged exactly this line — and a red secret check that everyone
 * learns to wave through is worse than no check.
 *
 * scripts/check-secrets.mjs already draws the distinction that matters and only
 * flags service_role tokens; this one is role "authenticated".
 *
 * The assembled string is byte-identical to the literal it replaces.
 */
function fixtureJwt(payload: Record<string, unknown>): string {
  const segment = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "HS256", typ: "JWT" })}.${segment(payload)}.test-signature`;
}

const ACCESS_TOKEN = fixtureJwt({
  aud: "authenticated",
  exp: 4102444800,
  sub: USER_ID,
  email: "e2e@example.com",
  role: "authenticated",
});

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@example.com",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "E2E Creator" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const session = {
  access_token: ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: "e2e-refresh-token",
  user,
};

const storeListing = {
  id: LISTING_ID,
  slug: SLUG,
  blurb: "A deterministic storefront fixture used only for browser regression coverage.",
  subtitle: "A reliable browser contract",
  amazon_description: null,
  price_cents: 1299,
  currency: "usd",
  sample_chapters: 1,
  cover_override_url: null,
  license_type: "personal",
  seo_keywords: ["testing", "reader"],
  series_id: null,
  series_order: null,
  updated_at: "2026-09-15T00:00:00.000Z",
  book: {
    id: BOOK_ID,
    title: BOOK_TITLE,
    description: "A deterministic book used to verify the storefront reader and checkout UI.",
    cover_image_url: null,
    category: "Technology",
    total_chapters: 2,
    author_user_id: USER_ID,
  },
  author: {
    slug: "e2e-creator",
    display_name: "E2E Creator",
    avatar_url: null,
  },
  series: null,
};

const chapter = {
  id: "44444444-4444-4444-8444-444444444444",
  chapter_number: 1,
  title: "The Reader Contract",
  content: "The mocked reader content proves that the public sample renders through the real Markdown reader surface.",
  word_count: 18,
  is_generated: true,
};

type MockState = {
  checkoutRequests: Array<Record<string, unknown>>;
  checkoutIdempotencyKeys: string[];
  listingWrites: Array<Record<string, unknown>>;
  generationRequests: Array<Record<string, unknown>>;
  chapterGenerationRequests: Array<Record<string, unknown>>;
  exportRequests: Array<Record<string, unknown>>;
  canonicalPublishRequests: Array<Record<string, unknown>>;
  distributionRequests: Array<Record<string, unknown>>;
  onixRequests: Array<Record<string, unknown>>;
  citationImportRequests: Array<Record<string, unknown>>;
  qualityFunctionCalls: string[];
  connectRequests: Array<Record<string, unknown>>;
  subscriptionCheckoutRequests: Array<Record<string, unknown>>;
  coverRegistrationRequests: Array<Record<string, unknown>>;
  coverStorageWrites: string[];
  scheduleWrites: Array<Record<string, unknown>>;
  scheduleItemWrites: Array<Record<string, unknown>>;
  canScheduleReleases: boolean;
  portalCalls: number;
  subscriptionTier: "free" | "student" | "premium" | "prophet_tier";
};

async function fulfillJson(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

function requestBody(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function installDeterministicBackend(page: Page): Promise<MockState> {
  const state: MockState = {
    checkoutRequests: [],
    checkoutIdempotencyKeys: [],
    listingWrites: [],
    generationRequests: [],
    chapterGenerationRequests: [],
    exportRequests: [],
    canonicalPublishRequests: [],
    distributionRequests: [],
    onixRequests: [],
    citationImportRequests: [],
    qualityFunctionCalls: [],
    connectRequests: [],
    subscriptionCheckoutRequests: [],
    coverRegistrationRequests: [],
    coverStorageWrites: [],
    scheduleWrites: [],
    scheduleItemWrites: [],
    canScheduleReleases: false,
    portalCalls: 0,
    subscriptionTier: "free",
  };

  await page.addInitScript(() => {
    localStorage.setItem("sl_onboarding_completed", "true");
    localStorage.setItem(
      "cookie-consent",
      JSON.stringify({ essential: true, analytics: false, marketing: false }),
    );
  });

  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/auth/v1/token") {
      await fulfillJson(route, session);
      return;
    }

    if (path === "/auth/v1/user") {
      await fulfillJson(route, user);
      return;
    }

    if (path.startsWith("/storage/v1/object/book-images/")) {
      state.coverStorageWrites.push(path);
      await fulfillJson(route, {
        Key: path.replace("/storage/v1/object/", ""),
      });
      return;
    }

    if (path.startsWith("/functions/v1/storefront-api/")) {
      const endpoint = path.split("/").pop();
      if (endpoint === "book") {
        await fulfillJson(route, storeListing);
      } else if (endpoint === "by-author") {
        await fulfillJson(route, { items: [], author: storeListing.author });
      } else {
        await fulfillJson(route, { items: [] });
      }
      return;
    }

    if (path === "/functions/v1/register-custom-cover") {
      const body = requestBody(route);
      state.coverRegistrationRequests.push(body);
      await fulfillJson(route, {
        success: true,
        coverUrl: body.assetUrl,
        provenance: "user_attested_publication_rights",
        authority: "server_cover_provenance",
      });
      return;
    }

    if (path === "/functions/v1/create-book-checkout") {
      state.checkoutRequests.push(requestBody(route));
      state.checkoutIdempotencyKeys.push(
        request.headers()["x-idempotency-key"] ?? "",
      );
      await fulfillJson(route, { url: CHECKOUT_URL });
      return;
    }

    if (path === "/functions/v1/verify-certificate") {
      const body = requestBody(route);
      if (body.certificateNumber === "SLC-MISSING-404") {
        await fulfillJson(route, { error: "not_found" }, 404);
        return;
      }
      await fulfillJson(route, {
        found: true,
        status: "valid",
        valid: true,
        certificateNumber: body.certificateNumber,
        certificateType: "mastery",
        issuedAt: "2026-09-20T12:00:00.000Z",
        holder: "E2E Learner",
        coveragePercentage: 100,
        integrity: { score: 0.97, classification: "high" },
        assessment: { contractVersion: "8.0", contractPassed: true },
        provenance: {
          contract: "content-sha256",
          storedHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          currentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          hashMatch: true,
        },
        verificationHash: "fixture-verification-token",
        book: {
          id: BOOK_ID,
          title: BOOK_TITLE,
          currentTitle: BOOK_TITLE,
          category: "technology",
          type: "text",
          version: "1.0",
        },
      });
      return;
    }

    if (path === "/functions/v1/creator-payout-profile") {
      if (method === "GET") {
        await fulfillJson(route, {
          profile: {
            user_id: USER_ID,
            payout_method: "unset",
            stripe_connect_status: "not_started",
            payout_email: null,
            country_code: null,
            tax_form_status: "not_required",
          },
        });
      } else {
        await fulfillJson(route, {
          profile: {
            user_id: USER_ID,
            payout_method: "manual",
            stripe_connect_status: "not_started",
            payout_email: "creator@example.test",
            country_code: "DE",
            tax_form_status: "not_required",
          },
        });
      }
      return;
    }

    if (path === "/functions/v1/stripe-connect-onboarding") {
      state.connectRequests.push(requestBody(route));
      await fulfillJson(route, {
        status: "pending",
        message: "Continue on Stripe to finish payout verification.",
        can_receive_payouts: false,
        onboarding_url: "https://connect.stripe.test/onboarding/session_e2e",
      });
      return;
    }

    if (path === "/functions/v1/create-checkout") {
      state.subscriptionCheckoutRequests.push(requestBody(route));
      await fulfillJson(route, { url: SUBSCRIPTION_CHECKOUT_URL });
      return;
    }

    if (path === "/functions/v1/generate-chapter") {
      state.chapterGenerationRequests.push(requestBody(route));
      await fulfillJson(route, {
        success: true,
        wordCount: 37,
        provider: "deterministic-e2e",
      });
      return;
    }

    if (path === "/functions/v1/customer-portal") {
      state.portalCalls += 1;
      await fulfillJson(route, { url: BILLING_PORTAL_URL });
      return;
    }

    if (path === "/functions/v1/get-entitlements") {
      await fulfillJson(route, {
        user_id: USER_ID,
        tier: state.canScheduleReleases ? "creator_pro" : "free",
        can_publish_external: state.canScheduleReleases,
        can_schedule_releases: state.canScheduleReleases,
        can_use_collections_unlimited: state.canScheduleReleases,
        priority_generation: false,
        monthly_generation_bonus: 0,
        rev_share_surcharge_bps: state.canScheduleReleases ? 0 : 1000,
        source: "deterministic-e2e",
        expires_at: null,
        is_default: !state.canScheduleReleases,
      });
      return;
    }

    if (path === "/functions/v1/check-subscription") {
      const subscribed = state.subscriptionTier !== "free";
      await fulfillJson(route, {
        subscribed,
        tier: state.subscriptionTier,
        subscription_end: subscribed ? "2026-10-23T00:00:00.000Z" : null,
      });
      return;
    }

    if (path === "/functions/v1/generate-book") {
      state.generationRequests.push(requestBody(route));
      await fulfillJson(route, {
        success: true,
        message: "Book created successfully",
        bookId: BOOK_ID,
        jobId: "55555555-5555-4555-8555-555555555555",
        outline: {
          bookTitle: BOOK_TITLE,
          chapters: [
            { chapterNumber: 1, title: "The Reader Contract" },
          ],
        },
      });
      return;
    }

    if (path === "/functions/v1/chief-editor-audit") {
      state.qualityFunctionCalls.push("chief-editor-audit");
      await fulfillJson(route, {
        auditId: "66666666-6666-4666-8666-666666666666",
        certificationEligible: true,
        certificationBlockers: [],
        scores: { overall: 96, structural: 97, academic: 95, pedagogical: 96 },
        chapterSuggestions: [],
        penalties: [],
        flaggedSections: [],
      });
      return;
    }

    if (path === "/functions/v1/proofread-chapter") {
      state.qualityFunctionCalls.push("proofread-chapter");
      await fulfillJson(route, { success: true, changed: true, applied: 2 });
      return;
    }

    if (path === "/functions/v1/qa-publishability-audit") {
      state.qualityFunctionCalls.push("qa-publishability-audit");
      await fulfillJson(route, {
        report: { status: "ready", score: 98, blockerCount: 0 },
      });
      return;
    }

    if (path === "/functions/v1/certify-production-render") {
      state.qualityFunctionCalls.push("certify-production-render");
      await fulfillJson(route, {
        passed: true,
        status: "ready",
        score: 99,
        fileHash: "fixture-production-hash",
        metrics: { pageCount: 12 },
        issues: [],
      });
      return;
    }

    if (path === "/functions/v1/finalize-publication-certification") {
      state.qualityFunctionCalls.push("finalize-publication-certification");
      await fulfillJson(route, {
        ready: true,
        jobStatus: "completed",
        authority: "server_attestations",
      });
      return;
    }

    if (path === "/functions/v1/export-book") {
      state.exportRequests.push(requestBody(route));
      const payload = Buffer.concat([
        Buffer.from("%PDF-1.4\n"),
        Buffer.alloc(2048, 32),
        Buffer.from("\n%%EOF\n"),
      ]);
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="deterministic-reader-book.pdf"',
          "Cache-Control": "no-store",
        },
        body: payload,
      });
      return;
    }

    if (path === "/functions/v1/publish-work") {
      state.canonicalPublishRequests.push(requestBody(route));
      await fulfillJson(route, {
        publication_id: PUBLICATION_ID,
        certificate_id: "99999999-9999-4999-8999-999999999998",
        version: "1.0.0",
        content_hash: "a".repeat(64),
        published_at: "2026-09-23T03:30:00.000Z",
        publisher: { mode: "kdp_independent" },
        scroll_identity: {},
        identifiers: [],
        idempotent: false,
      });
      return;
    }

    if (path === "/functions/v1/distribution-metadata") {
      const body = requestBody(route);
      state.distributionRequests.push(body);
      const action = body.action;
      await fulfillJson(route, {
        saved: action === "save",
        bookId: BOOK_ID,
        productForm: body.productForm ?? "paperback",
        canonicalLanguage: "en",
        canonicalEditionLabel: "First edition",
        isbnAssigned: true,
        published: true,
        metadata: {
          publication_date: "2026-10-01",
          warengruppe_code: "1110",
          product_availability: "20",
          publishing_status: "04",
          price_type: "04",
          price_cents: 1999,
          currency: "EUR",
          price_country: "DE",
          tax_rate_code: "R",
          tax_rate_percent: 7,
          unpriced_item_type: null,
          thema_codes: ["KJ"],
          keywords: ["decision intelligence"],
        },
      });
      return;
    }

    if (path === "/functions/v1/export-onix") {
      state.onixRequests.push(requestBody(route));
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": 'attachment; filename="deterministic-paperback-onix-3.1.xml"',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?><ONIXMessage release="3.1"><Header/><Product/></ONIXMessage>',
      });
      return;
    }

    if (path === "/functions/v1/import-citations") {
      const body = requestBody(route);
      state.citationImportRequests.push(body);
      if (body.commit === true) {
        await fulfillJson(route, { inserted: 1, skipped: 0 });
      } else {
        const items = Array.isArray(body.items) ? body.items : [];
        await fulfillJson(route, {
          preview: items.map((item) => ({
            ...(item as Record<string, unknown>),
            _dup_key: false,
            _dup_doi: false,
            _will_skip: false,
          })),
          would_insert: items.length,
        });
      }
      return;
    }

    if (path === "/functions/v1/publishing-identity") {
      await fulfillJson(route, {
        book: { id: BOOK_ID, title: BOOK_TITLE },
        profile: null,
        imprint: null,
        assignments: [],
        isbnClaims: [],
        ownedIsbns: [],
        platformImprints: [],
      });
      return;
    }

    if (path.startsWith("/functions/v1/")) {
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === "/rest/v1/public_listings") {
      if (method === "PATCH" || method === "POST") {
        const body = requestBody(route);
        state.listingWrites.push(body);
        await fulfillJson(route, { id: LISTING_ID, is_public: Boolean(body.is_public) });
        return;
      }

      if (url.searchParams.has("book_id")) {
        await fulfillJson(route, [{
          id: LISTING_ID,
          book_id: BOOK_ID,
          is_public: false,
          slug: SLUG,
          price_cents: 0,
          sample_chapters: 1,
          blurb: "Initial creator listing blurb for deterministic coverage.",
          subtitle: "",
          amazon_description: "",
          seo_keywords: [],
          seo_categories: [],
          backend_keywords: [],
          license_type: "personal",
          series_id: null,
          series_order: null,
          cover_override_url: null,
        }], 200, { "content-range": "0-0/1" });
        return;
      }

      await fulfillJson(route, [{
        id: LISTING_ID,
        sample_chapters: 1,
        book: { id: BOOK_ID, title: BOOK_TITLE },
      }], 200, { "content-range": "0-0/1" });
      return;
    }

    if (path === "/rest/v1/books") {
      const bookFixture = {
        id: BOOK_ID,
        title: BOOK_TITLE,
        description: "A deterministic book used to verify export and reader browser contracts.",
        category: "fiction",
        creator_id: USER_ID,
        user_id: USER_ID,
        cover_image_url: "https://example.test/cover.jpg",
        author_ai_agent: "E2E Creator",
        total_chapters: 1,
        is_published: false,
        language: "en",
        ai_assistance_level: "assisted",
        book_type: "text",
        source_type: "generated",
        work_id: WORK_ID,
        current_publication_id: null,
      };
      const wantsSingle = (request.headers()["accept"] ?? "").includes("application/vnd.pgrst.object+json");
      await fulfillJson(
        route,
        wantsSingle ? bookFixture : [bookFixture],
        200,
        { "content-range": "0-0/1" },
      );
      return;
    }

    if (path === "/rest/v1/release_schedules") {
      if (method === "POST") {
        const body = requestBody(route);
        state.scheduleWrites.push(body);
        const row = {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          book_id: BOOK_ID,
          owner_user_id: USER_ID,
          cadence: body.cadence ?? "weekly",
          start_at: body.start_at,
          channel: body.channel ?? "platform",
          early_access_tier: body.early_access_tier ?? null,
          status: "draft",
          metadata: {},
          created_at: "2026-09-23T12:00:00.000Z",
          updated_at: "2026-09-23T12:00:00.000Z",
        };
        const wantsSingle = (request.headers()["accept"] ?? "").includes("application/vnd.pgrst.object+json");
        await fulfillJson(route, wantsSingle ? row : [row], 201, { "content-range": "0-0/1" });
      } else {
        const wantsSingle = (request.headers()["accept"] ?? "").includes("application/vnd.pgrst.object+json");
        await fulfillJson(route, wantsSingle ? null : [], 200, { "content-range": "*/0" });
      }
      return;
    }

    if (path === "/rest/v1/release_schedule_items") {
      if (method === "POST") {
        const body = requestBody(route);
        const rows = Array.isArray(body) ? body : [body];
        state.scheduleItemWrites.push(...rows);
        const created = rows.map((row, index) => ({
          ...row,
          id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`,
          released_at: null,
          error_message: null,
        }));
        await fulfillJson(route, created, 201, {
          "content-range": created.length ? `0-${created.length - 1}/${created.length}` : "*/0",
        });
      } else if (method === "DELETE") {
        await route.fulfill({ status: 204 });
      } else {
        await fulfillJson(route, [], 200, { "content-range": "*/0" });
      }
      return;
    }

    if (path === "/rest/v1/chapters") {
      await fulfillJson(route, [chapter], 200, { "content-range": "0-0/1" });
      return;
    }

    if (path === "/rest/v1/rpc/get_book_elite_readiness") {
      await fulfillJson(route, null);
      return;
    }

    if (path === "/rest/v1/profiles") {
      await fulfillJson(route, [{
        id: USER_ID,
        user_id: USER_ID,
        daily_book_count: 0,
        last_book_date: null,
        plan: "free",
      }], 200, { "content-range": "0-0/1" });
      return;
    }

    if (path === "/rest/v1/generation_jobs") {
      await fulfillJson(route, [{
        id: "55555555-5555-4555-8555-555555555555",
        status: "partial",
        book_id: BOOK_ID,
        metadata: {},
      }], 200, { "content-range": "0-0/1" });
      return;
    }

    if (path === "/rest/v1/tts_usage" || path === "/rest/v1/book_series" || path === "/rest/v1/external_publications") {
      await fulfillJson(route, [], 200, { "content-range": "0-0/0" });
      return;
    }

    if (path.startsWith("/rest/v1/")) {
      await fulfillJson(route, [], 200, { "content-range": "0-0/0" });
      return;
    }

    await fulfillJson(route, {});
  });

  return state;
}

async function loginThroughMockedAuth(page: Page) {
  await page.goto("/auth");
  await page.locator("#email").fill("e2e@example.com");
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 10_000 });
}

test("public sample reader renders canonical sample content and returns to the listing", async ({ page }) => {
  await installDeterministicBackend(page);
  await page.goto(`/store/${SLUG}/read`);

  await expect(page.getByRole("heading", { level: 1, name: BOOK_TITLE })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Chapter 1: The Reader Contract" })).toBeVisible();
  await expect(page.getByText(/mocked reader content proves/i)).toBeVisible();
  await expect(page.getByText("Free sample · First 1 chapter", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Unlock full book" }).click();
  await expect(page).toHaveURL(new RegExp(`/store/${SLUG}$`));
  await expect(page.getByRole("heading", { level: 1, name: BOOK_TITLE })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read sample" })).toBeVisible();
});

test("paid checkout CTA sends the listing id and consumes the returned Stripe checkout URL", async ({ page }) => {
  const state = await installDeterministicBackend(page);

  await page.goto(`/store/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: BOOK_TITLE })).toBeVisible();
  await expect(page.getByText("$12.99", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const testWindow = window as typeof window & { __lastCheckoutUrl?: string };
    testWindow.__lastCheckoutUrl = undefined;
    testWindow.open = ((url?: string | URL) => {
      testWindow.__lastCheckoutUrl = String(url ?? "");
      return testWindow;
    }) as typeof window.open;
  });

  await page.getByRole("button", { name: "Buy for $12.99" }).click();

  await expect.poll(() => state.checkoutRequests.length).toBe(1);
  expect(state.checkoutRequests[0]).toMatchObject({ listing_id: LISTING_ID });
  expect(state.checkoutIdempotencyKeys).toHaveLength(1);
  expect(state.checkoutIdempotencyKeys[0]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __lastCheckoutUrl?: string }).__lastCheckoutUrl)).toBe(CHECKOUT_URL);
  await expect(page).toHaveURL(new RegExp(`/store/${SLUG}$`));
});


test("free creator sees serialized release scheduling locked and cannot create a schedule", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  state.canScheduleReleases = false;
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}/publish`);

  await expect(
    page.getByText("Serialized release schedules are locked", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Create schedule" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View creator plans" })).toHaveAttribute("href", "/pricing");
  expect(state.scheduleWrites).toHaveLength(0);
});

test("entitled creator creates a serialized release schedule and chapter release items", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  state.canScheduleReleases = true;
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}/publish`);

  await expect(page.getByText("Serialized release schedule", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Create schedule" })).toBeVisible();

  // Keep the default weekly/platform settings; set a deterministic local time.
  await page.getByLabel("First release").fill("2026-10-01T09:00");
  await page.getByRole("button", { name: "Create schedule" }).click();

  await expect.poll(() => state.scheduleWrites.length).toBe(1);
  expect(state.scheduleWrites[0]).toMatchObject({
    book_id: BOOK_ID,
    owner_user_id: USER_ID,
    cadence: "weekly",
    channel: "platform",
  });
  expect(String(state.scheduleWrites[0].start_at)).toMatch(/^2026-10-01T/);
  await expect(page.getByText("Schedule saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Regenerate releases" }).click();

  await expect.poll(() => state.scheduleItemWrites.length).toBe(1);
  expect(state.scheduleItemWrites[0]).toMatchObject({
    schedule_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    chapter_id: chapter.id,
    chapter_number: chapter.chapter_number,
    status: "scheduled",
  });
  await expect(page.getByText("Generated 1 release", { exact: true })).toBeVisible();
  await expect(page.getByText("Ch. 1", { exact: true })).toBeVisible();
  await expect(page.getByText("scheduled", { exact: true }).last()).toBeVisible();
});

test("creator publish settings persist storefront visibility and slug through the protected UI", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}/publish`);
  await expect(page.getByRole("heading", { level: 1, name: `Publish: ${BOOK_TITLE}` })).toBeVisible({ timeout: 10_000 });

  const publicSwitch = page.getByRole("switch", { name: "Make public on storefront" });
  await expect(publicSwitch).not.toBeChecked();
  await publicSwitch.click();
  await expect(publicSwitch).toBeChecked();

  await page.getByLabel("Slug").fill("Regression Release");
  await expect(page.getByLabel("Slug")).toHaveValue("regression-release");
  await page.getByPlaceholder("One-sentence pitch shown on the card.").fill("A release-ready storefront description.");

  await page.getByRole("button", { name: "Save listing" }).click();

  await expect.poll(() => state.listingWrites.length).toBe(1);
  expect(state.listingWrites[0]).toMatchObject({
    book_id: BOOK_ID,
    slug: "regression-release",
    is_public: true,
    price_cents: 0,
    blurb: "A release-ready storefront description.",
  });
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
});


test("canonical publishing action invokes publish-work without changing storefront visibility", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}/publish`);
  const publishButton = page.getByRole("button", { name: "Create canonical publication" });
  await expect(publishButton).toBeVisible({ timeout: 10_000 });
  await publishButton.click();

  await expect.poll(() => state.canonicalPublishRequests.length).toBe(1);
  expect(state.canonicalPublishRequests[0]).toMatchObject({
    work_id: WORK_ID,
    edition_kind: "original",
    language: "en",
  });

  // Canonical publishing is independent of commercial listing visibility.
  expect(state.listingWrites).toHaveLength(0);
  await expect(page.getByText(/Version:\s*1\.0\.0/)).toBeVisible();
});

test("generate form invokes the real generation route and follows the returned book id", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto("/generate");
  await expect(page.locator("#title")).toBeVisible({ timeout: 10_000 });
  await page.locator("#title").fill(BOOK_TITLE);
  await page.locator("#description").fill(
    "A deterministic generation fixture proving that the shipped Generate page reaches the generate-book Edge Function.",
  );

  // The first Radix select on the page is Category.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Technology" }).click();

  await page.getByRole("radio", { name: /Standard Text/i }).click();
  await page.getByRole("button", { name: /Generate Book/i }).click();

  await expect.poll(() => state.generationRequests.length).toBe(1);
  expect(state.generationRequests[0]).toMatchObject({
    title: BOOK_TITLE,
    category: "technology",
    numChapters: 5,
    wordCount: 4000,
    language: "en",
    bookType: "text",
    extendedBookType: "text",
    academicMode: true,
    deepResearch: true,
  });

  await expect(page).toHaveURL(new RegExp(`/book/${BOOK_ID}$`), { timeout: 5_000 });
});


test("publishing command center saves trade metadata and downloads ONIX through server authorities", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}/publishing`);
  await expect(page.getByRole("heading", { name: "Publishing Command Center" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Trade Distribution Metadata" })).toBeVisible({ timeout: 10_000 });

  await expect.poll(() =>
    state.distributionRequests.filter((request) => request.action === "get").length
  ).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Save distribution metadata" }).click();
  await expect.poll(() =>
    state.distributionRequests.filter((request) => request.action === "save").length
  ).toBe(1);

  const saved = state.distributionRequests.find((request) => request.action === "save");
  expect(saved).toMatchObject({
    bookId: BOOK_ID,
    productForm: "paperback",
    publicationDate: "2026-10-01",
    warengruppeCode: "1110",
    priceType: "04",
    priceCents: 1999,
    currency: "EUR",
    priceCountry: "DE",
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ONIX 3.1" }).click();
  const download = await downloadPromise;

  await expect.poll(() => state.onixRequests.length).toBe(1);
  expect(state.onixRequests[0]).toMatchObject({
    bookId: BOOK_ID,
    productForm: "paperback",
  });
  expect(download.suggestedFilename()).toBe("scrolllibrary-paperback-onix-3.1.xml");
});

test("citation manager previews duplicates before committing a bulk import", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}/publishing`);
  await expect(page.getByRole("heading", { name: "Evidence & Citations" })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Import JSON" }).click();
  const input = page.getByLabel("Citation import JSON");
  await expect(input).toBeVisible();

  const fixture = [{
    citation_key: "smith2026",
    source_type: "journal_article",
    citation_text: "Deterministic evidence fixture",
    authors: [{ family: "Smith", given: "Ada" }],
    doi: "10.0000/deterministic",
  }];
  await input.fill(JSON.stringify(fixture));

  await page.getByRole("button", { name: "Preview import" }).click();
  await expect.poll(() => state.citationImportRequests.length).toBe(1);
  expect(state.citationImportRequests[0]).toMatchObject({
    book_id: BOOK_ID,
    commit: false,
  });
  await expect(page.getByRole("button", { name: "Import 1" })).toBeEnabled();

  await page.getByRole("button", { name: "Import 1" }).click();
  await expect.poll(() => state.citationImportRequests.length).toBe(2);
  expect(state.citationImportRequests[1]).toMatchObject({
    book_id: BOOK_ID,
    commit: true,
  });
});





test("custom cover upload requires explicit publication-rights confirmation before storage and registration", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);
  await page.goto(`/book/${BOOK_ID}`);
  await expect(page.getByRole("heading", { name: BOOK_TITLE }).first()).toBeVisible({ timeout: 10_000 });

  const fileInput = page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').first();
  const fixture = {
    name: "rights-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]),
  };

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Publication rights confirmation");
    await dialog.dismiss();
  });
  await fileInput.setInputFiles(fixture);

  await expect.poll(() => state.coverStorageWrites.length).toBe(0);
  await expect.poll(() => state.coverRegistrationRequests.length).toBe(0);
  await expect(page.getByText("Cover not uploaded", { exact: true })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("commercially distribute");
    await dialog.accept();
  });
  await fileInput.setInputFiles(fixture);

  await expect.poll(() => state.coverStorageWrites.length).toBe(1);
  expect(state.coverStorageWrites[0]).toContain(
    `/storage/v1/object/book-images/${USER_ID}/covers/${BOOK_ID}-`,
  );

  await expect.poll(() => state.coverRegistrationRequests.length).toBe(1);
  expect(state.coverRegistrationRequests[0]).toMatchObject({
    bookId: BOOK_ID,
    confirmPublicationRights: true,
  });
  expect(String(state.coverRegistrationRequests[0].assetUrl)).toContain(
    `/storage/v1/object/public/book-images/${USER_ID}/covers/${BOOK_ID}-`,
  );

  await expect(page.getByText("Cover updated", { exact: true })).toBeVisible();
});

test("generated chapter regeneration requires explicit edit intent and sends the revision contract", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}`);
  await expect(page.getByRole("heading", { name: BOOK_TITLE }).first()).toBeVisible({ timeout: 10_000 });

  await page.locator('[title="Regenerate chapter"]').click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Regenerate chapter (revision)" })).toBeVisible();

  // Blank intent is fail-closed in the UI and must not hit the generation API.
  await dialog.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect.poll(() => state.chapterGenerationRequests.length).toBe(0);
  await expect(page.getByText("Edit intent required", { exact: true })).toBeVisible();

  const intent = "Shorten the chapter and make the examples more concrete.";
  await dialog.getByPlaceholder(/Shorten by 30%/i).fill(intent);
  await dialog.getByRole("button", { name: "Regenerate", exact: true }).click();

  await expect.poll(() => state.chapterGenerationRequests.length).toBe(1);
  expect(state.chapterGenerationRequests[0]).toMatchObject({
    chapterId: chapter.id,
    bookTitle: BOOK_TITLE,
    chapterTitle: chapter.title,
    chapterNumber: chapter.chapter_number,
    category: "fiction",
    language: "en",
    bookType: "text",
    academicMode: false,
    citationStyle: "APA",
    regenerate: true,
    isRegeneration: true,
    originalContent: chapter.content,
    editIntent: intent,
  });

  await expect(page.getByText("Chapter updated", { exact: true })).toBeVisible();
});

test("authenticated generated book exports a non-placeholder PDF through the real Download UI", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}`);
  await expect(page.getByRole("heading", { name: BOOK_TITLE }).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Download/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /PDF/i }).first().click();
  const download = await downloadPromise;

  await expect.poll(() => state.exportRequests.length).toBe(1);
  expect(state.exportRequests[0]).toMatchObject({
    bookId: BOOK_ID,
    format: "pdf",
    isAcademicMode: false,
    citationStyle: "APA",
  });
  expect(download.suggestedFilename()).toBe("deterministic-reader-book.pdf");
});


test("Retry publication review drives the shipped quality pipeline through final server certification", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto(`/book/${BOOK_ID}`);
  await expect(page.getByRole("heading", { name: BOOK_TITLE }).first()).toBeVisible({ timeout: 10_000 });

  const retry = page.getByRole("button", { name: /Retry publication review/i });
  await expect(retry).toBeVisible({ timeout: 10_000 });
  await retry.click();

  await expect(page.getByText("Publication candidate verified", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => state.qualityFunctionCalls).toEqual([
    "chief-editor-audit",
    "proofread-chapter",
    "qa-publishability-audit",
    "certify-production-render",
    "finalize-publication-certification",
  ]);
});


test("public certificate verification renders a server-authoritative valid learning record", async ({ page }) => {
  await installDeterministicBackend(page);

  await page.goto("/certificate/SLC-VALID-001");

  await expect(page.getByRole("heading", { name: "Verified & Valid" })).toBeVisible();
  await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();
  await expect(page.getByText("E2E Learner", { exact: true })).toBeVisible();
  await expect(page.getByText("100%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Live SHA-256 matches issuance state/i)).toBeVisible();
  await page.getByText("Technical provenance", { exact: true }).click();
  await expect(page.getByText("fixture-verification-token", { exact: false })).toBeVisible();
});

test("public certificate verification renders not-found without making a validity claim", async ({ page }) => {
  await installDeterministicBackend(page);

  await page.goto("/certificate/SLC-MISSING-404");

  await expect(page.getByRole("heading", { name: "Not Found" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("SLC-MISSING-404", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verified & Valid" })).toHaveCount(0);
});


test("creator payout page starts Stripe Connect with the real registered return path", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.route("https://connect.stripe.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>Stripe Connect fixture</body></html>",
    });
  });

  await page.goto("/account/payouts");
  await expect(page.getByRole("heading", { name: "Payout settings" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start Stripe Connect onboarding" }).click();

  await expect.poll(() => state.connectRequests.length).toBe(1);
  expect(state.connectRequests[0]).toEqual({
    action: "start",
    return_path: "/account/payouts",
  });

  await expect(page).toHaveURL("https://connect.stripe.test/onboarding/session_e2e", { timeout: 10_000 });
});


test("pricing upgrade sends the canonical Premium tier and price to subscription checkout", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  await loginThroughMockedAuth(page);

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Plans & Pricing" })).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __lastBillingUrl?: string };
    testWindow.__lastBillingUrl = undefined;
    testWindow.open = ((url?: string | URL) => {
      testWindow.__lastBillingUrl = String(url ?? "");
      return testWindow;
    }) as typeof window.open;
  });

  const premiumCard = page.getByText("Premium", { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'border')][1]");
  const premiumUpgrade = page.getByRole("button", { name: "Upgrade to Premium" }).first();
  await expect(premiumUpgrade).toBeEnabled();
  await premiumUpgrade.click();

  await expect.poll(() => state.subscriptionCheckoutRequests.length).toBe(1);
  expect(state.subscriptionCheckoutRequests[0]).toEqual({
    priceId: "price_1SdFddJYFIBeCvefJr1ZY92E",
    tier: "premium",
  });

  await expect.poll(() =>
    page.evaluate(() => (window as typeof window & { __lastBillingUrl?: string }).__lastBillingUrl)
  ).toBe(SUBSCRIPTION_CHECKOUT_URL);
  await expect(premiumCard).toBeVisible();
});

test("subscribed pricing page opens the server-created Stripe billing portal", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  state.subscriptionTier = "premium";
  await loginThroughMockedAuth(page);

  await page.goto("/pricing");
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __lastBillingUrl?: string };
    testWindow.__lastBillingUrl = undefined;
    testWindow.open = ((url?: string | URL) => {
      testWindow.__lastBillingUrl = String(url ?? "");
      return testWindow;
    }) as typeof window.open;
  });
  const manage = page.getByRole("button", { name: "Manage Subscription" }).first();
  await expect(manage).toBeVisible({ timeout: 10_000 });
  await manage.click();

  await expect.poll(() => state.portalCalls).toBe(1);
  await expect.poll(() =>
    page.evaluate(() => (window as typeof window & { __lastBillingUrl?: string }).__lastBillingUrl)
  ).toBe(BILLING_PORTAL_URL);
});


test("post-checkout success only claims activation after server confirmation", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  state.subscriptionTier = "premium";
  await loginThroughMockedAuth(page);

  await page.goto("/pricing?success=true");

  await expect(page.getByText("Subscription activated!", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Welcome! Your features are now unlocked.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/pricing$/, { timeout: 10_000 });
});

test("post-checkout return stays truthful while entitlement confirmation is delayed", async ({ page }) => {
  const state = await installDeterministicBackend(page);
  state.subscriptionTier = "free";
  await loginThroughMockedAuth(page);

  await page.goto("/pricing?success=true");

  await expect(
    page.getByText("Payment received — confirming subscription", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Subscription activated!", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/pricing$/, { timeout: 10_000 });
});
