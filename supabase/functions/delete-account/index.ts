import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get user from auth token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log(`[delete-account] Processing deletion for user: ${userId}`);

    // Use service role for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Revoke all certificates (not delete - preserve verification integrity)
    const { error: revokeError } = await adminClient
      .from("publishing_certificates")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: "Account deleted by user",
      })
      .eq("user_id", userId);

    if (revokeError) {
      console.error("[delete-account] Certificate revocation error:", revokeError);
    } else {
      console.log("[delete-account] Certificates revoked successfully");
    }

    // Step 2: Delete user data from all tables (order matters for foreign keys)
    // Tables with user_id column
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

    // Delete book-related data first (chapters, citations, audits reference books)
    const { data: userBooks } = await adminClient
      .from("books")
      .select("id")
      .or(`creator_id.eq.${userId},user_id.eq.${userId}`);
    
    if (userBooks && userBooks.length > 0) {
      const bookIds = userBooks.map(b => b.id);
      // Delete book-scoped tables
      const bookScopedTables = [
        "book_citations", "book_knowledge_graphs", "concept_edges", "concept_nodes",
        "book_audits", "book_collaborators", "chapters", "content_reports",
      ];
      for (const table of bookScopedTables) {
        const { error } = await adminClient.from(table).delete().in("book_id", bookIds);
        if (error) console.error(`[delete-account] Error deleting ${table}:`, error);
      }
      // Delete books themselves
      const { error: booksErr } = await adminClient.from("books").delete().in("id", bookIds);
      if (booksErr) console.error("[delete-account] Error deleting books:", booksErr);
    }

    // Delete user_id-scoped tables
    for (const table of userIdTables) {
      const { error } = await adminClient
        .from(table)
        .delete()
        .eq("user_id", userId);
      if (error) console.error(`[delete-account] Error deleting ${table}:`, error);
    }

    console.log("[delete-account] User data deleted from all tables");

    // Step 3: Delete the auth user
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error("[delete-account] Error deleting auth user:", deleteUserError);
      return new Response(JSON.stringify({ 
        error: "Failed to delete account. Please contact support.",
        details: deleteUserError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[delete-account] Account fully deleted");

    return new Response(JSON.stringify({ 
      success: true,
      message: "Your account has been permanently deleted. Certificates have been revoked but remain verifiable for audit purposes."
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[delete-account] Unexpected error:", error);
    return new Response(JSON.stringify({ 
      error: "An unexpected error occurred",
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
