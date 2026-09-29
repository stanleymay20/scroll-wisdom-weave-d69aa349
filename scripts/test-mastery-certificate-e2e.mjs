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
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = `ga-mastery-${suffix}@example.test`;
const password = `GaMastery-${randomUUID().replaceAll("-", "")}!`;

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "GA Mastery E2E", accepted_terms: true },
});
if (createError) throw createError;
if (!created.user?.id) throw new Error("Mastery fixture user was not created");
const userId = created.user.id;

const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
const accessToken = signedIn.session?.access_token;
if (!accessToken) throw new Error("Mastery fixture did not receive an access token");

const { data: book, error: bookError } = await admin.from("books").insert({
  title: "GA Mastery Certificate Lifecycle",
  description: "Disposable exact-backend fixture for authoritative assessment and credential verification.",
  category: "technology",
  author_ai_agent: "ScrollLibrary GA",
  total_chapters: 2,
  is_published: true,
  is_featured: false,
  creator_id: userId,
  user_id: userId,
  language: "en",
  book_type: "text",
  source_type: "generated",
}).select("id,title").single();
if (bookError) throw bookError;
if (!book?.id) throw new Error("Mastery fixture book was not created");

const { data: chapters, error: chapterError } = await admin.from("chapters").insert([
  {
    book_id: book.id,
    chapter_number: 1,
    title: "Authoritative Assessment",
    content: "ScrollLibrary scores assessment answers on the server and persists evidence that browser clients cannot forge.",
    word_count: 14,
    is_generated: true,
  },
  {
    book_id: book.id,
    chapter_number: 2,
    title: "Verifiable Credential",
    content: "A learning record binds reading, assessment, integrity, and the exact book state to a public verification result.",
    word_count: 17,
    is_generated: true,
  },
]).select("id,chapter_number").order("chapter_number");
if (chapterError) throw chapterError;
if (!chapters || chapters.length !== 2) throw new Error("Expected two mastery fixture chapters");

const { error: readingError } = await admin.from("reading_progress").insert(
  chapters.map((chapter) => ({
    user_id: userId,
    book_id: book.id,
    chapter_id: chapter.id,
    percent: 100,
  })),
);
if (readingError) throw readingError;

const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `fixture-q-${index + 1}`,
  tier: index < 2 ? 2 : index < 4 ? 3 : 4,
  bloomLevel: index < 2 ? "analyze" : index < 4 ? "evaluate" : "create",
  question: `Fixture reasoning question ${index + 1}`,
  options: ["Correct", "Distractor A", "Distractor B", "Distractor C"],
  correctIndex: 0,
  reasoningExplanation: "The deterministic fixture answer is Correct.",
}));

async function invokeAssessment(body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/assessment-session`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`assessment-session failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

for (const chapter of chapters) {
  // Seed only the provider-produced question manifest. Everything after this
  // point runs through the real authenticated assessment authority.
  const { data: session, error: sessionError } = await admin.from("assessment_sessions").insert({
    user_id: userId,
    book_id: book.id,
    chapter_id: chapter.id,
    mode: "mastery",
    questions,
    question_count: questions.length,
    tier_breakdown: { "1": 0, "2": 2, "3": 2, "4": 1 },
    coding_question_count: 0,
    assessment_contract_version: "ARC-1.0",
    assessment_contract_passed: true,
    manifest_hash: `ga-fixture-${chapter.id}`,
    started_at: new Date(Date.now() - 60_000).toISOString(),
  }).select("id").single();
  if (sessionError) throw sessionError;
  if (!session?.id) throw new Error("Assessment fixture session was not created");

  for (let i = 0; i < questions.length; i += 1) {
    const answer = await invokeAssessment({
      action: "answer",
      sessionId: session.id,
      questionIndex: i,
      selectedIndex: 0,
    });
    if (answer.correct !== true || answer.locked !== true) {
      throw new Error(`Server did not lock/score answer ${i}: ${JSON.stringify(answer)}`);
    }

    // The second answer must remain immutable and return the persisted result.
    if (i === 0) {
      const replay = await invokeAssessment({
        action: "answer",
        sessionId: session.id,
        questionIndex: i,
        selectedIndex: 1,
      });
      if (replay.correct !== true || replay.selectedIndex !== 0 || replay.locked !== true) {
        throw new Error(`Answer lock was bypassed: ${JSON.stringify(replay)}`);
      }
    }
  }

  const completed = await invokeAssessment({ action: "complete", sessionId: session.id });
  if (
    completed.success !== true ||
    completed.score !== 100 ||
    completed.integrityScore < 0.9 ||
    completed.integrityClassification !== "trusted" ||
    completed.assessmentContractPassed !== true
  ) {
    throw new Error(`Authoritative assessment completion failed: ${JSON.stringify(completed)}`);
  }
}

const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts")
  .select("chapter_id,score,assessment_session_id,assessment_contract_version,assessment_contract_passed")
  .eq("user_id", userId).eq("book_id", book.id);
if (attemptsError) throw attemptsError;
if (attempts?.length !== 2 || attempts.some((a) => Number(a.score) !== 100 || !a.assessment_contract_passed || !a.assessment_session_id)) {
  throw new Error(`Quiz evidence did not persist authoritatively: ${JSON.stringify(attempts)}`);
}

const { data: integrity, error: integrityError } = await admin.from("assessment_integrity_logs")
  .select("integrity_score,severity,details")
  .eq("user_id", userId).eq("book_id", book.id);
if (integrityError) throw integrityError;
if (
  integrity?.length !== 2 ||
  integrity.some((row) => Number(row.integrity_score) < 0.9 || row.severity !== "trusted" || row.details?.server_scored !== true)
) {
  throw new Error(`Trusted integrity evidence did not persist: ${JSON.stringify(integrity)}`);
}

const issueResponse = await fetch(`${supabaseUrl}/functions/v1/validate-certificate`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ bookId: book.id, requestedType: "mastery" }),
});
const issued = await issueResponse.json().catch(() => ({}));
if (!issueResponse.ok || issued.success !== true || issued.certificate?.certificateType !== "mastery") {
  throw new Error(`Mastery certificate issuance failed (${issueResponse.status}): ${JSON.stringify(issued)}`);
}
const certificateNumber = issued.certificate?.certificateNumber;
if (!certificateNumber) throw new Error("Certificate authority returned no certificate number");

async function verifyCertificate() {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/verify-certificate?number=${encodeURIComponent(certificateNumber)}`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const firstVerification = await verifyCertificate();
if (
  !firstVerification.response.ok ||
  firstVerification.payload.found !== true ||
  firstVerification.payload.valid !== true ||
  firstVerification.payload.status !== "valid" ||
  firstVerification.payload.provenance?.hashMatch !== true
) {
  throw new Error(`Public certificate did not verify as valid: ${JSON.stringify(firstVerification.payload)}`);
}

// Prove the public verifier is state-bound, not a static certificate lookup.
const { error: mutateError } = await admin.from("chapters")
  .update({ content: "The book changed after certificate issuance." })
  .eq("id", chapters[0].id);
if (mutateError) throw mutateError;

const changedVerification = await verifyCertificate();
if (
  !changedVerification.response.ok ||
  changedVerification.payload.valid !== false ||
  changedVerification.payload.status !== "invalid" ||
  changedVerification.payload.provenance?.hashMatch !== false
) {
  throw new Error(`Book mutation did not invalidate provenance: ${JSON.stringify(changedVerification.payload)}`);
}

console.log("Mastery lifecycle passed: locked answers, server scoring, trusted evidence, issuance, public verification, and provenance invalidation.");
