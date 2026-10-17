// Exact-head Stripe qualification for the commercial gaps not covered by
// test-stripe-lifecycle.mjs: Creator/Pro monthly+annual catalogue authority,
// an annual paid subscription, and a real one-time usage order with refund
// reversal. Test mode only; never accepts a live Stripe key.
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const STRIPE_KEY = required("STRIPE_SECRET_KEY");
if (!/^(sk|rk)_test_/.test(STRIPE_KEY)) {
  throw new Error("Refusing to run: STRIPE_SECRET_KEY is not a Stripe test-mode key");
}

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

const PLAN_SPECS = {
  student: { name: "ScrollLibrary CI Creator", monthly: 1900, annual: 19000 },
  premium: { name: "ScrollLibrary CI Pro", monthly: 6900, annual: 69000 },
  prophet_tier: { name: "ScrollLibrary CI Teams", monthly: 19900, annual: 199000 },
};
const LEGACY_SPECS = {
  creator: { name: "ScrollLibrary CI Legacy Creator", monthly: 900 },
  creator_pro: { name: "ScrollLibrary CI Legacy Creator Pro", monthly: 2900 },
};

async function findPrice(lookupKey) {
  const found = await stripe("GET", "/prices", { lookup_keys: [lookupKey], active: "true", limit: 1 });
  return found.data?.[0] ?? null;
}

async function ensureRecurringPrice({ lookupKey, name, amount, interval, productId = null, metadata = {} }) {
  let price = await findPrice(lookupKey);
  if (price) return price;
  let product = productId;
  if (!product) {
    const created = await stripe("POST", "/products", { name, metadata: { scrolllibrary_ci: "true", ...metadata } });
    product = created.id;
  }
  return stripe("POST", "/prices", {
    product,
    currency: "usd",
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
  });
}

async function ensureOneTimePrice() {
  const lookupKey = "scrolllibrary_ci_ai_text_250k";
  let price = await findPrice(lookupKey);
  if (!price) {
    const product = await stripe("POST", "/products", {
      name: "ScrollLibrary CI +250k AI text words",
      metadata: { scrolllibrary_ci: "true", sku: "ai_text_250k" },
    });
    price = await stripe("POST", "/prices", {
      product: product.id,
      currency: "usd",
      unit_amount: 1500,
      lookup_key: lookupKey,
    });
  }
  return price;
}

async function ensureCommercialCatalogue() {
  const prices = {};
  const annualPrices = {};
  const products = {};

  for (const [tier, spec] of Object.entries(PLAN_SPECS)) {
    const monthly = await ensureRecurringPrice({
      lookupKey: `scrolllibrary_ci_${tier}`,
      name: spec.name,
      amount: spec.monthly,
      interval: "month",
      metadata: { tier },
    });
    const monthlyProduct = typeof monthly.product === "string" ? monthly.product : monthly.product.id;
    prices[tier] = monthly.id;
    products[monthlyProduct] = tier;

    const annual = await ensureRecurringPrice({
      lookupKey: `scrolllibrary_ci_${tier}_annual`,
      name: spec.name,
      amount: spec.annual,
      interval: "year",
      productId: monthlyProduct,
      metadata: { tier },
    });
    const annualProduct = typeof annual.product === "string" ? annual.product : annual.product.id;
    annualPrices[tier] = annual.id;
    products[annualProduct] = tier;
  }

  for (const [tier, spec] of Object.entries(LEGACY_SPECS)) {
    const monthly = await ensureRecurringPrice({
      lookupKey: `scrolllibrary_ci_${tier}`,
      name: spec.name,
      amount: spec.monthly,
      interval: "month",
      metadata: { tier },
    });
    const product = typeof monthly.product === "string" ? monthly.product : monthly.product.id;
    prices[tier] = monthly.id;
    products[product] = tier;
  }

  const usagePrice = await ensureOneTimePrice();
  return {
    stripeCatalogue: { prices, annualPrices, products },
    oneTimeCatalogue: { ai_text_250k: usagePrice.id },
  };
}

