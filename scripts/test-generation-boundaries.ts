// Exercises the actual handler with a fake database boundary; never contacts an AI provider.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceDurableRateLimit } from "../supabase/functions/_shared/http.ts";
import type { BillingPlanTier } from "../supabase/functions/_shared/billing-plans.ts";
import {
  buildMaterialModelProvenance,
  floorSafeModelChain,
  getModelForPlan,
  getRewriteModelForPlan,
  mergeGenerationOutline,
  modelMeetsFloor,
  routeFloorModel,
  type GenerationRoute,
} from "../supabase/functions/_shared/generation-model-floor.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const bookId = "22222222-2222-4222-8222-222222222222";
let bookType = "text";
let generated = false;
let admin = false;
let gatewayCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("ai.gateway")) { gatewayCalls++; throw new Error("Provider access forbidden in boundary test"); }
  return realFetch(input, init);
}) as typeof fetch;

function query(table: string) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "in"]) q[method] = () => q;
  const result = () => ({ error: null, data:
    table === "user_roles" ? (admin ? [{ role: "admin" }] : []) :
    table === "subscriptions" ? { tier: "free", status: "active" } :
    table === "chapters" ? { id: "chapter", book_id: bookId, content: generated ? "A newer existing chapter" : "outline", is_generated: generated } :
    table === "books" ? { id: bookId, creator_id: userId, user_id: userId, book_type: bookType } : null });
  q.single = q.maybeSingle = () => Promise.resolve(result());
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return q;
}
const fakeClient = {
  auth: { getUser: () => Promise.resolve({ error: null, data: { user: { id: userId } } }) },
  from: query,
  rpc: () => Promise.resolve({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }),
};
(globalThis as unknown as { __auditClient: unknown }).__auditClient = fakeClient;
Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "disposable-audit-service-key");
Deno.env.set("GA_ADVANCED_AUTHORING_ENABLED", "false");
Deno.env.set("GA_SPECIALIZED_AUTHORING_ENABLED", "false");
Deno.env.set("GA_QUALIFIED_BOOK_TYPES", "");
Deno.env.set("PROVIDER_QUALIFICATION_BOOK_TYPES", "");

const entry = new URL("../supabase/functions/generate-chapter/index.ts", import.meta.url);
let source = await Deno.readTextFile(entry);
source = source.replace(/^import \{ serve \}[^\n]+\n/m, "")
  .replace(/^import \{ createClient \}[^\n]+\n/m, "const createClient = () => (globalThis as any).__auditClient;\n")
  .replace('serve(async (req) => {', 'export default async function(req: Request) {');
