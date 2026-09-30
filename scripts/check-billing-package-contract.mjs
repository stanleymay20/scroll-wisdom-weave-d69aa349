import { readFileSync } from "node:fs";

const files = {
  config: readFileSync("src/lib/config.ts", "utf8"),
  subscription: readFileSync("src/lib/subscription.ts", "utf8"),
  pricing: readFileSync("src/pages/Pricing.tsx", "utf8"),
  checkout: readFileSync("supabase/functions/create-checkout/index.ts", "utf8"),
  fields: readFileSync("supabase/functions/_shared/stripe-fields.ts", "utf8"),
};

function requireText(source, text, label) {
  if (!source.includes(text)) {
    console.error(`Billing package contract missing: ${label}`);
    process.exit(1);
  }
}

function rejectText(source, text, label) {
  if (source.includes(text)) {
    console.error(`Billing package contract contains unqualified claim: ${label}`);
    process.exit(1);
  }
}

// Public generation-plan naming must stay distinct from the hidden publishing
// add-on authority domain.
requireText(files.subscription, "name: 'Creator'", "Creator generation plan");
requireText(files.subscription, "name: 'Pro'", "Pro generation plan");
requireText(files.subscription, "name: 'Teams'", "Teams generation plan");
requireText(files.subscription, "name: 'Publisher'", "Publisher add-on");
requireText(files.subscription, "name: 'Publisher Pro'", "Publisher Pro add-on");

// Publisher subscriptions require both client and server release switches.
requireText(files.config, "enablePublisherSubscriptions: false", "frontend publisher fail-closed switch");
requireText(files.checkout, "publisherSubscriptionsEnabled()", "server publisher fail-closed switch");
requireText(files.checkout, 'code: "publisher_subscriptions_disabled"', "publisher disabled response");

// Checkout must serialize both live subscriptions and unfinished Checkout
// sessions inside each authority domain.
requireText(files.checkout, 'status: "all"', "existing subscription lookup");
requireText(files.checkout, "subscriptionStatusBlocksNewCheckout", "non-terminal subscription blocker");
requireText(files.checkout, 'status: "open"', "open Checkout lookup");
requireText(files.checkout, 'code: "subscription_already_exists"', "duplicate subscription response");
requireText(files.checkout, 'code: "checkout_in_progress"', "in-flight Checkout response");
requireText(files.checkout, "subscription_data:", "subscription metadata propagation");

// Access semantics stay centralized and fail closed.
requireText(files.fields, "subscriptionStatusGrantsAccess", "settled subscription access helper");
requireText(files.fields, 'status === "active" || status === "trialing"', "active/trialing-only access");

// Do not sell benefits that are merely stored entitlement fields with no
// production consumer.
for (const [claim, label] of [
  ["Priority generation queue", "priority generation"],
  ["+50 monthly generation bonus", "monthly generation bonus"],
  ["Unlimited collections", "unlimited collections"],
  ["External publishing (Gumroad, Shopify, KDP)", "external publishing"],
]) {
  rejectText(files.subscription + files.pricing, claim, label);
}

console.log("Billing package contract: PASS");
