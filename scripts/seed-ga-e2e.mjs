import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabaseUrl = required("E2E_SUPABASE_URL");
const serviceRoleKey = required("E2E_SUPABASE_SERVICE_ROLE_KEY");
const userOneEmail = required("E2E_USER_ONE_EMAIL");
const userOnePassword = required("E2E_USER_ONE_PASSWORD");
const userTwoEmail = required("E2E_USER_TWO_EMAIL");
const userTwoPassword = required("E2E_USER_TWO_PASSWORD");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createConfirmedUser(email, password, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, accepted_terms: true },
  });

  if (error) throw error;
  if (!data.user?.id) throw new Error(`Supabase did not return an id for ${email}`);
  return data.user.id;
}

const userOneId = await createConfirmedUser(userOneEmail, userOnePassword, "GA E2E One");
const userTwoId = await createConfirmedUser(userTwoEmail, userTwoPassword, "GA E2E Two");
const month = new Date().toISOString().slice(0, 7);

const { error: usageError } = await admin.from("interactive_voice_usage").upsert([
  { user_id: userOneId, month, seconds_used: 11 },
  { user_id: userTwoId, month, seconds_used: 22 },
]);
if (usageError) throw usageError;

const lifecycleTitle = "GA E2E Lifecycle Book";
const { data: book, error: bookError } = await admin
  .from("books")
  .insert({
    title: lifecycleTitle,
    description: "A disposable ScrollLibrary lifecycle fixture used only inside isolated GA E2E.",
    category: "technology",
    author_ai_agent: "ScrollLibrary GA",
    total_chapters: 2,
    is_published: true,
    is_featured: false,
    creator_id: userOneId,
    user_id: userOneId,
    language: "en",
    book_type: "text",
    source_type: "generated",
  })
  .select("id,title")
  .single();
if (bookError) throw bookError;
if (!book?.id) throw new Error("Failed to seed lifecycle book");

const chapterFixtures = [
  {
    book_id: book.id,
    chapter_number: 1,
    title: "The Reader Contract",
    content: "## The Reader Contract\n\nScrollLibrary GA verifies that a real authenticated reader can open this chapter from a real library record.\n\nThe lifecycle fixture intentionally contains deterministic text so browser assertions remain stable.",
    word_count: 31,
    is_generated: true,
  },
  {
    book_id: book.id,
    chapter_number: 2,
    title: "The Persistence Contract",
    content: "## The Persistence Contract\n\nProgress, notes, highlights, and library ownership must remain isolated to the authenticated reader.",
    word_count: 18,
    is_generated: true,
  },
];

const { data: chapters, error: chapterError } = await admin
  .from("chapters")
  .insert(chapterFixtures)
  .select("id,chapter_number,title")
  .order("chapter_number");
if (chapterError) throw chapterError;
if (!chapters || chapters.length !== 2) throw new Error("Expected two lifecycle chapters");

const { error: libraryError } = await admin.from("user_library").insert({
  user_id: userOneId,
  book_id: book.id,
  last_read_chapter: 1,
  progress_percent: 25,
});
if (libraryError) throw libraryError;

const { error: highlightError } = await admin.from("highlights").insert([
  {
    user_id: userOneId,
    chapter_id: chapters[0].id,
    excerpt: "real authenticated reader",
    note: "User one private lifecycle note",
  },
  {
    user_id: userTwoId,
    chapter_id: chapters[0].id,
    excerpt: "authenticated reader",
    note: "User two private lifecycle note",
  },
]);
if (highlightError) throw highlightError;

const { data: rows, error: readError } = await admin
  .from("interactive_voice_usage")
  .select("user_id,month,seconds_used")
  .order("seconds_used");
if (readError) throw readError;
if (!rows || rows.length !== 2) {
  throw new Error(`Expected exactly two seeded voice rows, got ${rows?.length ?? 0}`);
}

console.log(`Seeded isolated GA E2E users, reader lifecycle fixture, and voice rows for ${month}.`);