if (process.argv[2] === "catalogue") {
  process.stdout.write(JSON.stringify(await ensureCommercialCatalogue()));
  process.exit(0);
}
if (process.argv[2] !== "run") {
  console.error("Usage: bun scripts/test-stripe-commercial-gaps.mjs <catalogue|run>");
  process.exit(2);
}

const SUPABASE_URL = required("E2E_SUPABASE_URL");
const ANON_KEY = required("E2E_SUPABASE_ANON_KEY");
const SERVICE_KEY = required("E2E_SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = required("STRIPE_WEBHOOK_SECRET");
const CATALOGUE = JSON.parse(required("STRIPE_CATALOGUE_JSON"));
const ONE_TIME = JSON.parse(required("STRIPE_ONE_TIME_CATALOGUE_JSON"));
const APP_ORIGIN = "http://127.0.0.1:8080";
const EVIDENCE_DIR = process.env.STRIPE_COMMERCIAL_GAPS_EVIDENCE_DIR || "stripe-commercial-gaps-evidence";
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions);
const runStartedAt = new Date();
const runTag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const results = [];
const ourStripeIds = new Set();
const cleanup = [];
let browser;
let annualState = null;
let usageState = null;

mkdirSync(EVIDENCE_DIR, { recursive: true });

const returnServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ScrollLibrary disposable commercial-gap return page");
});
await new Promise((resolve, reject) => {
  returnServer.once("error", reject);
  returnServer.listen(8080, "127.0.0.1", resolve);
});

function check(condition, message, detail) {
  if (!condition) throw new Error(detail === undefined ? message : `${message} — ${JSON.stringify(detail)}`);
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
    console.log(`✔ ${id} passed`);
  } catch (error) {
    results.push({ id, title, status: "FAIL", seconds: Math.round((Date.now() - started) / 1000), error: String(error?.message ?? error) });
    console.log(`✘ ${id} failed: ${error?.message ?? error}`);
  }
}

async function createUser(label) {
  const email = `stripe-gap-${label}-${runTag}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Stripe Gap ${label}`, accepted_terms: true },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON_KEY, clientOptions);
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, token: session.session.access_token, client };
}

async function callFunction(name, user, body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Origin: APP_ORIGIN,
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: response.status, body: json };
}

function checkoutSessionId(url) {
  return new URL(url).pathname.split("/").find((part) => part.startsWith("cs_test_")) ?? null;
}

async function billingCustomerOf(userId) {
  const { data, error } = await admin.from("billing_customer_links")
    .select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.stripe_customer_id ?? null;
}

async function payOnHostedCheckout(url, successPrefix, label) {
  browser ??= await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const cardChoice = page.locator('[data-testid="card-accordion-item-button"]');
    if (await cardChoice.isVisible({ timeout: 8_000 }).catch(() => false)) await cardChoice.click();
    await page.locator("#cardNumber").fill("4242424242424242", { timeout: 30_000 });
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    const name = page.locator("#billingName");
    if (await name.isVisible().catch(() => false)) await name.fill("ScrollLibrary CI");
    const country = page.locator("#billingCountry");
    if (await country.isVisible().catch(() => false)) await country.selectOption("US");
    const address = page.locator("#billingAddressLine1");
    if (await address.isVisible().catch(() => false)) {
      await address.fill("123 Test Street");
      // Stripe Checkout can render either address autocomplete or plain manual
      // fields depending on account/session/UI rollout. The suggestion is a
      // convenience, not a payment invariant, so use it when present and fall
      // through to the explicit city/state/postal fields when it is absent.
      const suggestion = page.getByText(/^123 Test St(?:reet)?\b/i).first();
      // Playwright Locator.isVisible() is an immediate probe: its timeout does
      // NOT wait for asynchronous Google address results. Wait for the actual
      // suggestion before clicking or the Checkout submit stays blocked behind
      // the still-open address menu.
      try {
        await suggestion.waitFor({ state: "visible", timeout: 8_000 });
        await suggestion.click();
      } catch (error) {
        if (error?.name !== "TimeoutError") throw error;
        // Google autocomplete can be absent. Dismiss the optional popup and
        // complete the visible manual billing fields below.
        await address.press("Escape");
        await address.press("Tab");
      }
    }
    const city = page.getByPlaceholder("City", { exact: true });
    if (await city.isVisible().catch(() => false) && !(await city.inputValue())) await city.fill("New York");
    const state = page.locator("#billingAdministrativeArea");
    if (await state.isVisible().catch(() => false) && !(await state.inputValue())) await state.selectOption("NY");
    const postal = page.locator("#billingPostalCode");
    if (await postal.isVisible().catch(() => false) && !(await postal.inputValue())) await postal.fill("10001");
    const save = page.getByRole("checkbox", { name: /Save my information for faster checkout/i });
    if (await save.isVisible().catch(() => false)) await save.uncheck();
    const terms = page.getByRole("checkbox", { name: /ScrollLibrary Terms/i });
    if (await terms.isVisible().catch(() => false)) await terms.check();
    const submit = page.locator('[data-testid="hosted-payment-submit-button"], button.SubmitButton').first();
    await submit.click();
    try {
      await page.waitForURL((u) => u.href.startsWith(successPrefix), { timeout: 15_000, waitUntil: "commit" });
    } catch (error) {
      const id = checkoutSessionId(url);
      if (error.name !== "TimeoutError" || !id || new URL(page.url()).hostname !== "checkout.stripe.com"
          || !(await submit.isVisible()) || !(await submit.isEnabled())
          || await page.locator('[role="alert"]:visible').count()) throw error;
      const session = await stripe("GET", `/checkout/sessions/${id}`);
      if (session.status !== "open" || session.payment_status === "paid") throw error;
      await submit.click();
      await page.waitForURL((u) => u.href.startsWith(successPrefix), { timeout: 75_000, waitUntil: "commit" });
    }
  } catch (error) {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${label}-checkout-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}

function signStripePayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function usageExtra(userId, month) {
  const { data, error } = await admin.from("billing_usage_monthly")
    .select("extra_ai_text_words").eq("user_id", userId).eq("month", month).maybeSingle();
  if (error) throw error;
  return Number(data?.extra_ai_text_words ?? 0);
}

async function assertOurEventsProcessed() {
  const snapshot = async () => {
    const { data, error } = await admin.from("stripe_webhook_events")
      .select("stripe_event_id,event_type,status,payload")
      .gte("received_at", runStartedAt.toISOString());
    if (error) throw error;
    const ours = data.filter((row) => {
      const text = JSON.stringify(row.payload ?? {});
      return [...ourStripeIds].some((id) => text.includes(id));
    });
    return { ours, unprocessed: ours.filter((row) => row.status !== "processed") };
  };
  const final = await waitFor("all commercial-gap Stripe events processed", async () => {
    const current = await snapshot();
    return current.ours.length > 0 && current.unprocessed.length === 0 ? current : null;
  });
  return { event_count: final.ours.length, event_types: [...new Set(final.ours.map((row) => row.event_type))].sort() };
}

await journey("G01", "Creator/Pro monthly + annual catalogue and checkout authority", async () => {
  const matrix = [
    ["student", "monthly", 1900, "month"],
    ["student", "annual", 19000, "year"],
    ["premium", "monthly", 6900, "month"],
    ["premium", "annual", 69000, "year"],
  ];
  const checked = [];
  for (const [tier, billingInterval, amount, stripeInterval] of matrix) {
    const priceId = billingInterval === "annual" ? CATALOGUE.annualPrices?.[tier] : CATALOGUE.prices?.[tier];
    check(priceId?.startsWith("price_"), `missing ${tier} ${billingInterval} price`, { priceId });
    const price = await stripe("GET", `/prices/${priceId}`);
    const product = typeof price.product === "string" ? price.product : price.product?.id;
    check(price.active && price.type === "recurring" && price.unit_amount === amount && price.currency === "usd"
      && price.recurring?.interval === stripeInterval && price.recurring?.interval_count === 1
      && CATALOGUE.products?.[product] === tier,
    `catalogue mismatch for ${tier} ${billingInterval}`, { price: price.id, product, amount: price.unit_amount, interval: price.recurring?.interval });

    const user = await createUser(`matrix-${tier}-${billingInterval}`);
    const started = await callFunction("create-checkout", user, { tier, billingInterval });
    check(started.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(started.body.url ?? ""),
      `create-checkout rejected ${tier} ${billingInterval}`, started);
    const sessionId = checkoutSessionId(started.body.url);
    check(sessionId, "checkout URL has no test session id");
    const session = await stripe("GET", `/checkout/sessions/${sessionId}`);
    check(session.mode === "subscription" && session.metadata?.tier === tier
      && session.metadata?.billingInterval === billingInterval,
    "Checkout metadata does not preserve authoritative tier/interval", session.metadata);
    await stripe("POST", `/checkout/sessions/${sessionId}/expire`);
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (customer) cleanup.push(() => stripe("DELETE", `/customers/${customer}`));
    checked.push({ tier, billingInterval, price: price.id, product });
  }
  return { checked };
});

