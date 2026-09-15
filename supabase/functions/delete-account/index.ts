import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  preflight,
  json,
  serverError,
  requireUser,
  enforceDurableRateLimit,
  serviceClient,
} from "../_shared/http.ts";

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return json({ error: "Method not allowed" }, 405);
    }

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const adminClient = serviceClient();

    // Account deletion is irreversible — strict, durable limit across edge instances.
    const limited = await enforceDurableRateLimit(adminClient, {
      name: "delete-account",
      key: auth.userId,
      limit: 3,
      windowSec: 3600,
    });
    if (limited) return limited;

    const userId = auth.userId;
    const revokedAt = new Date().toISOString();
    const revokedReason = "Account Deleted";
    console.log(`[delete-account] processing deletion`, { userId });

    // Step 1: revoke certificates before removing books/account data. These
    // records are intentionally retained for public verification integrity.
    const { error: publishingRevokeError } = await adminClient
      .from("publishing_certificates")
      .update({ revoked_at: revokedAt, revoked_reason: revokedReason })
      .eq("user_id", userId);

    if (publishingRevokeError) {
      console.error("[delete-account] publishing certificate revocation error", publishingRevokeError);
      return json(
        {
          error: "Account deletion could not safely revoke existing certificates. Please contact support.",
          code: "certificate_revoke_failed",
        },
        500,
      );
    }

    const { error: competencyRevokeError } = await adminClient
      .from("competency_certificates")
      .update({ revoked_at: revokedAt, revoked_reason: revokedReason, user_id: null })
      .eq("user_id", userId);

    if (competencyRevokeError) {
      console.error("[delete-account] competency certificate revocation error", competencyRevokeError);
      return json(
        {
          error: "Account deletion could not safely revoke existing certificates. Please contact support.",
          code: "certificate_revoke_failed",
        },
        500,
      );
    }

    const cleanupFailures: string[] = [];
    const userIdTables = [
      "learner_concept_states",
      "quiz_question_history",
      "spaced_repetition_cards",
      "learning_progress",
      "competency_progress",
      "competency_profile",
      "reading_sessions",
      "reading_streaks",
      "reading_goals",
      "saved_learning_decks",
      "saved_decks",
      "highlights",
      "study_notes",
      "quiz_attempts",
      "assessment_integrity_logs",
      "bookmarks",
      "chapter_edit_sessions",
      "audit_telemetry",
      "pmf_events",
      "ai_usage_tracking",
      "user_roles",
      "profiles",
    ];

    // Step 2: delete book-scoped data first. Ownership must cover both the
    // historical creator_id authority and the newer user_id compatibility key.
    const { data: userBooks, error: userBooksError } = await adminClient
      .from("books")
      .select("id")
      .or(`creator_id.eq.${userId},user_id.eq.${userId}`);

    if (userBooksError) {
      console.error("[delete-account] error loading owned books", userBooksError);
      return json(
        {
          error: "Account deletion could not safely enumerate owned data. Please contact support.",
          code: "data_cleanup_failed",
        },
        500,
      );
    }

    if (userBooks && userBooks.length > 0) {
      const bookIds = userBooks.map((b: { id: string }) => b.id);
      const bookScopedTables = [
        "book_citations",
        "book_knowledge_graphs",
        "concept_edges",
        "concept_nodes",
        "book_audits",
        "book_collaborators",
        "chapters",
        "content_reports",
      ];
      for (const table of bookScopedTables) {
        const { error } = await adminClient.from(table).delete().in("book_id", bookIds);
        if (error) {
          cleanupFailures.push(table);
          console.error(`[delete-account] error deleting ${table}`, error);
        }
      }
      const { error: booksErr } = await adminClient.from("books").delete().in("id", bookIds);
      if (booksErr) {
        cleanupFailures.push("books");
        console.error("[delete-account] error deleting books", booksErr);
      }
    }

    // Step 3: delete user-scoped personal data. Certificate tables are
    // deliberately excluded because Step 1 converted them to retained revoked
    // audit records.
    for (const table of userIdTables) {
      const { error } = await adminClient.from(table).delete().eq("user_id", userId);
      if (error) {
        cleanupFailures.push(table);
        console.error(`[delete-account] error deleting ${table}`, error);
      }
    }

    if (cleanupFailures.length > 0) {
      console.error("[delete-account] refusing success after cleanup failures", {
        userId,
        tables: cleanupFailures,
      });
      return json(
        {
          error: "Account deletion could not safely remove all personal data. Please contact support.",
          code: "data_cleanup_failed",
        },
        500,
      );
    }

    console.log("[delete-account] personal data wiped and certificates revoked", { userId });

    // Step 4: delete the auth user itself. Publishing certificate user_id is
    // detached via ON DELETE SET NULL; competency certificate user_id was
    // already cleared above. Supabase also invalidates refresh sessions here.
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error("[delete-account] auth deletion error", deleteUserError);
      return json(
        { error: "Failed to delete account. Please contact support.", code: "auth_delete_failed" },
        500,
      );
    }

    console.log("[delete-account] account fully deleted", { userId });

    return json({
      success: true,
      message:
        "Your account has been permanently deleted. Certificates have been revoked but remain verifiable for audit purposes.",
    });
  } catch (err) {
    console.error("[delete-account] unexpected error", err);
    return serverError(err);
  }
});
