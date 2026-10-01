import { readFileSync } from "node:fs";

// Source-only billing architecture contract. Runs in ordinary CI without Stripe secrets.
const subscription = readFileSync("src/lib/subscription.ts", "utf8");
const pricing = readFileSync("src/pages/Pricing.tsx", "utf8");
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
rejectText(pricing, "CREATOR_SUBSCRIPTION_TIERS", "legacy publisher tiers exposed on pricing");
rejectText(pricing, "Commercial publishing rights", "commercial rights sold as a plan privilege");

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

// Frontend and server limits must carry the same canonical numbers.
for (const [needle, label] of [
  ["aiTextWordsPerMonth: 25_000", "Free text pool"],
  ["aiTextWordsPerMonth: 250_000", "Creator text pool"],
  ["aiTextWordsPerMonth: 1_000_000", "Pro text pool"],
  ["aiTextWordsPerMonth: 2_500_000", "Teams text pool"],
  ["visualCreditsPerMonth: 200", "Teams visual pool"],
  ["audioCreditsPerMonth: 180", "Teams audio pool"],
  ["marketplaceFeeBps: 1_500", "Free marketplace fee"],
  ["marketplaceFeeBps: 1_000", "Creator marketplace fee"],
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

// Commercial Checkout must collect the inputs required for Stripe Tax / B2B tax IDs.
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

// Compute must be metered on server-owned, race-safe reservations.
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

// Paid plan access continues to follow the shared Stripe status policy.
requireText(stripeFields, "subscriptionStatusGrantsAccess", "shared access-status helper");
requireText(stripeFields, 'status === "active" || status === "trialing"', "access-bearing Stripe states");
requireText(stripeFields, "subscriptionStatusBlocksNewCheckout", "shared replacement-checkout helper");
requireText(stripeFieldsTests, "subscription access is granted only for active or trialing states", "access-status tests");
requireText(stripeFieldsTests, "only terminal subscription states allow a replacement checkout", "replacement-checkout tests");
requireText(checkout, "subscriptionStatusBlocksNewCheckout(subscription.status)", "checkout shared status policy");
requireText(webhook, "subscriptionStatusGrantsAccess(status)", "webhook shared access policy");
requireText(checkSubscription, "subscriptionStatusGrantsAccess(subscription.status)", "subscription verification shared access policy");
requireText(webhook, "Failed renewal is entitlement-significant for both billing domains.", "failed-renewal convergence");

console.log("Billing package contract: PASS (commercial GA separated; economic ladder metered; tax-aware checkout fail-closed)");
