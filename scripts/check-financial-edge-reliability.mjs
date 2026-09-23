import { readFileSync } from "node:fs";

const checkout = readFileSync("supabase/functions/create-book-checkout/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const replay = readFileSync("supabase/functions/admin-webhook-replay/index.ts", "utf8");
const adminRefund = readFileSync("supabase/functions/admin-refund-purchase/index.ts", "utf8");
const adminCors = readFileSync("supabase/functions/_shared/admin-cors.ts", "utf8");
const claimMigration = readFileSync(
  "supabase/migrations/20260923030500_stripe_webhook_claim_terminal_hardening.sql",
  "utf8",
);
const refundMigration = readFileSync(
  "supabase/migrations/20260923031500_partial_refund_ledger_events.sql",
  "utf8",
);

const failures = [];

function requireText(source, needle, label) {
  if (!source.includes(needle)) failures.push(label + " is missing");
}

function rejectText(source, needle, label) {
  if (source.includes(needle)) failures.push(label + " regressed");
}

requireText(
  checkout,
  'req.headers.get("x-idempotency-key")',
  "paid checkout idempotency header",
);
requireText(
  checkout,
  "security_dependency_unavailable",
  "checkout fail-closed security dependency response",
);
rejectText(
  checkout,
  "Fail open to avoid false payment outages",
  "checkout velocity fail-open fallback",
);
requireText(
  webhook,
  "Checkout amount authority mismatch",
  "webhook amount authority check",
);
requireText(
  webhook,
  "Checkout currency authority mismatch",
  "webhook currency authority check",
);
requireText(
  webhook,
  "Checkout identity does not match the persisted pending purchase",
  "webhook purchase identity binding",
);
requireText(
  webhook,
  'case "checkout.session.async_payment_succeeded"',
  "delayed-payment success handler",
);
requireText(
  webhook,
  'session.payment_status === "paid"',
  "checkout settlement payment-status gate",
);
requireText(
  webhook,
  'status: retryLater ? 503 : 200',
  "non-terminal in-flight webhook retry response",
);
requireText(
  webhook,
  "Paid purchase update failed:",
  "authoritative paid-purchase update failure",
);
requireText(
  webhook,
  "Paid purchase upsert failed:",
  "authoritative paid-purchase upsert failure",
);
requireText(
  webhook,
  "Purchase ledger write failed:",
  "authoritative ledger-write failure",
);
requireText(
  webhook,
  "Webhook finalization write failed:",
  "authoritative webhook-finalization failure",
);
requireText(
  webhook,
  "Purchase replay reconciled",
  "paid/refunded replay reconciliation",
);

requireText(
  webhook,
  'case "refund.created"',
  "Stripe refund.created reconciliation handler",
);
requireText(
  webhook,
  'case "refund.updated"',
  "Stripe refund.updated reconciliation handler",
);
requireText(
  webhook,
  '"record_purchase_refund_ledger"',
  "event-specific partial-refund ledger call",
);
requireText(
  webhook,
  "charge.refunds?.has_more",
  "charge.refunded pagination/reconciliation fallback",
);
rejectText(
  webhook,
  '.update({ status: "refunded" })',
  "webhook direct full-purchase refund status write",
);

requireText(
  adminRefund,
  'req.headers.get("x-idempotency-key")',
  "admin refund request idempotency key",
);
requireText(
  adminRefund,
  '"record_purchase_refund_ledger"',
  "admin partial-refund ledger call",
);
requireText(
  adminRefund,
  "idempotencyKey:",
  "Stripe refund idempotency option",
);
requireText(
  adminRefund,
  "refund:${purchase.id}:${idempotencyKey}",
  "Stripe refund key bound to the logical admin request",
);
rejectText(
  adminRefund,
  '.update({ status: "refunded"',
  "admin direct full-purchase refund status write",
);
requireText(
  adminCors,
  "x-idempotency-key",
  "admin CORS idempotency header allowance",
);

requireText(
  refundMigration,
  "source_event_id text",
  "append-only Stripe refund event identity",
);
requireText(
  refundMigration,
  "record_purchase_refund_ledger",
  "partial-refund ledger function",
);
requireText(
  refundMigration,
  "creator_earnings_refund_source_event_unique",
  "unique refund event ledger identity",
);
requireText(
  refundMigration,
  "IF v_fully_refunded THEN",
  "access revocation only after cumulative full refund",
);
requireText(
  refundMigration,
  "refund_requests_purchase_idempotency_unique",
  "admin refund request idempotency index",
);
requireText(
  replay,
  'last_error: "admin_replay_staged"',
  "explicit admin replay staging",
);
requireText(
  replay,
  'status: "failed"',
  "admin replay retryable state",
);
rejectText(
  replay,
  '// Mark replaying\n    await sc.from("stripe_webhook_events").update({\n      status: "processing"',
  "admin replay pre-claim processing state",
);
requireText(
  replay,
  'finalStatus = String(afterReplay?.status ?? "failed")',
  "admin replay preserves webhook failure/dead-letter status",
);

requireText(
  claimMigration,
  "('processed', 'replayed', 'dead_lettered')",
  "dead-letter terminal claim state",
);
requireText(
  claimMigration,
  "GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event",
  "service-role claim execution grant",
);

if (failures.length) {
  console.error("Financial Edge reliability contract failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Financial Edge reliability contract: PASS");
