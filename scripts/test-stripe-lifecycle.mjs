/**
 * Stripe test-mode lifecycle: the money journeys, end to end, for real.
 *
 * Everything else in CI proves the money path in pieces — browser tests
 * against mocked responses, SQL tests against hand-written rows. None of it
 * shows that a stranger can pay ScrollLibrary and get what they paid for.
 * This does, against a disposable local Supabase stack and Stripe's real test
 * mode, with webhooks delivered by the Stripe CLI:
 *
 *   P03  subscribe → webhook → entitlement → duplicate-subscription guard →
 *        check-subscription → billing portal → cancel → revoked
 *   P14  buy a book → webhook → purchase + sale ledger → buyer can read it
 *   P15  partial refund → exact reversal → duplicate delivery changes nothing
 *        → refund the rest → purchase refunded → access revoked
 *   P16  Connect onboarding → account persisted → account.updated synced
 *
 * Usage:
 *   bun scripts/test-stripe-lifecycle.mjs catalogue   # print STRIPE_CATALOGUE_JSON
 *   bun scripts/test-stripe-lifecycle.mjs run         # run the journeys
 *
 * It refuses any key that is not a test-mode key.
 */
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const STRIPE_KEY = required("STRIPE_SECRET_KEY");
if (!/^(sk|rk)_test_/.test(STRIPE_KEY)) {
  // The single most important line in this file.
  throw new Error("Refusing to run: STRIPE_SECRET_KEY is not a Stripe test-mode key");
}

const EVIDENCE_DIR = process.env.STRIPE_LIFECYCLE_EVIDENCE_DIR || "stripe-lifecycle-evidence";

// ---------------------------------------------------------------------------
// Stripe REST, without adding the SDK as a dependency
// ---------------------------------------------------------------------------

