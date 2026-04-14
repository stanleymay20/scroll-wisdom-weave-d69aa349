import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trackKey, prompt, duration } = await req.json();

    if (!trackKey || !prompt) {
      return new Response(JSON.stringify({ error: "trackKey and prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenlabsKey = Deno.env.get("ELEVENLABS_API_KEY_1") || Deno.env.get("ELEVENLABS_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if track already exists in storage
    const { data: existing } = await supabase
      .from("study_music_tracks")
      .select("storage_path, status")
      .eq("track_key", trackKey)
      .single();

    if (existing?.storage_path && existing.status === "ready") {
      const { data: urlData } = supabase.storage
        .from("study-music")
        .getPublicUrl(existing.storage_path);

      return new Response(JSON.stringify({ url: urlData.publicUrl, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!elevenlabsKey) {
      return new Response(JSON.stringify({ error: "ElevenLabs API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as generating
    await supabase.from("study_music_tracks").upsert({
      track_key: trackKey,
      label: trackKey,
      prompt,
      status: "generating",
      duration_seconds: duration || 120,
    }, { onConflict: "track_key" });

    // Generate music via ElevenLabs
    console.log(`[StudyMusic] Generating: ${trackKey} — "${prompt.substring(0, 80)}..."`);
    
    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": elevenlabsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        duration_seconds: duration || 120,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[StudyMusic] ElevenLabs error: ${response.status}`, errText);
      
      await supabase.from("study_music_tracks")
        .update({ status: "error" })
        .eq("track_key", trackKey);

      return new Response(JSON.stringify({ error: "Music generation failed", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBuffer = await response.arrayBuffer();
    const storagePath = `${trackKey}.mp3`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("study-music")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error(`[StudyMusic] Upload error:`, uploadError);
      return new Response(JSON.stringify({ error: "Failed to cache track" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update record
    await supabase.from("study_music_tracks").upsert({
      track_key: trackKey,
      label: trackKey,
      prompt,
      storage_path: storagePath,
      status: "ready",
      duration_seconds: duration || 120,
    }, { onConflict: "track_key" });

    const { data: urlData } = supabase.storage
      .from("study-music")
      .getPublicUrl(storagePath);

    console.log(`[StudyMusic] ✅ Track ready: ${trackKey}`);

    return new Response(JSON.stringify({ url: urlData.publicUrl, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[StudyMusic] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
