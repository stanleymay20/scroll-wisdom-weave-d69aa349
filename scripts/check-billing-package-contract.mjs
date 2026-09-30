import { readFileSync } from "node:fs";

// Source-only by design: this contract runs in ordinary CI even when Stripe test secrets are unavailable.

const subscription = readFileSync("src/lib/subscription.ts", "utf8");
const pricing = readFileSync("src/pages/Pricing.tsx", "utf8");
const checkout = readFileSync("supabase/functions/create-checkout/index.ts", "utf8");
const checkSubscription = readFileSync("supabase/functions/check-subscription/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const stripeFields = readFileSync("supabase/functions/_shared/stripe-fields.ts", "utf8");
const stripeFieldsTests = readFileSync("supabase/functions/_shared/stripe-fields_test.ts", "utf8");

const requireText = (source, text, label) => {
  if (!source.includes(text)) {
    console.error(`Billing package contract missing: ${label}`);
    process.exit(1);
  }
};

const rejectText = (source, text, label) => {
  if (source.includes(text)) {
    console.error(`Billing package contract regression: ${label}`);
    process.exit(1);
  }
};

// Public package identity: one ladder, no duplicate Creator/Creator Pro family.
requireText(subscription, "name: 'Creator'", "Creator public plan");
requireText(subscription, "name: 'Pro'", "Pro public plan");
requireText(subscription, "name: 'Teams'", "Teams public plan");
requireText(pricing, "SUBSCRIPTION_TIERS.student.name", "Creator pricing card");
requireText(pricing, "SUBSCRIPTION_TIERS.premium.name", "Pro pricing card");
requireText(pricing, "SUBSCRIPTION_TIERS.prophet_tier.name", "Teams pricing card");
rejectText(pricing, "CREATOR_SUBSCRIPTION_TIERS", "legacy publisher tiers exposed on pricing");
rejectText(pricing, "handleCreatorCheckout", "legacy publisher checkout exposed on pricing");
rejectText(pricing, "Marketplace add-ons", "second paid package family exposed on pricing");

// Server authority: only generation tiers may start a new public checkout.
requireText(checkout, "isPublicCheckoutTier(tier)", "server-side public-tier allow-list");
requireText(checkout, 'code: "tier_not_publicly_sold"', "retired-tier rejection");
requireText(checkout, 'status: "all"', "existing subscription scan");
requireText(checkout, 'code: sameTier ? "existing_plan_subscription" : "plan_change_required"', "duplicate subscription rejection");
requireText(checkout, 'status: "open"', "open Checkout Session reuse");
requireText(checkout, 'code: "checkout_in_progress"', "single open plan checkout invariant");
requireText(checkout, "planTierForProduct(catalogue, productId)", "same-domain subscription detection");

// Paid plan access must follow one shared Stripe status policy, not redirects or
// duplicated literals that can drift across checkout, webhook and verification.
requireText(stripeFields, "subscriptionStatusGrantsAccess", "shared access-status helper");
requireText(stripeFields, 'status === "active" || status === "trialing"', "access-bearing Stripe states");
requireText(stripeFields, "subscriptionStatusBlocksNewCheckout", "shared replacement-checkout helper");
requireText(stripeFieldsTests, "subscription access is granted only for active or trialing states", "access-status tests");
requireText(stripeFieldsTests, "only terminal subscription states allow a replacement checkout", "replacement-checkout tests");
requireText(checkout, "subscriptionStatusBlocksNewCheckout(subscription.status)", "checkout uses shared status policy");
requireText(webhook, "subscriptionStatusGrantsAccess(status)", "webhook uses shared access policy");
requireText(checkSubscription, "subscriptionStatusGrantsAccess(subscription.status)", "subscription verification uses shared access policy");
requireText(webhook, "Failed renewal is entitlement-significant for both billing domains.", "failed-renewal convergence");

console.log("Billing package contract: PASS (Free → Creator → Pro → Teams; duplicate recurring checkout fenced)");
