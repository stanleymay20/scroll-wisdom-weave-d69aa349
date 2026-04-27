import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  preflight,
  json,
  serverError,
  requireUser,
  enforceRateLimit,
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

    // Account deletion is irreversible — strict limit.
    const limited = enforceRateLimit({
      name: "delete-account",
      key: auth.userId,
      limit: 3,
      windowSec: 3600,
    });
    if (limited) return limited;

    const userId = auth.userId;
    console.log(`[delete-account] processing deletion`, { userId });

    const adminClient = serviceClient();

    // Step 1: revoke certificates (keep rows for verifiability).
    const { error: revokeError } = await adminClient
      .from("publishing_certificates")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: "Account deleted by user",
      })
      .eq("user_id", userId);

    if (revokeError) {
      console.error("[delete-account] certificate revocation error", revokeError);
    }

    const userIdTables = [
      "learner_concept_states",
      "quiz_question_history",
      "spaced_repetition_cards",
      "learning_progress",
      "competency_progress",
      "competency_profile",
      "competency_certificates",
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

    // Step 2: delete book-scoped data first.
    const { data: userBooks } = await adminClient
      .from("books")
      .select("id")
      .or(`creator_id.eq.${userId},user_id.eq.${userId}`);

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
        if (error) console.error(`[delete-account] error deleting ${table}`, error);
      }
      const { error: booksErr } = await adminClient.from("books").delete().in("id", bookIds);
      if (booksErr) console.error("[delete-account] error deleting books", booksErr);
    }

    // Step 3: delete user-scoped tables.
    for (const table of userIdTables) {
      const { error } = await adminClient.from(table).delete().eq("user_id", userId);
      if (error) console.error(`[delete-account] error deleting ${table}`, error);
    }

    console.log("[delete-account] data wiped", { userId });

    // Step 4: delete the auth user itself.
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
