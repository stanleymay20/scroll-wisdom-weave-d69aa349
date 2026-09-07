import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/20260907023900_scroll_university_roster_security_hardening.sql";
const edgePath = "supabase/functions/university-provision-users/index.ts";

const [migration, edge] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(edgePath, "utf8"),
]);

const checks = [
  {
    name: "roster RPC requires organization owner/admin",
    ok: migration.includes("IF NOT public.is_org_admin(_actor_id, _organization_id) THEN"),
  },
  {
    name: "new academic users receive only organization member privilege",
    ok: /VALUES\s*\(\s*_organization_id,\s*v_user_id,\s*'member',\s*_actor_id\s*\)/s.test(migration),
  },
  {
    name: "existing organization roles are preserved",
    ok: migration.includes("ON CONFLICT (organization_id, user_id) DO NOTHING"),
  },
  {
    name: "roster RPC rejects non-Auth identifiers",
    ok: migration.includes("FROM auth.users AS u") && migration.includes("RAISE EXCEPTION 'Unknown auth user'"),
  },
  {
    name: "roster RPC is service-role-only",
    ok:
      migration.includes("REVOKE ALL ON FUNCTION public.provision_university_roster_batch(uuid, uuid, jsonb)") &&
      migration.includes("TO service_role;"),
  },
  {
    name: "Auth resolver is service-role-only",
    ok:
      migration.includes("REVOKE ALL ON FUNCTION public.resolve_university_auth_users(text[])") &&
      migration.includes("GRANT EXECUTE ON FUNCTION public.resolve_university_auth_users(text[])") &&
      migration.includes("TO service_role;"),
  },
  {
    name: "security-definer roster functions use an empty search_path",
    ok: (migration.match(/SET search_path = ''/g) ?? []).length >= 2,
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
