// ScrollVision: evidence-grounded media retrieval
// Pulls real, openly-licensed images from Wikimedia Commons + The Met Museum,
// caches them in scrollvision_assets, and links them to a chapter.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (s: string, d?: unknown) =>
  console.log(`[scrollvision] ${s}${d ? " " + JSON.stringify(d) : ""}`);

// ── Entity extraction via Lovable AI (cheap, fast) ──────────────────────
async function extractEntities(text: string, title?: string): Promise<string[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return [];

  const prompt = `Extract 3-6 high-value visual entities from this educational text — proper nouns of people, places, civilizations, monuments, artifacts, events, technologies — that would benefit from a real historical image. Return ONLY a JSON array of short strings, no prose.
Title: ${title ?? ""}
Text:
${text.slice(0, 4000)}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      log("entity extract failed", { status: r.status });
      return [];
    }
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, 6) : [];
  } catch (e) {
    log("entity extract error", { e: String(e) });
    return [];
  }
}

// ── Wikimedia Commons search (no key) ───────────────────────────────────
type Candidate = {
  source: "wikimedia" | "met_museum";
  source_id: string;
  source_url: string;
  image_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  license?: string;
  attribution?: string;
  width?: number;
  height?: number;
  entity: string;
  query: string;
  relevance_score: number;
};

async function searchWikimedia(entity: string, limit = 3): Promise<Candidate[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${entity} filetype:bitmap`,
      gsrlimit: String(limit),
      gsrnamespace: "6",
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "1024",
      origin: "*",
    });

  try {
    const r = await fetch(url, { headers: { "User-Agent": "ScrollLibrary/1.0 (educational)" } });
    if (!r.ok) return [];
    const j = await r.json();
    const pages = j?.query?.pages ?? {};
    const out: Candidate[] = [];
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      const ii = p.imageinfo?.[0];
      if (!ii?.url) continue;
      const meta = ii.extmetadata ?? {};
      const license = meta.LicenseShortName?.value || meta.License?.value || "Unknown";
      const artist = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
      const credit = (meta.Credit?.value ?? "").replace(/<[^>]+>/g, "").trim();
      out.push({
        source: "wikimedia",
        source_id: String(p.pageid),
        source_url: `https://commons.wikimedia.org/?curid=${p.pageid}`,
        image_url: ii.thumburl || ii.url,
        thumbnail_url: ii.thumburl,
        title: p.title?.replace(/^File:/, ""),
        description: meta.ImageDescription?.value?.replace(/<[^>]+>/g, "").slice(0, 500),
        license,
        attribution: [artist, credit].filter(Boolean).join(" — ") || "Wikimedia Commons",
        width: ii.thumbwidth || ii.width,
        height: ii.thumbheight || ii.height,
        entity,
        query: entity,
        relevance_score: 0.7,
      });
    }
    return out;
  } catch (e) {
    log("wikimedia error", { e: String(e), entity });
    return [];
  }
}

// ── Met Museum Open Access (no key) ─────────────────────────────────────
async function searchMet(entity: string, limit = 2): Promise<Candidate[]> {
  try {
    const sUrl =
      "https://collectionapi.metmuseum.org/public/collection/v1/search?" +
      new URLSearchParams({ hasImages: "true", q: entity });
    const sr = await fetch(sUrl);
    if (!sr.ok) return [];
    const sj = await sr.json();
    const ids: number[] = (sj.objectIDs ?? []).slice(0, limit);
    const out: Candidate[] = [];
    for (const id of ids) {
      const or = await fetch(
        `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
      );
      if (!or.ok) continue;
      const o = await or.json();
      if (!o.primaryImage && !o.primaryImageSmall) continue;
      out.push({
        source: "met_museum",
        source_id: String(o.objectID),
        source_url: o.objectURL,
        image_url: o.primaryImage || o.primaryImageSmall,
        thumbnail_url: o.primaryImageSmall,
        title: o.title,
        description: [o.culture, o.period, o.objectDate, o.medium]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 500),
        license: o.isPublicDomain ? "Public Domain (CC0)" : "Met Museum Open Access",
        attribution: `${o.artistDisplayName || "Unknown"} — The Metropolitan Museum of Art`,
        entity,
        query: entity,
        relevance_score: o.isPublicDomain ? 0.85 : 0.75,
      });
    }
    return out;
  } catch (e) {
    log("met error", { e: String(e), entity });
    return [];
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "invalid_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      bookId,
      chapterId,
      title,
      content,
      entities: providedEntities,
      maxAssets = 6,
    } = body ?? {};

    if (!bookId || !chapterId || (!content && !providedEntities)) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Entities
    let entities: string[] = Array.isArray(providedEntities) ? providedEntities : [];
    if (entities.length === 0 && content) {
      entities = await extractEntities(content, title);
    }
    log("entities", { entities });

    if (entities.length === 0) {
      return new Response(
        JSON.stringify({ success: true, entities: [], assets: [], note: "no_entities" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Retrieve in parallel per entity
    const allCandidates: Candidate[] = [];
    await Promise.all(
      entities.map(async (e) => {
        const [w, m] = await Promise.all([searchWikimedia(e, 3), searchMet(e, 2)]);
        allCandidates.push(...w, ...m);
      }),
    );

    // 3. Rank: prefer public domain, larger images, met before wikimedia stubs
    allCandidates.sort((a, b) => {
      const ap = (a.license?.includes("Public Domain") || a.license?.includes("CC0")) ? 0.1 : 0;
      const bp = (b.license?.includes("Public Domain") || b.license?.includes("CC0")) ? 0.1 : 0;
      return (b.relevance_score + bp) - (a.relevance_score + ap);
    });

    const picked = allCandidates.slice(0, maxAssets);

    // 4. Upsert into cache + chapter link
    const linkedAssets: Array<{ id: string; entity: string }> = [];
    for (let i = 0; i < picked.length; i++) {
      const c = picked[i];
      const hash = await sha256(`${c.source}|${c.source_id}|${c.image_url}`);

      const { data: existing } = await supabase
        .from("scrollvision_assets")
        .select("id")
        .eq("content_hash", hash)
        .maybeSingle();

      let assetId = existing?.id;
      if (!assetId) {
        const { data: ins, error: insErr } = await supabase
          .from("scrollvision_assets")
          .insert({
            source: c.source,
            source_id: c.source_id,
            source_url: c.source_url,
            image_url: c.image_url,
            thumbnail_url: c.thumbnail_url,
            title: c.title,
            description: c.description,
            license: c.license,
            attribution: c.attribution,
            entity: c.entity,
            query: c.query,
            content_hash: hash,
            width: c.width,
            height: c.height,
            relevance_score: c.relevance_score,
          })
          .select("id")
          .single();
        if (insErr) {
          log("asset insert error", { e: insErr.message });
          continue;
        }
        assetId = ins.id;
      }

      await supabase
        .from("scrollvision_chapter_assets")
        .upsert(
          {
            book_id: bookId,
            chapter_id: chapterId,
            asset_id: assetId,
            placement_order: i,
            entity: c.entity,
            caption: c.title ?? c.entity,
            is_active: true,
          },
          { onConflict: "chapter_id,asset_id" },
        );

      linkedAssets.push({ id: assetId, entity: c.entity });
    }

    return new Response(
      JSON.stringify({
        success: true,
        entities,
        candidates: allCandidates.length,
        linked: linkedAssets.length,
        assets: linkedAssets,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
