import { readFileSync } from "node:fs";

const sensitive = [
  "supabase/functions/create-checkout/index.ts",
  "supabase/functions/customer-portal/index.ts",
  "supabase/functions/check-subscription/index.ts",
  "supabase/functions/create-book-checkout/index.ts",
  "supabase/functions/admin-force-stripe-resync/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
];

const failures = [];

for (const path of sensitive) {
  const body = readFileSync(path, "utf8");

  if (/customers\.list\s*\(/.test(body)) {
    failures.push(`${path}: Stripe customer ownership must not be resolved by customer search/email`);
  }
  if (/findUserByEmail/.test(body)) {
    failures.push(`${path}: email-based user ownership resolver is forbidden on money paths`);
  }
}

const required = new Map([
  ["supabase/functions/create-checkout/index.ts", ["ensureBillingCustomer", '"subscription_checkout"']],
  ["supabase/functions/customer-portal/index.ts", ["getBillingCustomerId", "user.id"]],
  ["supabase/functions/check-subscription/index.ts", ["getBillingCustomerId", "userId"]],
  ["supabase/functions/create-book-checkout/index.ts", ["ensureBillingCustomer", '"book_checkout"']],
  ["supabase/functions/admin-force-stripe-resync/index.ts", ["getBillingCustomerId", "resolveUserIdForBillingCustomer"]],
  ["supabase/functions/stripe-webhook/index.ts", ["resolveUserIdForBillingCustomer", "customer/user identity mismatch"]],
]);

for (const [path, needles] of required) {
  const body = readFileSync(path, "utf8");
  for (const needle of needles) {
    if (!body.includes(needle)) failures.push(`${path}: missing canonical billing identity contract ${needle}`);
  }
}

const helper = readFileSync("supabase/functions/_shared/billing-customer.ts", "utf8");
for (const needle of [
  "billing_customer_links",
  "scrolllibrary_user_id",
  "BILLING_CUSTOMER_ID_CONFLICT_FOR_USER",
]) {
  if (!helper.includes(needle)) failures.push(`billing-customer helper missing ${needle}`);
}
if (/\.email\s*===|find.*email|customers\.list\s*\(/i.test(helper)) {
  failures.push("billing-customer helper must not use email as an ownership resolver");
}

const migration = readFileSync(
  "supabase/migrations/20260923050500_billing_customer_identity.sql",
  "utf8",
);
for (const needle of [
  "PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE",
  "stripe_customer_id text NOT NULL UNIQUE",
  "ENABLE ROW LEVEL SECURITY",
  "BILLING_CUSTOMER_ID_CONFLICT_FOR_USER",
  "BILLING_CUSTOMER_SHARED_ACROSS_USERS",
]) {
  if (!migration.includes(needle)) failures.push(`billing identity migration missing ${needle}`);
}

if (failures.length) {
  console.error("Billing customer identity audit failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Billing customer identity audit: PASS");
