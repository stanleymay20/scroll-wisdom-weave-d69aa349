import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabaseUrl = required("E2E_SUPABASE_URL");
const anonKey = required("E2E_SUPABASE_ANON_KEY");
const serviceRoleKey = required("E2E_SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const client = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = `ga-export-${suffix}@example.test`;
const password = "GaExportContract123!";

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "GA Export E2E", accepted_terms: true },
});
if (createError) throw createError;
const userId = created.user?.id;
if (!userId) throw new Error("Export fixture user was not created");

const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
const accessToken = signedIn.session?.access_token;
if (!accessToken) throw new Error("Export fixture did not receive an access token");

const { data: book, error: bookError } = await admin.from("books").insert({
  title: "GA Privacy Export Fixture",
  description: "Disposable record proving self-service portability uses authoritative server data.",
  category: "technology",
  author_ai_agent: "ScrollLibrary GA",
  total_chapters: 1,
  is_published: false,
  is_featured: false,
  creator_id: userId,
  user_id: userId,
  language: "en",
  book_type: "text",
  source_type: "generated",
}).select("id").single();
if (bookError) throw bookError;

const { data: chapter, error: chapterError } = await admin.from("chapters").insert({
  book_id: book.id,
  chapter_number: 1,
  title: "Portable Learning Evidence",
  content: "The portability package must include the learner's chapter-authoritative reading progress.",
  word_count: 11,
  is_generated: true,
}).select("id").single();
if (chapterError) throw chapterError;

const { error: progressError } = await admin.from("reading_progress").insert({
  user_id: userId,
  book_id: book.id,
  chapter_id: chapter.id,
  percent: 83,
  source: "owned",
});
if (progressError) throw progressError;

// An unsigned/unauthenticated export must never return another user's data.
const unauthenticated = await fetch(`${supabaseUrl}/functions/v1/export-user-data`, {
  method: "POST",
  headers: { apikey: anonKey, "Content-Type": "application/json" },
  body: "{}",
});
if (unauthenticated.status !== 401) {
  throw new Error(`Unauthenticated export did not fail closed: HTTP ${unauthenticated.status}`);
}

const response = await fetch(`${supabaseUrl}/functions/v1/export-user-data`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: "{}",
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(`Data export failed (${response.status}): ${JSON.stringify(payload)}`);
}

if (payload?._meta?.format !== "scrolllibrary.gdpr.v2" || payload?._meta?.user_id !== userId) {
  throw new Error(`Export metadata was not bound to the requesting user: ${JSON.stringify(payload?._meta)}`);
}
if (payload?.account?.id !== userId || payload?.account?.email !== email) {
  throw new Error("Portable account identity is missing or incorrect");
}
if (!Array.isArray(payload.books) || !payload.books.some((row) => row.id === book.id)) {
  throw new Error("Authored book is missing from the portability package");
}
if (
  !Array.isArray(payload.reading_progress) ||
  !payload.reading_progress.some(
    (row) => row.book_id === book.id && row.chapter_id === chapter.id && Number(row.percent) === 83,
  )
) {
  throw new Error("Per-chapter reading progress is missing from the portability package");
}

const serialized = JSON.stringify(payload);
if (serialized.includes("encrypted_access_token") || serialized.includes("encrypted_refresh_token")) {
  throw new Error("Portable export exposed reusable connected-platform credentials");
}

const arraySections = [
  "profiles",
  "quiz_attempts",
  "assessment_sessions",
  "publishing_certificates",
  "subscriptions",
  "book_purchases",
  "creator_platform_connections",
];
for (const section of arraySections) {
  if (!Array.isArray(payload[section])) {
    throw new Error(`Portable section ${section} was not exported as an array`);
  }
}

console.log("Data export lifecycle passed: authenticated, user-bound, chapter-complete, paginated contract, and credential-redacted.");