await journey("G02", "Creator annual payment → entitlement → annual period", async () => {
  const user = await createUser("creator-annual");
  const started = await callFunction("create-checkout", user, { tier: "student", billingInterval: "annual" });
  check(started.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(started.body.url ?? ""),
    "annual Creator checkout did not start", started);
  await payOnHostedCheckout(started.body.url, `${APP_ORIGIN}/pricing?success=true`, "g02-creator-annual");

  const customer = await waitFor("annual Creator billing customer", () => billingCustomerOf(user.id), { timeoutMs: 30_000 });
  ourStripeIds.add(customer);
  cleanup.push(() => stripe("DELETE", `/customers/${customer}`));
  const sub = await waitFor("annual Creator subscription row", async () => {
    const { data } = await admin.from("subscriptions")
      .select("tier,status,current_period_end,stripe_subscription_id")
      .eq("user_id", user.id).maybeSingle();
    return data?.status === "active" && data.tier === "student" ? data : null;
  });
  check(sub.stripe_subscription_id?.startsWith("sub_"), "annual subscription id missing", sub);
  ourStripeIds.add(sub.stripe_subscription_id);
  const remainingDays = (new Date(sub.current_period_end).getTime() - Date.now()) / 86_400_000;
  check(remainingDays > 300, "annual subscription period is not approximately annual", { current_period_end: sub.current_period_end, remainingDays });
  const status = await callFunction("check-subscription", user, {});
  check(status.status === 200 && status.body.subscribed === true && status.body.tier === "student",
    "annual Creator entitlement read-back failed", status);
  annualState = { user, customer, subscriptionId: sub.stripe_subscription_id };
  return { customer, subscription: sub.stripe_subscription_id, current_period_end: sub.current_period_end };
});

