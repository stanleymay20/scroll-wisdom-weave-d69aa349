import { readFileSync } from "node:fs";

const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const replay = readFileSync("supabase/functions/admin-webhook-replay/index.ts", "utf8");
const claimMigration = readFileSync(
  "supabase/migrations/20260923030500_stripe_webhook_claim_terminal_hardening.sql",
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
