import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_ID = "99999999-9999-4999-8999-999999999999";

function fixtureJwt(payload: Record<string, unknown>): string {
  const segment = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "HS256", typ: "JWT" })}.${segment(payload)}.test-signature`;
}

const ACCESS_TOKEN = fixtureJwt({
  aud: "authenticated",
  exp: 4102444800,
  sub: USER_ID,
  email: "upload-e2e@example.com",
  role: "authenticated",
});

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "upload-e2e@example.com",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Upload E2E" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const session = {
  access_token: ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: "upload-e2e-refresh-token",
  user,
};

type UploadState = {
  requests: Array<Record<string, unknown>>;
  delayProcessDocument: boolean;
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

async function installBackend(page: Page): Promise<UploadState> {
  const state: UploadState = { requests: [], delayProcessDocument: false };

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

    if (path === "/auth/v1/token") return fulfillJson(route, session);
    if (path === "/auth/v1/user") return fulfillJson(route, user);

    if (path === "/functions/v1/check-subscription") {
      return fulfillJson(route, { subscribed: false, tier: "free", subscription_end: null });
    }

    if (path === "/functions/v1/process-document") {
      state.requests.push(requestBody(route));
      if (state.delayProcessDocument) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
      return fulfillJson(route, {
        success: true,
        bookId: BOOK_ID,
        title: "Upload Pipeline Fixture",
        chaptersCreated: 2,
      });
    }

    if (path === "/rest/v1/profiles") {
      return fulfillJson(route, [{
        id: USER_ID,
        user_id: USER_ID,
        daily_book_count: 0,
        last_book_date: null,
        plan: "free",
      }], 200, { "content-range": "0-0/1" });
    }

    if (path.startsWith("/functions/v1/")) return fulfillJson(route, { ok: true });
    if (path.startsWith("/rest/v1/")) return fulfillJson(route, [], 200, { "content-range": "0-0/0" });
    return fulfillJson(route, {});
  });

  return state;
}

async function login(page: Page) {
  await page.goto("/auth");
  await page.locator("#email").fill("upload-e2e@example.com");
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 10_000 });
}

test("TXT upload reaches process-document with extracted source text and produces a book result", async ({ page }) => {
  const state = await installBackend(page);
  await login(page);
  await page.goto("/upload");

  const text = [
    "Chapter 1: Foundations",
    "This deterministic manuscript fixture is intentionally longer than two hundred characters.",
    "It proves that the browser reads the selected file and sends the extracted text rather than a fake filename-only request.",
    "Chapter 2: Verification",
    "The second chapter gives the fixture enough structure to represent a real import pathway for ScrollLibrary.",
  ].join("\n\n");

  await page.locator("#file-input").setInputFiles({
    name: "upload-pipeline-fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });

  await expect(page.getByText("upload-pipeline-fixture.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Process & Create Learning Path" }).click();

  await expect(page.getByRole("heading", { name: "Learning Path Created!" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Upload Pipeline Fixture", { exact: true })).toBeVisible();

  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]).toMatchObject({
    documentName: "upload-pipeline-fixture.txt",
    sourceType: "uploaded",
    language: "en",
    documentText: text,
  });
});

test("oversized upload is rejected in the browser and never reaches process-document", async ({ page }) => {
  const state = await installBackend(page);
  await login(page);
  await page.goto("/upload");

  await page.locator("#file-input").setInputFiles({
    name: "too-large.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 65),
  });

  await expect(page.getByText("File too large", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Process & Create Learning Path" })).toBeDisabled();
  expect(state.requests).toHaveLength(0);
});

test("unsupported extension is rejected even when file-picker accept filters are bypassed", async ({ page }) => {
  const state = await installBackend(page);
  await login(page);
  await page.goto("/upload");

  await page.locator("#file-input").setInputFiles({
    name: "payload.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a supported manuscript format"),
  });

  await expect(page.getByText("Unsupported format", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Process & Create Learning Path" })).toBeDisabled();
  expect(state.requests).toHaveLength(0);
});

test("once server analysis starts the UI says Stop waiting rather than falsely promising cancellation", async ({ page }) => {
  const state = await installBackend(page);
  state.delayProcessDocument = true;
  await login(page);
  await page.goto("/upload");

  const text = "Chapter 1: Cancellation semantics. ".repeat(12);
  await page.locator("#file-input").setInputFiles({
    name: "slow-upload.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });

  await page.getByRole("button", { name: "Process & Create Learning Path" }).click();
  await expect(page.getByRole("button", { name: "Stop waiting" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/work already accepted by the server may still finish/i)).toBeVisible();

  await page.getByRole("button", { name: "Stop waiting" }).click();
  await expect(page.getByRole("heading", { name: "Upload & Learn" })).toBeVisible();
  await expect(page.getByText("Stopped waiting", { exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(1);
});
