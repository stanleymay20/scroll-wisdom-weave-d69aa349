import { readFileSync } from "node:fs";

const expected = [
  "account.updated",
  "charge.dispute.closed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.refunded",
  "checkout.session.async_payment_failed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.paid",
  "invoice.payment_failed",
  "refund.created",
  "refund.failed",
  "refund.updated",
].sort();

const source = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const handled = [...source.matchAll(/case\s+"([^"]+)"/g)].map((m) => m[1]).sort();

const duplicates = handled.filter((event, i) => handled.indexOf(event) !== i);
const missing = expected.filter((event) => !handled.includes(event));
const unexpected = handled.filter((event) => !expected.includes(event));

if (duplicates.length || missing.length || unexpected.length) {
  console.error("Stripe webhook event contract drift detected.");
  if (duplicates.length) console.error("Duplicate cases:", duplicates.join(", "));
  if (missing.length) console.error("Missing handled events:", missing.join(", "));
  if (unexpected.length) console.error("Unexpected handled events:", unexpected.join(", "));
  console.error("Update the production Stripe endpoint and this canonical contract together.");
  process.exit(1);
}

console.log(`Stripe webhook event contract: PASS (${expected.length} canonical events)`);
