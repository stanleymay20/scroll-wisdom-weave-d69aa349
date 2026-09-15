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

// randomUUID rather than Math.random: this suffix keys the throwaway account
// email and both certificate numbers, so CodeQL reads it as randomness in a
// security context. A 6-character base36 slice is also genuinely collision-
// prone for concurrent GA runs.
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = `ga-account-delete-${suffix}@example.test`;
const password = "GaDeleteContract123!";
const bookTitle = "GA Account Deletion Certificate Book";
const publishingNumber = `GA-PUB-${suffix}`;
const competencyNumber = `GA-COMP-${suffix}`;

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "GA Account Delete", accepted_terms: true },
});
if (createError) throw createError;
if (!created.user?.id) throw new Error("Deletion fixture user was not created");
const userId = created.user.id;

const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
if (!sessionData.session?.access_token) throw new Error("Deletion fixture did not receive an access token");
const accessToken = sessionData.session.access_token;

const { data: book, error: bookError } = await admin
  .from("books")
  .insert({
    title: bookTitle,
    description: "Disposable account-deletion lifecycle fixture.",
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
  })
  .select("id")
  .single();
if (bookError) throw bookError;
if (!book?.id) throw new Error("Deletion fixture book was not created");

const { error: publishingError } = await admin.from("publishing_certificates").insert({
  book_id: book.id,
  user_id: userId,
  certificate_number: publishingNumber,
  metadata: {
    integrityScore: 1,
    recipientName: "GA Account Delete",
  },
});
if (publishingError) throw publishingError;

const { error: competencyError } = await admin.from("competency_certificates").insert({
  book_id: book.id,
  user_id: userId,
  certificate_number: competencyNumber,
  metadata: { recipientName: "GA Account Delete" },
});
if (competencyError) throw competencyError;

const deletionResponse = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: "{}",
});
const deletionBody = await deletionResponse.json().catch(() => ({}));
if (!deletionResponse.ok || deletionBody?.success !== true) {
  throw new Error(
    `delete-account failed (${deletionResponse.status}): ${JSON.stringify(deletionBody)}`,
  );
}

const { data: deletedUserData, error: deletedUserError } = await admin.auth.admin.getUserById(userId);
if (!deletedUserError && deletedUserData?.user) {
  throw new Error("Auth user still exists after delete-account reported success");
}

const { data: tokenUser, error: tokenUserError } = await authClient.auth.getUser(accessToken);
if (!tokenUserError || tokenUser?.user) {
  throw new Error("Auth server still resolves the deleted account from its old access token");
}

const { data: remainingBooks, error: remainingBooksError } = await admin
  .from("books")
  .select("id")
  .eq("id", book.id);
if (remainingBooksError) throw remainingBooksError;
if ((remainingBooks ?? []).length !== 0) throw new Error("Owned book survived account deletion");

const { data: publishingCert, error: publishingReadError } = await admin
  .from("publishing_certificates")
  .select("book_id,user_id,revoked_at,revoked_reason,metadata")
  .eq("certificate_number", publishingNumber)
  .single();
if (publishingReadError) throw publishingReadError;
if (!publishingCert.revoked_at || publishingCert.revoked_reason !== "Account Deleted") {
  throw new Error("Publishing certificate was not retained as Account Deleted/revoked");
}
if (publishingCert.book_id !== null || publishingCert.user_id !== null) {
  throw new Error("Publishing certificate retained a deleted book/account relationship");
}
if (publishingCert.metadata?.bookTitle !== bookTitle) {
  throw new Error("Publishing certificate lost its immutable book title metadata");
}

const { data: competencyCert, error: competencyReadError } = await admin
  .from("competency_certificates")
  .select("book_id,user_id,revoked_at,revoked_reason,metadata")
  .eq("certificate_number", competencyNumber)
  .single();
if (competencyReadError) throw competencyReadError;
if (!competencyCert.revoked_at || competencyCert.revoked_reason !== "Account Deleted") {
  throw new Error("Competency certificate was not retained as Account Deleted/revoked");
}
if (competencyCert.book_id !== null || competencyCert.user_id !== null) {
  throw new Error("Competency certificate retained a deleted book/account relationship");
}
if (competencyCert.metadata?.bookTitle !== bookTitle) {
  throw new Error("Competency certificate lost its immutable book title metadata");
}

for (const certificateNumber of [publishingNumber, competencyNumber]) {
  const verificationResponse = await fetch(
    `${supabaseUrl}/functions/v1/verify-certificate?number=${encodeURIComponent(certificateNumber)}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    },
  );
  const verification = await verificationResponse.json().catch(() => ({}));
  if (!verificationResponse.ok) {
    throw new Error(
      `verify-certificate failed for retained credential (${verificationResponse.status}): ${JSON.stringify(verification)}`,
    );
  }
  if (verification.valid !== false || verification.revoked !== true) {
    throw new Error(`Retained credential did not verify as revoked: ${JSON.stringify(verification)}`);
  }
  if (verification.revokedReason !== "Account Deleted") {
    throw new Error(`Retained credential lost account-deletion reason: ${JSON.stringify(verification)}`);
  }
  if (verification.book?.title !== bookTitle) {
    throw new Error(`Retained credential lost book identity: ${JSON.stringify(verification)}`);
  }
}

console.log("Account deletion lifecycle passed: auth/data removed and both certificate families remain revoked + verifiable.");
