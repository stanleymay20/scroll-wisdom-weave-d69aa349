import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { preflight, json, badRequest, serviceClient, enforceRateLimit } from "../_shared/http.ts";
import { parseScrollIdentifier } from "../_shared/scroll-identity.ts";

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip") || "public";
}

function safeSnapshot(snapshot: Record<string, unknown>) {
  const publisher = snapshot.publisher && typeof snapshot.publisher === "object" && !Array.isArray(snapshot.publisher)
    ? snapshot.publisher as Record<string, unknown>
    : null;
  return {
    title: typeof snapshot.title === "string" ? snapshot.title : null,
    subtitle: typeof snapshot.subtitle === "string" ? snapshot.subtitle : null,
    language: typeof snapshot.language === "string" ? snapshot.language : null,
    edition: typeof snapshot.edition === "string" ? snapshot.edition : null,
    publisher: publisher
      ? {
          publisherName: typeof publisher.publisher_name === "string" ? publisher.publisher_name : null,
          imprintName: typeof publisher.imprint_name === "string" ? publisher.imprint_name : null,
          countryCode: typeof publisher.country_code === "string" ? publisher.country_code : null,
        }
      : null,
    authors: Array.isArray(snapshot.authors)
      ? snapshot.authors.map((author) => {
          const row = author && typeof author === "object" && !Array.isArray(author) ? author as Record<string, unknown> : {};
          return {
            displayName: typeof row.display_name === "string" ? row.display_name : null,
            role: typeof row.author_role === "string" ? row.author_role : null,
          };
        }).filter((author) => author.displayName)
      : [],
  };
}

async function publicationPayload(sc: ReturnType<typeof serviceClient>, publicationId: string) {
  const { data: publication, error } = await sc
    .from("publications")
    .select("id,work_id,book_id,scroll_edition_id,status,version,published_at,content_hash,snapshot")
    .eq("id", publicationId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!publication) return null;

  const { data: work, error: workErr } = await sc
    .from("works")
    .select("id,scroll_work_id")
    .eq("id", publication.work_id)
    .maybeSingle();
  if (workErr) throw workErr;
  if (!work) return null;

  const { data: products, error: productErr } = await sc
    .from("publication_products")
    .select("id,scroll_product_id,product_form")
    .eq("publication_id", publication.id)
    .order("product_form");
  if (productErr) throw productErr;

  const productIds = (products ?? []).map((product) => product.id);
  const identifiersByProduct = new Map<string, Array<Record<string, unknown>>>();
  if (productIds.length > 0) {
    const { data: external, error: externalErr } = await sc
      .from("publication_external_identifiers")
      .select("product_id,scheme,value,authority,source,authoritative")
      .in("product_id", productIds)
      .order("scheme");
    if (externalErr) throw externalErr;
    for (const row of external ?? []) {
      const list = identifiersByProduct.get(row.product_id) ?? [];
      list.push({
        scheme: row.scheme,
        value: row.value,
        authority: row.authority,
        source: row.source,
        authoritative: row.authoritative,
      });
      identifiersByProduct.set(row.product_id, list);
    }
  }

  return {
    scrollWorkId: work.scroll_work_id,
    scrollEditionId: publication.scroll_edition_id,
    publicationId: publication.id,
    version: publication.version,
    publishedAt: publication.published_at,
    contentHash: publication.content_hash,
    bibliographic: safeSnapshot((publication.snapshot ?? {}) as Record<string, unknown>),
    products: (products ?? []).map((product) => ({
      scrollProductId: product.scroll_product_id,
      productForm: product.product_form,
      externalIdentifiers: identifiersByProduct.get(product.id) ?? [],
    })),
  };
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "GET, OPTIONS" });

  const rate = enforceRateLimit({ name: "resolve-scroll-id", key: clientKey(req), limit: 120, windowSec: 60 });
  if (rate) return rate;

  const raw = new URL(req.url).searchParams.get("id") ?? "";
  const parsed = parseScrollIdentifier(raw);
  if (!parsed) return badRequest("A valid SLW, SLE or SLP ScrollLibrary identifier is required");

  try {
    const sc = serviceClient();
    let publicationId: string | null = null;

    if (parsed.kind === "SLW") {
      const { data: work, error } = await sc
        .from("works")
        .select("current_publication_id")
        .eq("scroll_work_id", raw.trim().toUpperCase())
        .maybeSingle();
      if (error) throw error;
      publicationId = work?.current_publication_id ?? null;
    } else if (parsed.kind === "SLE") {
      const { data: publication, error } = await sc
        .from("publications")
        .select("id")
        .eq("scroll_edition_id", raw.trim().toUpperCase())
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      publicationId = publication?.id ?? null;
    } else {
      const { data: product, error } = await sc
        .from("publication_products")
        .select("publication_id")
        .eq("scroll_product_id", raw.trim().toUpperCase())
        .maybeSingle();
      if (error) throw error;
      publicationId = product?.publication_id ?? null;
    }

    if (!publicationId) return json({ error: "NOT_FOUND" }, 404);
    const resolved = await publicationPayload(sc, publicationId);
    if (!resolved) return json({ error: "NOT_FOUND" }, 404);

    return json({
      identifier: raw.trim().toUpperCase(),
      kind: parsed.kind,
      authority: "ScrollLibrary",
      standard: "ScrollLibrary proprietary identifier",
      isIsbn: false,
      ...resolved,
    }, 200, { "Cache-Control": "public, max-age=300" });
  } catch (_error) {
    return json({ error: "RESOLUTION_FAILED" }, 500);
  }
});
