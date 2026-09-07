import { readFile } from "node:fs/promises";

const rosterMigrationPath = "supabase/migrations/20260907024000_scroll_university_roster_conflict_target_fix.sql";
const authMigrationPath = "supabase/migrations/20260907023900_scroll_university_roster_security_hardening.sql";
const edgePath = "supabase/functions/university-provision-users/index.ts";

const [rosterMigration, authMigration, edge] = await Promise.all([
  readFile(rosterMigrationPath, "utf8"),
  readFile(authMigrationPath, "utf8"),
  readFile(edgePath, "utf8"),
]);

const checks = [
  {
    name: "roster RPC requires organization owner/admin",
    ok: rosterMigration.includes("IF NOT public.is_org_admin(_actor_id, _organization_id) THEN"),
  },
  {
    name: "new academic users receive only organization member privilege",
    ok: /VALUES\s*\(\s*_organization_id,\s*v_user_id,\s*'member',\s*_actor_id\s*\)/s.test(rosterMigration),
  },
  {
    name: "existing organization roles are preserved with an unambiguous conflict target",
    ok:
      rosterMigration.includes("ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key") &&
      rosterMigration.includes("DO NOTHING;"),
  },
  {
    name: "roster RPC rejects non-Auth identifiers",
    ok: rosterMigration.includes("FROM auth.users AS u") && rosterMigration.includes("RAISE EXCEPTION 'Unknown auth user'"),
  },
  {
    name: "roster RPC is service-role-only",
    ok:
      rosterMigration.includes("REVOKE ALL ON FUNCTION public.provision_university_roster_batch(uuid, uuid, jsonb)") &&
      rosterMigration.includes("TO service_role;"),
  },
  {
    name: "Auth resolver is service-role-only",
    ok:
      authMigration.includes("REVOKE ALL ON FUNCTION public.resolve_university_auth_users(text[])") &&
      authMigration.includes("GRANT EXECUTE ON FUNCTION public.resolve_university_auth_users(text[])") &&
      authMigration.includes("TO service_role;"),
  },
  {
    name: "security-definer roster and auth functions use an empty search_path",
    ok:
      rosterMigration.includes("SET search_path = ''") &&
      authMigration.includes("SET search_path = ''"),
  },
  {
    name: "Edge request is capped at 500 people",
    ok: edge.includes("z.array(Person).min(1).max(500)"),
  },
  {
    name: "Edge verifies broader organization authority independently",
    ok:
      edge.includes('.from("organization_members")') &&
      edge.includes('!["owner", "admin"].includes(membership.role)'),
  },
  {
    name: "Edge never maps university_role into organization role",
    ok: !/organization_members[\s\S]{0,500}university_role/.test(edge),
  },
];

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} ScrollUniversity provisioning security contract check(s) failed.`);
  process.exit(1);
}

console.log("\nScrollUniversity provisioning privilege boundary is locked.");
