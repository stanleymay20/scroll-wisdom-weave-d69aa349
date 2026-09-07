import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabaseUrl = required("E2E_SUPABASE_URL");
const anonKey = required("E2E_SUPABASE_ANON_KEY");
const userOneEmail = required("E2E_USER_ONE_EMAIL");
const userOnePassword = required("E2E_USER_ONE_PASSWORD");
const userTwoEmail = required("E2E_USER_TWO_EMAIL");
const userTwoPassword = required("E2E_USER_TWO_PASSWORD");

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 15_000 });
}

async function accessTokenFor(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    data: { email, password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(typeof body.access_token).toBe("string");
  return body.access_token as string;
}

async function readOwnVoiceUsage(request: APIRequestContext, token: string) {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/interactive_voice_usage?select=user_id,month,seconds_used&order=seconds_used.asc`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Array<{ user_id: string; month: string; seconds_used: number }>;
}

test("real auth session survives reload and reaches a protected library route", async ({ page }) => {
  await loginThroughUi(page, userOneEmail, userOnePassword);

  await page.reload();
  await page.goto("/library");

  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { level: 1, name: "My Library" })).toBeVisible({ timeout: 15_000 });
});

test("invalid real credentials fail closed with the friendly auth error", async ({ page }) => {
  await page.goto("/auth");
  await page.locator("#email").fill(userOneEmail);
  await page.locator("#password").fill(`${userOnePassword}-wrong`);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/auth(?:\?|$)/);
  await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 15_000 });
});

test("RLS isolates two authenticated users and browser roles cannot write the quota ledger", async ({ request }) => {
  const tokenOne = await accessTokenFor(request, userOneEmail, userOnePassword);
  const tokenTwo = await accessTokenFor(request, userTwoEmail, userTwoPassword);

  const rowsOne = await readOwnVoiceUsage(request, tokenOne);
  const rowsTwo = await readOwnVoiceUsage(request, tokenTwo);

  expect(rowsOne).toHaveLength(1);
  expect(rowsTwo).toHaveLength(1);
  expect(rowsOne[0].seconds_used).toBe(11);
  expect(rowsTwo[0].seconds_used).toBe(22);
  expect(rowsOne[0].user_id).not.toBe(rowsTwo[0].user_id);

  const deniedInsert = await request.post(`${supabaseUrl}/rest/v1/interactive_voice_usage`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${tokenOne}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      user_id: rowsOne[0].user_id,
      month: "2099-01",
      seconds_used: 999,
    },
  });

  expect([401, 403]).toContain(deniedInsert.status());
  expect(await readOwnVoiceUsage(request, tokenOne)).toHaveLength(1);
});
