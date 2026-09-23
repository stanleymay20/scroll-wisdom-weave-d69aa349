import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
const disabled = [];
let current = null;

for (const rawLine of config.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (line.startsWith("[functions.") && line.endsWith("]")) {
    current = line.slice("[functions.".length, -1);
    continue;
  }
  if (current && line === "verify_jwt = false") disabled.push(current);
}

const externalModes = {
  "stripe-webhook": {
    mode: "webhook_signature",
    evidence: [/stripe-signature/i, /constructEvent|verify.*signature|webhook.*signature/i],
  },
  "gumroad-oauth-callback": {
    mode: "oauth_callback_state",
    evidence: [/state/i, /GUMROAD_CLIENT_SECRET|oauth/i],
  },
  "shopify-oauth-callback": {
    mode: "oauth_callback_state",
    evidence: [/state/i, /SHOPIFY_CLIENT_SECRET|hmac|oauth/i],
  },
  "materialize-release-schedules": {
    mode: "cron_secret",
    evidence: [/CRON_SECRET/, /x-cron-secret/i],
  },
  "verify-certificate": {
    mode: "public_readonly",
    evidence: [/verify|certificate/i],
  },
  "storefront-api": {
    mode: "public_readonly",
    evidence: [/storefront|public/i],
  },
};

const userAuthEvidence = [
  /\brequireUser\s*\(/,
  /\.auth\.getUser\s*\(/,
  /\.auth\.getClaims\s*\(/,
  /getUserFromRequest|authenticateUser|requireAuth|verifyUser/i,
];

const failures = [];
const report = [];

for (const name of disabled) {
  const path = join(root, "supabase/functions", name, "index.ts");
  if (!existsSync(path)) {
    failures.push(name + ": index.ts is missing");
    continue;
  }

  const source = readFileSync(path, "utf8");
  const external = externalModes[name];

  if (external) {
    const missing = external.evidence.filter((pattern) => !pattern.test(source));
    if (missing.length) {
      failures.push(
        name + ": declared " + external.mode +
        " but compensating-auth evidence is incomplete",
      );
    } else {
      report.push({ name, mode: external.mode });
    }
    continue;
  }

  if (!userAuthEvidence.some((pattern) => pattern.test(source))) {
    failures.push(
      name +
      ": verify_jwt=false without recognizable in-function user authentication",
    );
  } else {
    report.push({ name, mode: "in_function_user_auth" });
  }
}

console.log(
  "Audited " + disabled.length + " Edge Functions with verify_jwt=false.",
);
for (const row of report) console.log("  PASS " + row.name + ": " + row.mode);

if (failures.length) {
  console.error("\nUnauthenticated Edge Function audit failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}