function formEncode(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === "object") formEncode(item, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(item));
      });
    } else if (typeof value === "object") {
      formEncode(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

async function stripe(method, path, params) {
  const url = new URL(`https://api.stripe.com/v1${path}`);
  const init = { method, headers: { Authorization: `Bearer ${STRIPE_KEY}` } };
  if (method === "GET" && params) url.search = formEncode(params).toString();
  else if (params) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = formEncode(params).toString();
  }
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe ${method} ${path} failed (${response.status}): ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Test catalogue: created once per Stripe test account, then reused
// ---------------------------------------------------------------------------

const CATALOGUE_TIERS = {
  student: { name: "ScrollLibrary CI Creator", amount: 1900 },
  premium: { name: "ScrollLibrary CI Pro", amount: 6900 },
  prophet_tier: { name: "ScrollLibrary CI Teams", amount: 19900 },
  creator: { name: "ScrollLibrary CI Creator", amount: 900 },
  creator_pro: { name: "ScrollLibrary CI Creator Pro", amount: 2900 },
};

async function ensureTestCatalogue() {
  const prices = {};
  const products = {};
  for (const [tier, spec] of Object.entries(CATALOGUE_TIERS)) {
    const lookupKey = `scrolllibrary_ci_${tier}`;
    const found = await stripe("GET", "/prices", { lookup_keys: [lookupKey], active: "true", limit: 1 });
    let price = found.data?.[0];
    if (!price) {
      const product = await stripe("POST", "/products", {
        name: spec.name,
        metadata: { scrolllibrary_ci: "true", tier },
      });
      price = await stripe("POST", "/prices", {
        product: product.id,
        currency: "usd",
        unit_amount: spec.amount,
        recurring: { interval: "month" },
        lookup_key: lookupKey,
      });
    }
    prices[tier] = price.id;
    products[typeof price.product === "string" ? price.product : price.product.id] = tier;
  }
  return { prices, products };
}

if (process.argv[2] === "catalogue") {
  process.stdout.write(JSON.stringify(await ensureTestCatalogue()));
  process.exit(0);
}
if (process.argv[2] !== "run") {
  console.error("Usage: bun scripts/test-stripe-lifecycle.mjs <catalogue|run>");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const SUPABASE_URL = required("E2E_SUPABASE_URL");
const ANON_KEY = required("E2E_SUPABASE_ANON_KEY");
const SERVICE_KEY = required("E2E_SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = required("STRIPE_WEBHOOK_SECRET");
const CATALOGUE = JSON.parse(required("STRIPE_CATALOGUE_JSON"));
// Allowed return origins in create-checkout and create-book-checkout.
const APP_ORIGIN = "http://127.0.0.1:8080";

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions);

const runStartedAt = new Date();
const runTag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const results = [];
const ourStripeIds = new Set(); // customers, accounts, intents this run created
const cleanup = [];

mkdirSync(EVIDENCE_DIR, { recursive: true });

function check(condition, message, detail) {
  if (!condition) {
    const suffix = detail === undefined ? "" : ` — ${JSON.stringify(detail)}`;
    throw new Error(`${message}${suffix}`);
  }
}

async function waitFor(description, probe, { timeoutMs = 90_000, intervalMs = 1_500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for: ${description}`);
}

async function journey(id, title, body) {
  const started = Date.now();
  process.stdout.write(`\n▶ ${id} ${title}\n`);
  try {
    const evidence = await body();
    results.push({ id, title, status: "PASS", seconds: Math.round((Date.now() - started) / 1000), evidence });
    process.stdout.write(`✔ ${id} passed\n`);
  } catch (error) {
    results.push({ id, title, status: "FAIL", seconds: Math.round((Date.now() - started) / 1000), error: String(error?.message ?? error) });
    process.stdout.write(`✘ ${id} failed: ${error?.message ?? error}\n`);
  }
}

async function createUser(label) {
  const email = `stripe-ci-${label}-${runTag}@example.test`;
  // Random per run, for a user in a disposable database. Generated with no
  // literal around it: a `password = "..."` shape is what secret scanners
  // match, and GitGuardian flagged the prefixed form as a hardcoded password.
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `Stripe CI ${label}`, accepted_terms: true },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON_KEY, clientOptions);
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, token: session.session.access_token, client };
}

async function callFunction(name, user, body, extraHeaders = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Origin: APP_ORIGIN,
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: response.status, body: json };
}

let browser;
async function payOnHostedCheckout(url, successUrlPrefix, label) {
  browser ??= await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Checkout may list several payment methods; card is the one under test.
    const cardChoice = page.locator('[data-testid="card-accordion-item-button"]');
    if (await cardChoice.isVisible({ timeout: 8_000 }).catch(() => false)) await cardChoice.click();

    await page.locator("#cardNumber").fill("4242424242424242", { timeout: 30_000 });
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    const name = page.locator("#billingName");
    if (await name.isVisible().catch(() => false)) await name.fill("ScrollLibrary CI");
    const country = page.locator("#billingCountry");
    if (await country.isVisible().catch(() => false)) await country.selectOption("US");
    const postal = page.locator("#billingPostalCode");
    if (await postal.isVisible().catch(() => false)) await postal.fill("10001");

    await page.locator('[data-testid="hosted-payment-submit-button"], button.SubmitButton').first().click();
    // The success page is the app, which is not running here; only reaching
    // the URL matters, so wait for the navigation to commit and no further.
    await page.waitForURL((u) => u.href.startsWith(successUrlPrefix), { timeout: 90_000, waitUntil: "commit" });
  } catch (error) {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${label}-checkout-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}

async function readableChapterCount(user, bookId) {
  const { data, error } = await user.client.from("chapters").select("id").eq("book_id", bookId);
  if (error) throw error;
  return data.length;
}

/**
 * Every webhook event this run caused must have been fully processed.
 * Late events (an invoice.paid trailing its checkout) get a grace period;
 * anything still not "processed" after it is a handler that failed.
 */
async function assertOurEventsProcessed() {
  const snapshot = async () => {
    const { data, error } = await admin
      .from("stripe_webhook_events")
      .select("stripe_event_id,event_type,status,payload")
      .gte("received_at", runStartedAt.toISOString());
    if (error) throw error;
    const ours = data.filter((row) => {
      const text = JSON.stringify(row.payload ?? {});
      return [...ourStripeIds].some((id) => text.includes(id));
    });
    return { ours, unprocessed: ours.filter((row) => row.status !== "processed") };
  };
  let last = await snapshot();
  const deadline = Date.now() + 60_000;
  while (last.unprocessed.length && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    last = await snapshot();
  }
  check(last.ours.length > 0, "no webhook events from this run were recorded at all");
  check(last.unprocessed.length === 0, "webhook events from this run did not finish processing",
    last.unprocessed.map((r) => ({ id: r.stripe_event_id, type: r.event_type, status: r.status })));
  return { events: last.ours.length, types: [...new Set(last.ours.map((r) => r.event_type))].sort() };
}

async function billingCustomerOf(userId) {
  const { data } = await admin.from("billing_customer_links").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  return data?.stripe_customer_id ?? null;
}

// ---------------------------------------------------------------------------
// P03 — subscriptions
// ---------------------------------------------------------------------------

async function subscribe(user, tier, label) {
  const started = await callFunction("create-checkout", user, { tier });
  check(started.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(started.body.url ?? ""),
    `create-checkout did not return a Stripe Checkout URL for ${tier}`, started);

  const retry = await callFunction("create-checkout", user, { tier });
  check(retry.status === 200 && retry.body.reused === true && retry.body.url === started.body.url,
    "same-tier retry did not reuse the open Checkout Session", retry);

  const alternateTier = tier === "student" ? "premium" : "student";
  const conflicting = await callFunction("create-checkout", user, { tier: alternateTier });
  check(conflicting.status === 409 && conflicting.body.code === "checkout_in_progress",
    "a second plan Checkout Session was allowed before the first completed", conflicting);

  await payOnHostedCheckout(started.body.url, `${APP_ORIGIN}/pricing?success=true`, label);
  const customer = await waitFor(`billing customer for ${label}`, () => billingCustomerOf(user.id), { timeoutMs: 30_000 });
  ourStripeIds.add(customer);
  cleanup.push(() => stripe("DELETE", `/customers/${customer}`));
  return customer;
}

await journey("P03", "Subscribe → entitlement → check-subscription → portal → cancel", async () => {
  const user = await createUser("subscriber");
  const customer = await subscribe(user, "premium", "p03-premium");

  const sub = await waitFor("premium subscription row from the webhook", async () => {
    const { data } = await admin.from("subscriptions").select("tier,status,current_period_end,stripe_subscription_id")
      .eq("user_id", user.id).maybeSingle();
    return data?.status === "active" && data.tier === "premium" ? data : null;
  });
  check(sub.current_period_end && new Date(sub.current_period_end) > new Date(),
    "subscription stored without a future period end (Stripe basil moved it to the item)", sub);
  const { data: profile } = await admin.from("profiles").select("plan").eq("user_id", user.id).maybeSingle();
  check(profile?.plan === "premium", "profile plan was not upgraded", profile);

  const status = await callFunction("check-subscription", user, {});
  check(status.body.subscribed === true && status.body.tier === "premium" && status.body.subscription_end,
    "check-subscription does not report the paid subscription", status.body);

  const duplicate = await callFunction("create-checkout", user, { tier: "premium" });
  check(duplicate.status === 409 && duplicate.body.code === "existing_plan_subscription",
    "same-plan checkout did not fail closed against a duplicate recurring charge", duplicate);

  const crossTier = await callFunction("create-checkout", user, { tier: "student" });
  check(crossTier.status === 409 && crossTier.body.code === "plan_change_required",
    "cross-tier checkout did not require management of the existing subscription", crossTier);

  const retiredPublisher = await callFunction("create-checkout", user, { tier: "creator" });
  check(retiredPublisher.status === 400 && retiredPublisher.body.code === "tier_not_publicly_sold",
    "legacy publisher tier is still publicly sellable", retiredPublisher);

  const portal = await callFunction("customer-portal", user, {});
  check(portal.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(portal.body.url ?? ""),
    "customer-portal did not return a Stripe billing portal URL", portal);

  await stripe("DELETE", `/subscriptions/${sub.stripe_subscription_id}`);
  await waitFor("plan revoked after cancellation", async () => {
    const { data } = await admin.from("profiles").select("plan").eq("user_id", user.id).maybeSingle();
    return data?.plan === "free";
  });
  const after = await callFunction("check-subscription", user, {});
  check(after.body.subscribed === false, "check-subscription still reports a cancelled subscription", after.body);

  return { customer, subscription: sub.stripe_subscription_id, period_end: sub.current_period_end };
});

// ---------------------------------------------------------------------------
// P14 + P15 — buy a book, then refund it in two parts
// ---------------------------------------------------------------------------

const PRICE_CENTS = 999;
const PARTIAL_CENTS = 300;
// Chapter 1 is the free sample: the "Sample chapters viewable via public
// listing" policy lets anyone read chapters up to sample_chapters. So access
// is measured against that window, not against zero.
const SAMPLE_CHAPTERS = 1;
const TOTAL_CHAPTERS = 2;
let sale; // shared by P14 → P15

await journey("P14", "Buy a book → purchase + sale ledger → buyer can read it", async () => {
  const seller = await createUser("seller");
  const buyer = await createUser("buyer");

  const { data: book, error: bookError } = await admin.from("books").insert({
    title: `Stripe CI Book ${runTag}`,
    description: "Disposable Stripe lifecycle fixture.",
    category: "technology",
    author_ai_agent: "ScrollLibrary CI",
    total_chapters: TOTAL_CHAPTERS,
    is_published: false,
    is_featured: false,
    creator_id: seller.id,
    user_id: seller.id,
    language: "en",
    book_type: "text",
    source_type: "generated",
  }).select("id").single();
  if (bookError) throw bookError;
  const chapterNumbers = Array.from({ length: TOTAL_CHAPTERS }, (_, i) => i + 1);
  const { error: chapterError } = await admin.from("chapters").insert(chapterNumbers.map((n) => ({
    book_id: book.id, chapter_number: n, title: `Chapter ${n}`, is_generated: true,
    content: `Chapter ${n} of a disposable book used to prove that paying unlocks reading.`,
  })));
  if (chapterError) throw chapterError;
  const slug = `stripe-ci-${runTag}`;
  const { data: listing, error: listingError } = await admin.from("public_listings").insert({
    book_id: book.id, slug, is_public: true, price_cents: PRICE_CENTS, currency: "usd", sample_chapters: SAMPLE_CHAPTERS,
  }).select("id").single();
  if (listingError) throw listingError;

  const beforePurchase = await readableChapterCount(buyer, book.id);
  check(beforePurchase === SAMPLE_CHAPTERS, "before paying, the buyer should read exactly the free sample", { beforePurchase });

  const started = await callFunction("create-book-checkout", buyer, { listing_id: listing.id },
    { "x-idempotency-key": `ci-${runTag}` });
  check(started.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(started.body.url ?? ""),
    "create-book-checkout did not return a Stripe Checkout URL", started);
  await payOnHostedCheckout(started.body.url, `${APP_ORIGIN}/store/${slug}/success`, "p14-book");

  const purchase = await waitFor("paid purchase from the webhook", async () => {
    const { data } = await admin.from("book_purchases")
      .select("id,status,amount_cents,currency,stripe_payment_intent")
      .eq("buyer_user_id", buyer.id).eq("book_id", book.id).maybeSingle();
    return data?.status === "paid" ? data : null;
  });
  check(purchase.amount_cents === PRICE_CENTS && purchase.currency === "usd", "purchase amount is wrong", purchase);
  check(purchase.stripe_payment_intent?.startsWith("pi_"), "purchase has no payment intent to refund against", purchase);
  ourStripeIds.add(purchase.stripe_payment_intent);
  const customer = await billingCustomerOf(buyer.id);
  if (customer) {
    ourStripeIds.add(customer);
    cleanup.push(() => stripe("DELETE", `/customers/${customer}`));
  }

  const { data: ledger } = await admin.from("creator_earnings_ledger")
    .select("entry_type,gross_cents,creator_user_id").eq("purchase_id", purchase.id);
  check(ledger.length === 1 && ledger[0].entry_type === "sale" && ledger[0].gross_cents === PRICE_CENTS
    && ledger[0].creator_user_id === seller.id, "sale ledger is not exactly one sale for the seller", ledger);

  const afterPurchase = await readableChapterCount(buyer, book.id);
  check(afterPurchase === TOTAL_CHAPTERS, "buyer cannot read the whole book they paid for", { afterPurchase });

  sale = { buyer, bookId: book.id, purchaseId: purchase.id, paymentIntent: purchase.stripe_payment_intent };
  return { purchase: purchase.id, payment_intent: purchase.stripe_payment_intent, ledger_rows: ledger.length };
});

function signStripePayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function refundRows(purchaseId) {
  const { data, error } = await admin.from("creator_earnings_ledger")
    .select("entry_type,gross_cents,source_event_id").eq("purchase_id", purchaseId).eq("entry_type", "refund");
  if (error) throw error;
  return data;
}

await journey("P15", "Partial refund → exact reversal → duplicate is a no-op → full refund revokes access", async () => {
  check(sale, "P15 needs the purchase from P14, which did not complete");

  const partial = await stripe("POST", "/refunds", { payment_intent: sale.paymentIntent, amount: PARTIAL_CENTS });
  ourStripeIds.add(partial.id);
  const afterPartial = await waitFor("partial refund ledger row", async () => {
    const rows = await refundRows(sale.purchaseId);
    return rows.some((r) => r.source_event_id === partial.id) ? rows : null;
  });
  check(afterPartial.length === 1 && afterPartial[0].gross_cents === -PARTIAL_CENTS,
    "partial refund was not reversed exactly once for its amount", afterPartial);
  const { data: stillPaid } = await admin.from("book_purchases").select("status").eq("id", sale.purchaseId).single();
  check(stillPaid.status === "paid", "a partial refund revoked the purchase", stillPaid);
  check(await readableChapterCount(sale.buyer, sale.bookId) === TOTAL_CHAPTERS, "a partial refund revoked reading access");

  // Stripe delivers at least once. Replay the refund event exactly as Stripe
  // would — same id, validly signed — and prove the ledger does not move.
  const events = await stripe("GET", "/events", { type: "refund.created", created: { gte: Math.floor(runStartedAt.getTime() / 1000) - 60 }, limit: 100 });
  const refundEvent = events.data.find((e) => e.data?.object?.id === partial.id);
  check(refundEvent, "Stripe has no refund.created event for the partial refund");
  const payload = JSON.stringify(refundEvent);
  const replay = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signStripePayload(payload) },
    body: payload,
  });
  check(replay.ok, "duplicate delivery was not acknowledged", { status: replay.status });
  const afterReplay = await refundRows(sale.purchaseId);
  check(afterReplay.length === 1, "duplicate delivery wrote a second refund", afterReplay);

  const rest = await stripe("POST", "/refunds", { payment_intent: sale.paymentIntent });
  ourStripeIds.add(rest.id);
  check(rest.amount === PRICE_CENTS - PARTIAL_CENTS, "Stripe's remaining refundable amount is unexpected", { amount: rest.amount });
  await waitFor("purchase marked refunded", async () => {
    const { data } = await admin.from("book_purchases").select("status").eq("id", sale.purchaseId).single();
    return data?.status === "refunded";
  });
  const { data: all } = await admin.from("creator_earnings_ledger").select("gross_cents").eq("purchase_id", sale.purchaseId);
  const net = all.reduce((sum, row) => sum + row.gross_cents, 0);
  check(net === 0, "sale and refunds do not net to zero", { rows: all, net });
  const afterRefund = await readableChapterCount(sale.buyer, sale.bookId);
  check(afterRefund === SAMPLE_CHAPTERS, "after a full refund the buyer should be back to the free sample", { afterRefund });

  return { partial_refund: partial.id, final_refund: rest.id, ledger_rows: all.length, net_cents: net };
});

// ---------------------------------------------------------------------------
// P16 — creator payouts via Stripe Connect
// ---------------------------------------------------------------------------

await journey("P16", "Connect onboarding → account persisted → account.updated synced", async () => {
  const creator = await createUser("payee");
  const started = await callFunction("stripe-connect-onboarding", creator, { action: "start", return_path: "/payout-profile" });
  if (started.status >= 500) {
    throw new Error("stripe-connect-onboarding failed. If Stripe Connect is not enabled on this test account, enable it in the Stripe dashboard (test mode) and re-run.");
  }
  check(started.status === 200 && /^https:\/\/connect\.stripe\.com\//.test(started.body.onboarding_url ?? ""),
    "onboarding did not return a Stripe-hosted onboarding link", started.body);
  check(!JSON.stringify(started.body).includes("acct_"), "the Connect account id leaked to the browser", started.body);

  const { data: profile } = await admin.from("creator_payout_profiles")
    .select("stripe_connect_account_id,stripe_connect_status").eq("user_id", creator.id).single();
  check(profile.stripe_connect_account_id?.startsWith("acct_"), "Connect account id was not persisted", profile);
  const account = profile.stripe_connect_account_id;
  ourStripeIds.add(account);
  cleanup.push(() => stripe("DELETE", `/accounts/${account}`));

  // Any platform-side change makes Stripe emit account.updated to Connect
  // endpoints; the handler must match it to the stored account.
  await stripe("POST", `/accounts/${account}`, { metadata: { scrolllibrary_ci_touch: runTag } });
  const event = await waitFor("account.updated processed by the webhook", async () => {
    const { data } = await admin.from("stripe_webhook_events").select("stripe_event_id,status,payload")
      .eq("event_type", "account.updated").gte("received_at", runStartedAt.toISOString());
    return data?.find((row) => JSON.stringify(row.payload ?? {}).includes(account) && row.status === "processed") ?? null;
  });
  const { data: synced } = await admin.from("creator_payout_profiles")
    .select("stripe_connect_status,payout_method").eq("user_id", creator.id).single();
  check(["pending", "restricted"].includes(synced.stripe_connect_status),
    "an unfinished Express account must not read as payable", synced);
  return { account_status: synced.stripe_connect_status, event: event.stripe_event_id };
});

await journey("EVT", "Every webhook event this run caused finished processing", assertOurEventsProcessed);

// ---------------------------------------------------------------------------

await browser?.close();
for (const undo of cleanup.reverse()) await undo().catch((e) => console.warn(`cleanup: ${e.message}`));

const summary = {
  ran_at: runStartedAt.toISOString(),
  stripe_mode: "test",
  catalogue_prices: CATALOGUE.prices,
  results,
};
writeFileSync(`${EVIDENCE_DIR}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);

console.log("\nStripe test-mode lifecycle:");
for (const r of results) console.log(`  ${r.status === "PASS" ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.title} (${r.seconds}s)${r.error ? `\n        ${r.error}` : ""}`);
if (results.some((r) => r.status !== "PASS")) process.exit(1);
