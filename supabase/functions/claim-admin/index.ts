import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CLAIM-ADMIN] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminClaimCode = Deno.env.get("ADMIN_CLAIM_CODE");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    // If no claim code is set, provide instruction
    if (!adminClaimCode) {
      logStep("No ADMIN_CLAIM_CODE set");
      return new Response(
        JSON.stringify({ 
          error: "Admin claim not configured. Set ADMIN_CLAIM_CODE secret first.",
          instructions: "Add ADMIN_CLAIM_CODE secret in your backend settings."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { code } = await req.json();
    logStep("Received claim request");

    if (code !== adminClaimCode) {
      logStep("Invalid claim code provided");
      return new Response(
        JSON.stringify({ error: "Invalid claim code" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Get authenticated user with manual JWT validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    
    // Use getClaims for JWT validation
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      logStep("JWT validation failed", { error: claimsError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    
    // Also get user data for email logging
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      logStep("User fetch failed", { error: userError?.message });
    }

    const userId = claimsData.claims.sub as string;
    logStep("User authenticated", { userId, email: userData?.user?.email });

    // Check if user already has admin role
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (existingRole) {
      logStep("User already admin");
      return new Response(
        JSON.stringify({ success: true, message: "Already admin" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Insert admin role
    const { error: insertError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });

    if (insertError) {
      logStep("Failed to insert admin role", { error: insertError.message });
      throw new Error(`Failed to grant admin: ${insertError.message}`);
    }

    logStep("Admin role granted successfully", { userId });

    return new Response(
      JSON.stringify({ success: true, message: "Admin access granted" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
