from pathlib import Path
import re

path = Path("supabase/functions/generate-book/index.ts")
source = path.read_text()

old_import = 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";'
new_import = 'import { requireUser, serviceClient } from "../_shared/http.ts";'
assert source.count(old_import) == 1, "unexpected generate-book Supabase import"
source = source.replace(old_import, new_import, 1)

start_marker = '    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");\n'
end_marker = '    console.log(`[GENERATE-BOOK] User: ${user.id.slice(0, 8)}...`);\n'
start = source.index(start_marker)
end = source.index(end_marker, start)
new_auth = (
    '    // Authenticate with the caller-scoped client. The service-role client is\n'
    '    // created only after identity is established and is reserved for privileged\n'
    '    // server-side quota/job mutations below.\n'
    '    const auth = await requireUser(req);\n'
    '    if (auth instanceof Response) return auth;\n'
    '    const user = { id: auth.userId };\n'
    '    const userClient = auth.client;\n'
    '    const sc = serviceClient();\n\n'
)
source = source[:start] + new_auth + source[end:]

old_admin = '    const { data: adminRole } = await supabase\n      .from("user_roles").select("role")'
new_admin = '    const { data: adminRole } = await userClient\n      .from("user_roles").select("role")'
assert source.count(old_admin) == 1, "unexpected admin-role read"
source = source.replace(old_admin, new_admin, 1)

old_subscription = '    const { data: subscription } = await supabase\n      .from("subscriptions").select("tier, status")'
new_subscription = '    const { data: subscription } = await userClient\n      .from("subscriptions").select("tier, status")'
assert source.count(old_subscription) == 1, "unexpected subscription read"
source = source.replace(old_subscription, new_subscription, 1)

# Every remaining `supabase.` access is a privileged RPC or write path.
source, dot_count = re.subn(r"(?<![A-Za-z0-9_$])supabase\.", "sc.", source)
source, gate_count = re.subn(r"recordGateEvent\(supabase,", "recordGateEvent(sc,", source)
assert dot_count >= 8, f"expected privileged accesses, found {dot_count}"
assert gate_count >= 1, f"expected gate event calls, found {gate_count}"
assert "const supabase =" not in source
assert "supabase.auth." not in source
assert source.count("await userClient") == 2
assert source.count("reserve_book_generation") == 1
assert source.count("release_book_generation") == 1
assert source.count("await sc.rpc") >= 3

path.write_text(source)
print(f"generate-book auth boundary transformed: {dot_count} privileged client calls, {gate_count} gate-event calls")
