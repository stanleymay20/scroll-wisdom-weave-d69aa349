import { readFileSync } from "node:fs";

// Source-only billing architecture contract. Runs in ordinary CI without Stripe secrets.
const subscription = readFileSync("src/lib/subscription.ts", "utf8");
const pricing = readFileSync("src/pages/Pricing.tsx", "utf8");
const usageInsights = readFileSync("src/components/subscription/UsageInsightsPanel.tsx", "utf8");
const clientConfig = readFileSync("src/lib/config.ts", "utf8");
const seller = readFileSync("src/pages/Sell.tsx", "utf8");
const ownerControls = readFileSync("src/components/books/BookOwnerControls.tsx", "utf8");
const bookCheckout = readFileSync("supabase/functions/create-book-checkout/index.ts", "utf8");
const payoutSettlement = readFileSync("supabase/functions/settle-creator-payouts/index.ts", "utf8");
const checkout = readFileSync("supabase/functions/create-checkout/index.ts", "utf8");
const orderCheckout = readFileSync("supabase/functions/create-billing-order-checkout/index.ts", "utf8");
const orderCatalogue = readFileSync("supabase/functions/_shared/billing-order-catalogue.ts", "utf8");
const catalogue = readFileSync("supabase/functions/_shared/stripe-catalogue.ts", "utf8");
const serverPlans = readFileSync("supabase/functions/_shared/billing-plans.ts", "utf8");
const gaReleaseFlags = readFileSync("supabase/functions/_shared/ga-release-flags.ts", "utf8");
const voiceGate = readFileSync("supabase/functions/_shared/interactive-voice-gate.ts", "utf8");
const generation = readFileSync("supabase/functions/generate-chapter/index.ts", "utf8");
const images = readFileSync("supabase/functions/generate-image/index.ts", "utf8");
const tts = readFileSync("supabase/functions/text-to-speech/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260930231500_economic_billing_convergence.sql", "utf8");
const checkSubscription = readFileSync("supabase/functions/check-subscription/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const stripeFields = readFileSync("supabase/functions/_shared/stripe-fields.ts", "utf8");
const stripeFieldsTests = readFileSync("supabase/functions/_shared/stripe-fields_test.ts", "utf8");

const requireText = (source, text, label) => {
  if (!source.includes(text)) {
    console.error("Billing package contract missing: " + label);
    process.exit(1);
  }
};

const rejectText = (source, text, label) => {
  if (source.includes(text)) {
    console.error("Billing package contract regression: " + label);
    process.exit(1);
  }
};

// One public ladder with economically bounded list prices.
for (const [needle, label] of [
  ["name: 'Creator'", "Creator public plan"],
  ["monthlyPrice: 19", "Creator $19 monthly"],
  ["annualPrice: 190", "Creator $190 annual"],
  ["name: 'Pro'", "Pro public plan"],
  ["monthlyPrice: 69", "Pro $69 monthly"],
  ["annualPrice: 690", "Pro $690 annual"],
  ["name: 'Teams'", "Teams public plan"],
  ["monthlyPrice: 199", "Teams $199 monthly"],
  ["annualPrice: 1990", "Teams $1990 annual"],
  ["PUBLISHING_SERVICE_PACKAGES", "separate publishing-service catalogue"],
  ["USAGE_ADDONS", "separate usage-add-on catalogue"],
]) requireText(subscription, needle, label);

requireText(pricing, "One plan ladder. Clear usage. Publishing only when you publish.", "single pricing story");
requireText(pricing, "ScrollLibrary Press publishing services", "publishing services section");
requireText(pricing, "Usage add-ons", "usage add-on section");
requireText(pricing, "Marketplace fees", "transparent marketplace fees");
requireText(pricing, "No ScrollLibrary commission on external-channel royalties", "external distribution commission boundary");
rejectText(pricing, "CREATOR_SUBSCRIPTION_TIERS", "legacy publisher tiers exposed on pricing");
rejectText(pricing, "Commercial publishing rights", "commercial rights sold as a plan privilege");

// One-time compute packs deliberately share the server-owned UTC calendar-month
// ledger. Customer-facing pricing, checkout return copy and the usage meter must
// describe that same validity window rather than implying subscription-anniversary
// validity. Keep the server calculation pinned too so copy cannot drift from authority.
requireText(orderCheckout, "const benefitMonth = new Date().toISOString().slice(0, 7);", "usage packs use UTC calendar month authority");
requireText(pricing, "current UTC calendar month", "pricing discloses UTC calendar-month validity");
requireText(pricing, "reset at UTC month-end", "pricing discloses add-on reset boundary");
requireText(pricing, "If this was a usage pack", "checkout return explains usage-pack validity conditionally");
rejectText(pricing, "current billing month", "usage packs described as subscription billing-month benefits");
requireText(usageInsights, "server-authoritative usage period is the UTC calendar month", "usage meter states authoritative period");
requireText(usageInsights, "one-time usage packs reset at UTC month-end", "usage meter states add-on reset boundary");
requireText(usageInsights, "unused add-on units do not roll over", "usage meter states non-rollover policy");

// Commercial GA must be independently switchable from specialized-generation
// qualification and from the old PMF-only experimental surface.
requireText(clientConfig, "VITE_COMMERCIAL_GA_ENABLED", "independent commercial GA browser switch");
requireText(clientConfig, "enablePaidCheckout: COMMERCIAL_GA_ENABLED", "commercial checkout browser gate");
requireText(clientConfig, "enableExports: COMMERCIAL_GA_ENABLED", "commercial export browser gate");
requireText(clientConfig, "enableCanonicalPublication: COMMERCIAL_GA_ENABLED", "commercial publication browser gate");
requireText(clientConfig, "enableSpecializedAuthoring: SPECIALIZED_AUTHORING_ENABLED", "specialized qualification remains independent");
requireText(clientConfig, "VITE_MARKETPLACE_GA_ENABLED", "independent creator marketplace browser switch");
requireText(clientConfig, "enableMarketplace: MARKETPLACE_GA_ENABLED", "marketplace UI gate");
requireText(bookCheckout, "marketplacePaymentsEnabled()", "server marketplace payment gate");
requireText(payoutSettlement, "marketplacePayoutsEnabled()", "independent server marketplace payout gate");
requireText(payoutSettlement, "reserve_creator_payout", "marketplace payout database reservation");
requireText(payoutSettlement, "list_creator_payout_candidates", "marketplace payout retry-aware candidate authority");
requireText(seller, "PAID_SALES_ENABLED = FEATURES.enableMarketplace", "seller wizard follows marketplace payout-ready gate");
rejectText(seller, "PMF_MODE", "seller wizard still coupled to PMF mode");
requireText(ownerControls, "isBookTypeReleasedForClient", "book-type mutation uses provider qualification helper");

// Teams promises pooled organization usage and included seats, which are not
// implied by general subscription-payment readiness. Keep checkout separately
// fail-closed until that contract is qualified end to end.
requireText(gaReleaseFlags, "GA_TEAMS_SUBSCRIPTION_ENABLED", "independent server Teams subscription switch");
requireText(checkout, "teamsSubscriptionCheckoutEnabled()", "Teams checkout server gate");
requireText(checkout, 'code: "teams_not_ga_ready"', "Teams checkout fails closed before E2E qualification");

// Frontend and server limits must carry the same canonical numbers.
for (const [needle, label] of [
  ["aiTextWordsPerMonth: 25_000", "Free text pool"],
  ["aiTextWordsPerMonth: 250_000", "Creator text pool"],
  ["aiTextWordsPerMonth: 1_000_000", "Pro text pool"],
  ["aiTextWordsPerMonth: 2_500_000", "Teams text pool"],
  ["visualCreditsPerMonth: 200", "Teams visual pool"],
  ["audioCreditsPerMonth: 180", "Teams audio pool"],
  ["marketplaceFeeBps: 1_000", "Free marketplace fee"],
  ["marketplaceFeeBps: 700", "Creator marketplace fee"],
  ["marketplaceFeeBps: 500", "Pro marketplace fee"],
  ["marketplaceFeeBps: 300", "Teams marketplace fee"],
]) requireText(serverPlans, needle, label);

// New public checkout must be server-owned and fail closed if new Stripe prices
// are not provisioned. Historical prices are reconciliation only.
requireText(checkout, "isPublicCheckoutTier(tier)", "server public-tier allow-list");
requireText(checkout, "isBillingInterval(billingInterval)", "monthly/annual interval validation");
requireText(checkout, "publicCheckoutPrice(catalogue, tier, billingInterval)", "server-owned price resolution");
requireText(checkout, 'code: "billing_catalogue_not_provisioned"', "unprovisioned catalogue fails closed");
requireText(catalogue, "STRIPE_PRICE_CREATOR_MONTHLY", "new Creator price environment");
requireText(catalogue, "STRIPE_PRICE_PRO_MONTHLY", "new Pro price environment");
requireText(catalogue, "STRIPE_PRICE_TEAMS_MONTHLY", "new Teams price environment");
requireText(catalogue, "reconciliation-only", "legacy prices documented as reconciliation-only");
requireText(orderCheckout, "isOneTimeBillingSku(sku)", "server one-time SKU allow-list");
requireText(orderCheckout, "oneTimeBillingPrice(sku)", "server-owned one-time price resolution");
requireText(orderCheckout, "publishingServiceBillingEnabled()", "separate publishing-service sales gate");
requireText(orderCheckout, '"billing_catalogue_not_provisioned"', "unprovisioned one-time catalogue fails closed");
requireText(orderCatalogue, "STRIPE_PRICE_ADDON_AI_TEXT_250K", "AI text add-on Stripe price env");
requireText(orderCatalogue, "STRIPE_PRICE_PUBLISH_SINGLE_EDITION", "publishing service Stripe price env");
requireText(checkout, 'status: "all"', "existing subscription scan");
requireText(checkout, 'code: sameTier ? "existing_plan_subscription" : "plan_change_required"', "duplicate subscription rejection");
requireText(checkout, 'status: "open"', "open Checkout Session reuse");
requireText(checkout, 'code: "checkout_in_progress"', "single open plan checkout invariant");
requireText(checkout, "planTierForProduct(catalogue, productId)", "same-domain subscription detection");

for (const [source, label] of [
  [checkout, "subscription checkout"],
  [orderCheckout, "one-time checkout"],
  [bookCheckout, "storefront book checkout"],
]) {
  requireText(source, "automatic_tax: { enabled: true }", label + " automatic tax");
  requireText(source, "tax_id_collection: { enabled: true", label + " tax ID collection");
  requireText(source, 'billing_address_collection: "auto"', label + " billing address collection");
  requireText(source, 'customer_update: { address: "auto", name: "auto" }', label + " customer address persistence");
}
requireText(webhook, "session.amount_subtotal", "tax-aware fulfillment compares pre-tax subtotal");
requireText(webhook, "preTaxRefundAmount", "tax-inclusive refunds are mapped back to pre-tax ledger amounts");

for (const [source, label] of [
  [checkout, "subscription checkout"],
  [orderCheckout, "one-time checkout"],
  [bookCheckout, "storefront book checkout"],
]) {
  requireText(source, 'consent_collection: { terms_of_service: "required" }', label + " required terms consent");
  requireText(source, 'commercialConsentVersion: "eu-digital-v1"', label + " versioned consent marker");
  requireText(source, "terms_of_service_acceptance", label + " digital-performance consent text");
}
requireText(webhook, 'session.metadata?.commercialConsentVersion !== "eu-digital-v1"', "historical sessions are not retroactively reclassified");
requireText(webhook, 'session.consent?.terms_of_service !== "accepted"', "versioned checkout fulfillment verifies Stripe consent");

requireText(migration, "CREATE TABLE IF NOT EXISTS public.billing_usage_monthly", "monthly usage authority");
requireText(migration, "pg_advisory_xact_lock", "atomic usage locking");
requireText(migration, "reserve_billing_usage", "generic usage reservation");
requireText(migration, "get_user_marketplace_fee_bps", "single marketplace fee policy");
requireText(migration, "SELECT 0", "legacy surcharge neutralized");
requireText(webhook, "settleBillingOrder", "billing-order webhook fulfillment");
requireText(webhook, "record_billing_order_refund", "billing-order refund reconciliation");
requireText(generation, '"ai_text_words"', "chapter text uses AI text meter");
requireText(generation, '"visual_credits"', "chapter figures use visual meter");
requireText(images, '"visual_credits"', "image generation uses visual meter");
requireText(tts, '"audio_units"', "TTS uses pooled audio meter");

requireText(stripeFields, "subscriptionStatusGrantsAccess", "shared access-status helper");
requireText(stripeFields, 'status === "active" || status === "trialing"', "access-bearing Stripe states");
requireText(stripeFields, "subscriptionStatusBlocksNewCheckout", "shared replacement-checkout helper");
requireText(stripeFieldsTests, "subscription access is granted only for active or trialing states", "access-status tests");
requireText(stripeFieldsTests, "only terminal subscription states allow a replacement checkout", "replacement-checkout tests");
requireText(checkout, "subscriptionStatusBlocksNewCheckout(subscription.status)", "checkout shared status policy");
requireText(webhook, "subscriptionStatusGrantsAccess(status)", "webhook shared access policy");
requireText(checkSubscription, "subscriptionStatusGrantsAccess(subscription.status)", "subscription verification shared access policy");
requireText(webhook, "Failed renewal is entitlement-significant for both billing domains.", "failed-renewal convergence");
requireText(voiceGate, '.from("subscriptions")', "voice quota resolves server subscription authority");
requireText(voiceGate, "current_period_end", "voice quota rejects expired local subscription periods");
rejectText(voiceGate, "profile?.plan", "voice quota falls back to cached profile plan");

console.log("Billing package contract: PASS (commercial GA separated; Teams fail-closed; authoritative entitlements; economic ladder metered; tax-aware checkout; UTC add-on validity aligned)");
