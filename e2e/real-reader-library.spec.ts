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
const lifecycleTitle = "GA E2E Lifecycle Book";

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.addInitScript(() => {
    localStorage.setItem("sl_onboarding_completed", "true");
    localStorage.setItem(
      "cookie-consent",
      JSON.stringify({ essential: true, analytics: false, marketing: false }),
    );
  });

  await page.goto("/auth");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 15_000 });
}

async function accessTokenFor(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(typeof body.access_token).toBe("string");
  return body.access_token as string;
}

async function lifecycleBook(request: APIRequestContext) {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/books?select=id,title,total_chapters&title=eq.${encodeURIComponent(lifecycleTitle)}`,
    { headers: { apikey: anonKey } },
  );
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as Array<{ id: string; title: string; total_chapters: number | null }>;
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function libraryRows(request: APIRequestContext, token: string) {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/user_library?select=id,book_id,last_read_chapter,progress_percent&order=created_at.asc`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Array<{
    id: string;
    book_id: string;
    last_read_chapter: number;
    progress_percent: number;
  }>;
}

async function highlightRows(request: APIRequestContext, token: string) {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/highlights?select=id,chapter_id,excerpt,note&order=created_at.asc`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Array<{ id: string; chapter_id: string; excerpt: string; note: string | null }>;
}

async function profileRows(request: APIRequestContext, token: string) {
  const response = await request.get(`${supabaseUrl}/rest/v1/profiles?select=id,full_name&order=created_at.asc`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Array<{ id: string; full_name: string | null }>;
}

test("published lifecycle chapter remains anonymously readable without exposing library rows", async ({ request }) => {
  const book = await lifecycleBook(request);

  const chapterResponse = await request.get(
    `${supabaseUrl}/rest/v1/chapters?select=title,content&book_id=eq.${book.id}&chapter_number=eq.1`,
    { headers: { apikey: anonKey } },
  );
  expect(chapterResponse.status(), await chapterResponse.text()).toBe(200);
  const chapters = (await chapterResponse.json()) as Array<{ title: string; content: string | null }>;
  expect(chapters).toHaveLength(1);
  expect(chapters[0].title).toBe("The Reader Contract");
  expect(chapters[0].content).toContain("real authenticated reader can open this chapter");

  const anonymousLibraryResponse = await request.get(
    `${supabaseUrl}/rest/v1/user_library?select=id,book_id`,
    { headers: { apikey: anonKey } },
  );
  expect(anonymousLibraryResponse.status(), await anonymousLibraryResponse.text()).toBe(200);
  expect(await anonymousLibraryResponse.json()).toEqual([]);
});

test("real library renders the authenticated reader's saved book and routes to its detail page", async ({ page }) => {
  await loginThroughUi(page, userOneEmail, userOnePassword);
  await page.goto("/library");

  const bookHeading = page.getByRole("heading", { level: 3, name: lifecycleTitle });
  await expect(bookHeading).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("25%", { exact: true })).toBeVisible();

  await bookHeading.click();
  await expect(page).toHaveURL(/\/book\/[0-9a-f-]+$/i, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: lifecycleTitle })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/2\s+chapters/i)).toBeVisible();
});

test("real reader loads generated chapter content and remains readable after reload", async ({ page, request }) => {
  const book = await lifecycleBook(request);
  await loginThroughUi(page, userOneEmail, userOnePassword);

  await page.goto(`/read/${book.id}/1`);
  await expect(page).toHaveURL(new RegExp(`/read/${book.id}/1$`));
  await expect(page.getByText("The Reader Contract", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/real authenticated reader can open this chapter/i)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/read/${book.id}/1$`));
  await expect(page.getByText(/real authenticated reader can open this chapter/i)).toBeVisible({ timeout: 15_000 });
});

test("real profile, library and highlight ownership remain isolated between two authenticated users", async ({ request }) => {
  const book = await lifecycleBook(request);
  const tokenOne = await accessTokenFor(request, userOneEmail, userOnePassword);
  const tokenTwo = await accessTokenFor(request, userTwoEmail, userTwoPassword);

  const oneProfiles = await profileRows(request, tokenOne);
  const twoProfiles = await profileRows(request, tokenTwo);
  expect(oneProfiles).toHaveLength(1);
  expect(twoProfiles).toHaveLength(1);
  expect(oneProfiles[0].id).not.toBe(twoProfiles[0].id);

  const oneLibrary = await libraryRows(request, tokenOne);
  const twoLibrary = await libraryRows(request, tokenTwo);
  expect(oneLibrary).toHaveLength(1);
  expect(oneLibrary[0].book_id).toBe(book.id);
  expect(oneLibrary[0].progress_percent).toBe(25);
  expect(twoLibrary).toHaveLength(0);

  const oneHighlights = await highlightRows(request, tokenOne);
  const twoHighlights = await highlightRows(request, tokenTwo);
  expect(oneHighlights).toHaveLength(1);
  expect(twoHighlights).toHaveLength(1);
  expect(oneHighlights[0].note).toBe("User one private lifecycle note");
  expect(twoHighlights[0].note).toBe("User two private lifecycle note");
  expect(oneHighlights[0].id).not.toBe(twoHighlights[0].id);

  const deniedCrossUserUpdate = await request.patch(
    `${supabaseUrl}/rest/v1/user_library?id=eq.${oneLibrary[0].id}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${tokenTwo}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data: { progress_percent: 99 },
    },
  );
  expect([200, 204]).toContain(deniedCrossUserUpdate.status());
  if (deniedCrossUserUpdate.status() === 200) {
    expect(await deniedCrossUserUpdate.json()).toEqual([]);
  }

  const oneLibraryAfter = await libraryRows(request, tokenOne);
  expect(oneLibraryAfter).toHaveLength(1);
  expect(oneLibraryAfter[0].progress_percent).toBe(25);
});
