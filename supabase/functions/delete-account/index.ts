import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const tablesToDelete = [
      "highlights",
      "study_notes",
      "quiz_attempts",
      "assessment_integrity_logs",
      "mastery_attempts",
      "user_library",
      "chapters", // Delete chapters first (they reference books)
      "books",
      "data_export_requests",
      "tts_usage",
      "legal_consents",
      "user_roles",
      "profiles",
    ];

    for (const table of tablesToDelete) {
      let query;
      if (table === "chapters") {
        // Delete chapters where the book belongs to the user
        const { data: userBooks } = await adminClient
          .from("books")
          .select("id")
          .eq("creator_id", userId);
        
        if (userBooks && userBooks.length > 0) {
          const bookIds = userBooks.map(b => b.id);
          const { error } = await adminClient
            .from("chapters")
            .delete()
            .in("book_id", bookIds);
          if (error) console.error(`[delete-account] Error deleting ${table}:`, error);
        }
      } else if (table === "books") {
        const { error } = await adminClient
          .from(table)
          .delete()
          .eq("creator_id", userId);
        if (error) console.error(`[delete-account] Error deleting ${table}:`, error);
      } else {
        const { error } = await adminClient
          .from(table)
          .delete()
          .eq("user_id", userId);
        if (error) console.error(`[delete-account] Error deleting ${table}:`, error);
      }
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
