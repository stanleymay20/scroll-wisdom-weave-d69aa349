import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/token") || url.includes("/auth/v1/user")) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "not authenticated" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]", headers: { "content-range": "0-0/0" } });
  });
});

test("home renders the public product shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/ScrollLibrary/i);
  await expect(page.locator("body")).toContainText("ScrollLibrary");
  await expect(page.locator("main")).toBeVisible();
});

for (const [path, heading] of [
  ["/about", /about/i],
  ["/privacy", /privacy/i],
  ["/terms", /terms/i],
] as const) {
  test(`${path} renders its legal/public surface`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}

test("protected routes fail closed to authentication", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/auth$/);
});

test("unknown routes return the branded not-found surface", async ({ page }) => {
  await page.goto("/definitely-not-a-real-route");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