await journey("G03", "Usage order payment → +250k grant → full refund reversal → replay idempotency", async () => {
  check(annualState, "G03 requires the annual paid subscription from G02");
  const usagePriceId = ONE_TIME.ai_text_250k;
  check(usagePriceId?.startsWith("price_"), "usage catalogue has no ai_text_250k price");
  const price = await stripe("GET", `/prices/${usagePriceId}`);
  check(price.active && price.type === "one_time" && price.unit_amount === 1500 && price.currency === "usd",
    "usage-pack Stripe price is not authoritative", { id: price.id, type: price.type, amount: price.unit_amount, currency: price.currency });

  const started = await callFunction("create-billing-order-checkout", annualState.user, { sku: "ai_text_250k" });
  check(started.status === 200 && started.body.order_id && /^https:\/\/checkout\.stripe\.com\//.test(started.body.url ?? ""),
    "usage-order checkout did not start", started);
  const retry = await callFunction("create-billing-order-checkout", annualState.user, { sku: "ai_text_250k" });
  check(retry.status === 200 && retry.body.reused === true && retry.body.url === started.body.url,
    "usage-order retry did not reuse the open Checkout Session", retry);

  const { data: pending } = await admin.from("billing_orders")
    .select("benefit_month").eq("id", started.body.order_id).single();
  const before = await usageExtra(annualState.user.id, pending.benefit_month);
  await payOnHostedCheckout(started.body.url, `${APP_ORIGIN}/pricing?order_success=true`, "g03-usage-order");

  const paid = await waitFor("paid usage billing order", async () => {
    const { data } = await admin.from("billing_orders")
      .select("id,status,expected_amount_cents,currency,stripe_payment_intent_id,benefit_month")
      .eq("id", started.body.order_id).maybeSingle();
    return data?.status === "paid" && data.stripe_payment_intent_id ? data : null;
  });
  check(paid.expected_amount_cents === 1500 && paid.currency === "usd", "usage order persisted wrong commercial authority", paid);
  ourStripeIds.add(paid.stripe_payment_intent_id);
  const granted = await waitFor("+250k AI text allowance", async () => {
    const current = await usageExtra(annualState.user.id, paid.benefit_month);
    return current === before + 250_000 ? current : null;
  });

  const refund = await stripe("POST", "/refunds", { payment_intent: paid.stripe_payment_intent_id });
  ourStripeIds.add(refund.id);
  await waitFor("usage order marked refunded", async () => {
    const { data } = await admin.from("billing_orders").select("status").eq("id", paid.id).single();
    return data?.status === "refunded";
  });
  const revoked = await waitFor("usage allowance refund reversal", async () => {
    const current = await usageExtra(annualState.user.id, paid.benefit_month);
    return current === before ? current : null;
  });
  const { data: refundRows } = await admin.from("billing_order_refunds")
    .select("stripe_refund_id,amount_cents").eq("billing_order_id", paid.id);
  check(refundRows.length === 1 && refundRows[0].stripe_refund_id === refund.id && refundRows[0].amount_cents === 1500,
    "usage refund was not recorded exactly once for the pre-tax subtotal", refundRows);

  const events = await stripe("GET", "/events", {
    type: "refund.created",
    created: { gte: Math.floor(runStartedAt.getTime() / 1000) - 60 },
    limit: 100,
  });
  const refundEvent = events.data.find((event) => event.data?.object?.id === refund.id);
  check(refundEvent, "Stripe has no refund.created event for the usage refund");
  const payload = JSON.stringify(refundEvent);
  const replay = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signStripePayload(payload) },
    body: payload,
  });
  check(replay.ok, "usage refund duplicate delivery was not acknowledged", { status: replay.status });
  const { data: afterReplay } = await admin.from("billing_order_refunds")
    .select("id").eq("billing_order_id", paid.id);
  check(afterReplay.length === 1, "duplicate usage refund wrote a second refund row", afterReplay);

  usageState = { order: paid.id, refund: refund.id };
  return { order: paid.id, payment_intent: paid.stripe_payment_intent_id, granted, revoked, refund: refund.id };
});

await journey("G04", "Annual cancellation revokes paid entitlement", async () => {
  check(annualState, "G04 requires G02");
  await stripe("DELETE", `/subscriptions/${annualState.subscriptionId}`);
  await waitFor("annual Creator plan revoked", async () => {
    const status = await callFunction("check-subscription", annualState.user, {});
    return status.status === 200 && status.body.subscribed === false;
  });
  return { subscription: annualState.subscriptionId, revoked: true };
});

await journey("EVT", "Every Stripe event caused by commercial-gap journeys finished processing", assertOurEventsProcessed);

try {
  // Journeys run above so their partial evidence is retained even if another one failed.
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => returnServer.close(resolve));
  for (const undo of cleanup.reverse()) await undo().catch((error) => console.warn(`cleanup: ${error.message}`));
}

const summary = {
  ran_at: runStartedAt.toISOString(),
  stripe_mode: "test",
  release_commit_sha: process.env.RELEASE_COMMIT_SHA ?? null,
  catalogue_prices: {
    creator_monthly: CATALOGUE.prices?.student ?? null,
    creator_annual: CATALOGUE.annualPrices?.student ?? null,
    pro_monthly: CATALOGUE.prices?.premium ?? null,
    pro_annual: CATALOGUE.annualPrices?.premium ?? null,
    usage_ai_text_250k: ONE_TIME.ai_text_250k ?? null,
  },
  results,
};
writeFileSync(`${EVIDENCE_DIR}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log("\nStripe commercial-gap lifecycle:");
for (const result of results) console.log(`  ${result.status.padEnd(4)} ${result.id.padEnd(4)} ${result.title}`);
if (results.some((result) => result.status !== "PASS")) process.exitCode = 1;