if (!source.trimEnd().endsWith("});")) throw new Error("Handler harness needs review after entrypoint change");
source = source.trimEnd().slice(0, -3) + "};\n";
source = source.replace(/(["'])\.\.\/_shared\//g, (_, quote) => quote + new URL("../supabase/functions/_shared/", import.meta.url).href);
const tmp = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tmp, source);
const { default: handle } = await import("file://" + tmp);
await Deno.remove(tmp);

function request(body: Record<string, unknown>, authenticated = true) {
  return new Request("https://example.test/generate-chapter", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer disposable-user-jwt" } : {}) },
    body: JSON.stringify(body),
  });
}

const PAID_PLANS: BillingPlanTier[] = ["student", "premium", "prophet_tier"];

Deno.test("routine generation keeps Free on Flash Lite and paid plans on Flash", () => {
  assertEquals(getModelForPlan("free"), "google/gemini-2.5-flash-lite");
  for (const plan of PAID_PLANS) {
    assertEquals(getModelForPlan(plan), "google/gemini-2.5-flash");
  }
});

Deno.test("Chief Editor keeps Free/Creator on Flash and Pro/Teams on Pro", () => {
  assertEquals(getRewriteModelForPlan("free"), "google/gemini-2.5-flash");
  assertEquals(getRewriteModelForPlan("student"), "google/gemini-2.5-flash");
  assertEquals(getRewriteModelForPlan("premium"), "google/gemini-2.5-pro");
  assertEquals(getRewriteModelForPlan("prophet_tier"), "google/gemini-2.5-pro");
});

Deno.test("floor-safe retry chains never downgrade the route", () => {
  const plans: BillingPlanTier[] = ["free", "student", "premium", "prophet_tier"];
  const routes: GenerationRoute[] = ["routine", "chief_editor"];
  for (const plan of plans) {
    for (const route of routes) {
      const floor = routeFloorModel(plan, route);
      const chain = floorSafeModelChain(plan, route);
      assertEquals(chain, [floor]);
      assert(chain.every((model) => modelMeetsFloor(model, floor)));
    }
  }
});

Deno.test("paid manuscript routes cannot include Flash Lite", () => {
  for (const plan of PAID_PLANS) {
    for (const route of ["routine", "chief_editor"] as const) {
      assertFalse(floorSafeModelChain(plan, route).includes("google/gemini-2.5-flash-lite"));
    }
  }
});

Deno.test("Pro and Teams Chief Editor cannot fall below Pro", () => {
  for (const plan of ["premium", "prophet_tier"] as const) {
    const chain = floorSafeModelChain(plan, "chief_editor");
    assertEquals(chain, ["google/gemini-2.5-pro"]);
    assert(chain.every((model) => modelMeetsFloor(model, "google/gemini-2.5-pro")));
  }
});

Deno.test("unknown models never satisfy a known floor", () => {
  assertFalse(modelMeetsFloor("unknown/provider-model", "google/gemini-2.5-flash"));
  assertFalse(modelMeetsFloor("google/gemini-2.5-flash", "unknown/provider-model"));
});

Deno.test("provenance records accepted material stages and preserves generation outline", () => {
  const provenance = buildMaterialModelProvenance({
    plan: "premium",
    route: "chief_editor",
    routeFloorModel: "google/gemini-2.5-pro",
    acceptedStages: [
      { stage: "generation", model: "google/gemini-2.5-pro" },
      { stage: "compression", model: "google/gemini-2.5-pro" },
    ],
    recordedAt: "2026-10-05T05:00:00.000Z",
  });
  assertEquals(provenance.finalMaterialModel, "google/gemini-2.5-pro");
  assertEquals(provenance.materialModelRoute, [
    { stage: "generation", model: "google/gemini-2.5-pro" },
    { stage: "compression", model: "google/gemini-2.5-pro" },
  ]);
  const merged = mergeGenerationOutline({
    description: "Existing outline description",
    keyTopics: ["one", "two"],
    futureField: { keep: true },
  }, provenance);
  assertEquals(merged.description, "Existing outline description");
  assertEquals(merged.keyTopics, ["one", "two"]);
  assertEquals(merged.futureField, { keep: true });
  assertEquals(merged.materialModelProvenance, provenance);
});

Deno.test("generation outline merge safely handles legacy non-object values", () => {
  const provenance = buildMaterialModelProvenance({
    plan: "free",
    route: "routine",
    routeFloorModel: "google/gemini-2.5-flash-lite",
    acceptedStages: [{ stage: "generation", model: "google/gemini-2.5-flash-lite" }],
  });
  assertEquals(mergeGenerationOutline(null, provenance).materialModelProvenance, provenance);
  assertEquals(mergeGenerationOutline([], provenance).materialModelProvenance, provenance);
  assertEquals(mergeGenerationOutline("legacy", provenance).materialModelProvenance, provenance);
});

Deno.test("anonymous OCR cannot call the gateway", async () => {
  const response = await handle(request({ ocrCheck: true, imageUrl: "https://example.test/image.png" }, false));
  assertEquals(response.status, 401); assertEquals(gatewayCalls, 0);
});
Deno.test("authenticated OCR is outside GA", async () => {
  const response = await handle(request({ ocrCheck: true, imageUrl: "https://example.test/image.png" }));
  assertEquals(response.status, 422); assertEquals(gatewayCalls, 0);
});
for (const type of ["academic", "technical", "reference", "professional", "bestseller", "workbook", "illustrated", "children", "comic", "fiction"]) {
  Deno.test(`persisted ${type} cannot bypass release gate with text payload`, async () => {
    bookType = type;
    const response = await handle(request({ chapterId: "chapter", bookType: "text" }));
    assertEquals(response.status, 422);
    assertEquals((await response.json()).code, "GA_BOOK_TYPE_NOT_QUALIFIED");
    assertEquals(gatewayCalls, 0);
    bookType = "text";
  });
}
Deno.test("legacy academic flag cannot route a text chapter into an unqualified pipeline", async () => {
  const response = await handle(request({ chapterId: "chapter", bookType: "text", academicMode: true }));
  assertEquals(response.status, 422); assertEquals((await response.json()).code, "GA_BOOK_TYPE_NOT_QUALIFIED");
  assertEquals(gatewayCalls, 0);
});
Deno.test("admin qualification allow-list does not authorize ordinary users", async () => {
  bookType = "technical"; Deno.env.set("PROVIDER_QUALIFICATION_BOOK_TYPES", "technical");
  const response = await handle(request({ chapterId: "chapter" }));
  assertEquals(response.status, 422); assertEquals(gatewayCalls, 0);
  bookType = "text"; Deno.env.set("PROVIDER_QUALIFICATION_BOOK_TYPES", "");
});
Deno.test("admin does not bypass empty qualification and public release lists", async () => {
  admin = true; bookType = "comic";
  const response = await handle(request({ chapterId: "chapter" }));
  assertEquals(response.status, 422); assertEquals(gatewayCalls, 0);
  admin = false; bookType = "text";
});
Deno.test("omitting regeneration flags cannot overwrite an existing chapter in GA", async () => {
  generated = true;
  const response = await handle(request({ chapterId: "chapter", isRegeneration: false }));
  assertEquals(response.status, 422); assertEquals(gatewayCalls, 0);
  generated = false;
});
Deno.test("caller rewrite marker cannot force a higher model in GA", async () => {
  const response = await handle(request({ chapterId: "chapter", editIntent: "[CHIEF_EDITOR_REWRITE] polish" }));
  assertEquals(response.status, 422); assertEquals(gatewayCalls, 0);
});
Deno.test("missing chapter cannot trigger paid generation", async () => {
  const response = await handle(request({ bookType: "comic" }));
  assertEquals(response.status, 404); assertEquals(gatewayCalls, 0);
});
Deno.test("durable limiter fails closed on database error, malformed row and exception", async () => {
  const opts = { name: "audit", key: userId, limit: 1, windowSec: 60 };
  for (const result of [{ error: { message: "secret database detail" }, data: null }, { error: null, data: null }, { error: null, data: [{}] }]) {
    const response = await enforceDurableRateLimit({ rpc: () => Promise.resolve(result) }, opts);
    assertEquals(response?.status, 503);
    assertEquals((await response!.text()).includes("secret database detail"), false);
  }
  const response = await enforceDurableRateLimit({ rpc: () => { throw new Error("db down"); } }, opts);
  assertEquals(response?.status, 503);
  assertEquals(await enforceDurableRateLimit({ rpc: () => Promise.resolve({ error: null, data: [{ allowed: true }] }) }, opts), null);
  assertEquals((await enforceDurableRateLimit({ rpc: () => Promise.resolve({ error: null, data: [{ allowed: false, retry_after_seconds: 10 }] }) }, opts))?.status, 429);
});