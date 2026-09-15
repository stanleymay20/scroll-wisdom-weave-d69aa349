import { expect, test, type Page, type Route } from "@playwright/test";

// These tests verify browser/UI contracts with deterministic network fixtures.
// They intentionally do NOT stand in for the separate secret-backed Stripe
// payment lifecycle or GA real-environment suites.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const SLUG = "deterministic-reader-book";
const BOOK_TITLE = "Deterministic Reader Book";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_scrolllibrary";
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6ImUyZUBleGFtcGxlLmNvbSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.test-signature";

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
};

type MockState = {
  checkoutRequests: Array<Record<string, unknown>>;
  listingWrites: Array<Record<string, unknown>>;
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
  const state: MockState = { checkoutRequests: [], listingWrites: [] };

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

    if (path === "/functions/v1/create-book-checkout") {
      state.checkoutRequests.push(requestBody(route));
      await fulfillJson(route, { url: CHECKOUT_URL });
      return;
    }

    if (path === "/functions/v1/check-subscription") {
      await fulfillJson(route, { subscribed: false, tier: "free", subscription_end: null });
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
      await fulfillJson(route, [{
        id: BOOK_ID,
        title: BOOK_TITLE,
        user_id: USER_ID,
        cover_image_url: "https://example.test/cover.jpg",
        ai_assistance_level: "assisted",
        book_type: "nonfiction",
      }], 200, { "content-range": "0-0/1" });
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
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __lastCheckoutUrl?: string }).__lastCheckoutUrl)).toBe(CHECKOUT_URL);
  await expect(page).toHaveURL(new RegExp(`/store/${SLUG}$`));
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
