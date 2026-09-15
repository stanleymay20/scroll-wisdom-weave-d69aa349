import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "55555555-5555-4555-8555-555555555555";

function fixtureJwt(payload: Record<string, unknown>): string {
  const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "HS256", typ: "JWT" })}.${segment(payload)}.test-signature`;
}

const ACCESS_TOKEN = fixtureJwt({
  aud: "authenticated",
  exp: 4102444800,
  sub: USER_ID,
  email: "delete-e2e@example.com",
  role: "authenticated",
});

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "delete-e2e@example.com",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Deletion E2E" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const session = {
  access_token: ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: "delete-e2e-refresh-token",
  user,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installDeletionBackend(page: Page) {
  let deleteCalls = 0;

  await page.addInitScript(() => {
    localStorage.setItem("sl_onboarding_completed", "true");
    localStorage.setItem(
      "cookie-consent",
      JSON.stringify({ essential: true, analytics: false, marketing: false }),
    );
  });

  await page.route("**/*.supabase.co/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/auth/v1/token") {
      await fulfillJson(route, session);
      return;
    }

    if (path === "/auth/v1/user") {
      await fulfillJson(route, user);
      return;
    }

    if (path === "/auth/v1/logout") {
      await fulfillJson(route, {});
      return;
    }

    if (path === "/functions/v1/delete-account") {
      deleteCalls += 1;
      expect(request.headers()["authorization"]).toContain(ACCESS_TOKEN);
      await fulfillJson(route, {
        success: true,
        message: "Account deleted; certificates remain revoked and verifiable.",
      });
      return;
    }

    if (path.startsWith("/rest/v1/")) {
      await fulfillJson(route, []);
      return;
    }

    if (path.startsWith("/functions/v1/")) {
      await fulfillJson(route, { ok: true });
      return;
    }

    await fulfillJson(route, {});
  });

  return { deleteCalls: () => deleteCalls };
}

async function login(page: Page) {
  await page.goto("/auth");
  await page.locator("#email").fill("delete-e2e@example.com");
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 10_000 });
}

test("account deletion requires both confirmations and reports retained-certificate success", async ({ page }) => {
  const backend = await installDeletionBackend(page);
  await login(page);

  await page.goto("/account/delete");
  await expect(page.getByRole("heading", { name: "Delete Your Account" })).toBeVisible();
  await expect(page.getByText(/certificates will be revoked/i).first()).toBeVisible();

  const deleteButton = page.getByRole("button", { name: "Delete My Account" });
  await expect(deleteButton).toBeDisabled();

  await page.getByRole("checkbox").check();
  await expect(deleteButton).toBeDisabled();

  await page.getByPlaceholder("delete my account").fill("delete my account");
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  await expect.poll(backend.deleteCalls).toBe(1);
  await expect(page.getByRole("heading", { name: "Account Deleted" })).toBeVisible();
  await expect(page.getByText(/personal data have been permanently deleted/i)).toBeVisible();
  await expect(page.getByText(/revoked but remain publicly verifiable/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to Home" })).toBeVisible();
});
