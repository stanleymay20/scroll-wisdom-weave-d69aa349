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
  ["/kingdom-wealth/tools", /companion tools/i],
] as const) {
  test(`${path} renders its legal/public surface`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}

test("Kingdom Wealth companion downloads are generated for unauthenticated readers", async ({ page }) => {
  await page.goto("/kingdom-wealth/tools");
  await expect(page.getByRole("heading", { level: 1, name: /companion tools/i })).toBeVisible();

  for (const [buttonName, filename] of [
    [/download workbook/i, "KINGDOM_WEALTH_STEWARDS_WORKBOOK_CSV_PACK.zip"],
    [/download guide/i, "KINGDOM_WEALTH_12_WEEK_GROUP_GUIDE.md"],
    [/download pilot pack/i, "KINGDOM_WEALTH_COMPANION_PILOT_PACK.zip"],
  ] as const) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: buttonName }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    expect(await download.failure()).toBeNull();
  }
});

test("Kingdom Wealth companion tools fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/kingdom-wealth/tools");

  await expect(page.getByRole("heading", { level: 1, name: /companion tools/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /download workbook/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /download guide/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /download pilot pack/i })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("protected routes fail closed to authentication", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/auth$/);
});

test("unknown routes return the branded not-found surface", async ({ page }) => {
  await page.goto("/definitely-not-a-real-route");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
