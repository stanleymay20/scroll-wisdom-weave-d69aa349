import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const http = readFileSync(join(root, "supabase/functions/_shared/http.ts"), "utf8");
const bridge = readFileSync(join(root, "supabase/functions/ai-publishing-bridge/index.ts"), "utf8");
const mcp = readFileSync(join(root, "supabase/functions/mcp/index.ts"), "utf8");
const migration = readFileSync(
  join(root, "supabase/migrations/20260927162500_mcp_oauth_capability_boundary.sql"),
  "utf8",
);

const failures = [];

if (!/client_id/.test(http) || !/allowExternalOAuthClient/.test(http)) {
  failures.push("requireUser does not recognize and default-deny external OAuth client tokens");
}

const explicitOAuthOptIns = [];
const functionsRoot = join(root, "supabase/functions");
for (const name of readdirSync(functionsRoot)) {
  const dir = join(functionsRoot, name);
  if (name === "_shared" || !statSync(dir).isDirectory()) continue;
  const path = join(dir, "index.ts");
  try {
    const source = readFileSync(path, "utf8");
    if (/allowExternalOAuthClient:\s*true/.test(source)) {
      explicitOAuthOptIns.push(`supabase/functions/${name}/index.ts`);
    }
  } catch {
    // Not every function directory is required to expose index.ts.
  }
}

if (
  explicitOAuthOptIns.length !== 1 ||
  explicitOAuthOptIns[0] !== "supabase/functions/ai-publishing-bridge/index.ts"
) {
  failures.push("AI Publishing Bridge must remain the sole privileged OAuth opt-in");
}

for (const action of ["accept_proposal", "reject_proposal"]) {
  const at = bridge.indexOf(`body.action === "${action}"`);
  if (at === -1) {
    failures.push(`AI bridge lost ${action} action branch`);
    continue;
  }
  const window = bridge.slice(at, at + 700);
  if (!/auth\.isExternalOAuthClient/.test(window) || !/forbidden\s*\(/.test(window)) {
    failures.push(`${action} is not explicitly blocked for external OAuth clients`);
  }
}

if (/accept_proposal|reject_proposal|publish-work|finalize-publication-certification/.test(mcp)) {
  failures.push("MCP connector exposes or references a canonical-decision capability");
}

if (
  !/pgrst\.db_pre_request/.test(migration) ||
  !/external_oauth_direct_access_block/.test(migration) ||
  !/storage\.objects/.test(migration)
) {
  failures.push("Database OAuth capability boundary is incomplete");
}

if (failures.length) {
  console.error("MCP OAuth capability boundary audit failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("MCP OAuth capability boundary audit passed.");
