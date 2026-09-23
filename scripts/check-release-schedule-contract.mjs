import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/BookPublishSettings.tsx", "utf8");
const worker = readFileSync("supabase/functions/materialize-release-schedules/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260920180000_schedule_release_materialization.sql", "utf8");
const entitlementRls = readFileSync("supabase/migrations/20260923123000_release_schedule_entitlement_rls.sql", "utf8");
const lifecycle = readFileSync("scripts/test-release-materialization.sql", "utf8");

const failures = [];
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label + " is missing");
};

requireText(page, "canScheduleReleases = entitlements.can_schedule_releases", "UI entitlement source");
requireText(page, "canScheduleReleases ?", "schedule UI entitlement gate");
requireText(page, "Serialized release schedules are locked", "free-user locked state");

requireText(worker, 'if (auth.status !== "authorized")', "HTTP scheduler fail-closed auth");
requireText(worker, '"scheduler_secret_unconfigured"', "unconfigured scheduler rejection");
if (worker.includes("running unauthenticated")) {
  failures.push("HTTP scheduler still advertises anonymous execution");
}

requireText(migration, "CREATE OR REPLACE FUNCTION public.materialize_due_releases", "canonical SQL materializer");
requireText(migration, "materialize_due_releases_every_5_min", "canonical cron job name");
requireText(migration, "'*/5 * * * *'", "five-minute release cadence");
requireText(migration, "'SELECT public.materialize_due_releases();'", "cron SQL command");
requireText(migration, ".eq", ""); // harmless sentinel removed below
failures.pop(); // keep helper uniform without requiring JS semantics in SQL.

for (const policy of [
  "release_schedules_entitled_insert",
  "release_schedules_entitled_update",
  "release_schedules_entitled_delete",
  "release_schedule_items_entitled_insert",
  "release_schedule_items_entitled_update",
  "release_schedule_items_entitled_delete",
]) {
  requireText(entitlementRls, policy, policy);
}
requireText(entitlementRls, "AS RESTRICTIVE", "restrictive RLS composition");
requireText(entitlementRls, "public.get_user_entitlements", "canonical entitlement evaluation");
requireText(entitlementRls, "can_schedule_releases", "paid scheduling entitlement");

requireText(lifecycle, "canonical release materialization cron job is missing or misconfigured", "cron registration assertion");
requireText(lifecycle, "second pass should find nothing", "materializer idempotency assertion");
requireText(lifecycle, "future item must stay scheduled", "no-early-release assertion");
requireText(lifecycle, "entitlement_revoked", "lapsed-owner failure assertion");

if (failures.length) {
  console.error("Release scheduling contract failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Release scheduling UI/RLS/cron/materialization contract: PASS");
