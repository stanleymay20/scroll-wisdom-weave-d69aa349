from pathlib import Path


def transform_refund(path: Path) -> None:
    source = path.read_text()
    original = source

    source = source.replace(
        "  preflight, json, badRequest, forbidden, serverError,\n",
        "  json, badRequest, forbidden, serverError,\n",
        1,
    )
    anchor = '} from "../_shared/http.ts";\nimport { correlationId, logFinancialEvent }'
    replacement = (
        '} from "../_shared/http.ts";\n'
        'import { adminOriginGuard, withAdminOriginAllowList } from "../_shared/admin-cors.ts";\n'
        'import { correlationId, logFinancialEvent }'
    )
    assert source.count(anchor) == 1, "unexpected refund import boundary"
    source = source.replace(anchor, replacement, 1)

    old_start = '''serve(async (req) => {\n  const pre = preflight(req); if (pre) return pre;\n  if (req.method !== "POST") return badRequest("POST only");\n'''
    new_start = '''serve(async (req) => {\n  const originGate = adminOriginGuard(req);\n  if (originGate) return withAdminOriginAllowList(req, originGate);\n\n  const response = await (async () => {\n  if (req.method !== "POST") return badRequest("POST only");\n'''
    assert source.count(old_start) == 1, "unexpected refund handler start"
    source = source.replace(old_start, new_start, 1)

    old_end = '''  } catch (e) { return serverError(e); }\n});\n'''
    new_end = '''  } catch (e) { return serverError(e); }\n  })();\n  return withAdminOriginAllowList(req, response);\n});\n'''
    assert source.count(old_end) == 1, "unexpected refund handler end"
    source = source.replace(old_end, new_end, 1)

    assert "preflight(" not in source
    assert source.count("adminOriginGuard(req)") == 1
    assert source.count("withAdminOriginAllowList(req,") == 2
    assert source.count("stripe.refunds.create") == original.count("stripe.refunds.create") == 1
    assert source.count("record_purchase_ledger") == original.count("record_purchase_ledger")
    path.write_text(source)


def transform_resync(path: Path) -> None:
    source = path.read_text()
    original = source

    source = source.replace("  preflight,\n", "", 1)
    anchor = '} from "../_shared/http.ts";\nimport { correlationId }'
    replacement = (
        '} from "../_shared/http.ts";\n'
        'import { adminOriginGuard, withAdminOriginAllowList } from "../_shared/admin-cors.ts";\n'
        'import { correlationId }'
    )
    assert source.count(anchor) == 1, "unexpected resync import boundary"
    source = source.replace(anchor, replacement, 1)

    old_start = '''serve(async (req) => {\n  const pre = preflight(req);\n  if (pre) return pre;\n  if (req.method !== "POST") return badRequest("POST only");\n'''
    new_start = '''serve(async (req) => {\n  const originGate = adminOriginGuard(req);\n  if (originGate) return withAdminOriginAllowList(req, originGate);\n\n  const response = await (async () => {\n  if (req.method !== "POST") return badRequest("POST only");\n'''
    assert source.count(old_start) == 1, "unexpected resync handler start"
    source = source.replace(old_start, new_start, 1)

    old_end = '''  } catch (e) {\n    return serverError(e);\n  }\n});\n'''
    new_end = '''  } catch (e) {\n    return serverError(e);\n  }\n  })();\n  return withAdminOriginAllowList(req, response);\n});\n'''
    assert source.count(old_end) == 1, "unexpected resync handler end"
    source = source.replace(old_end, new_end, 1)

    assert "preflight(" not in source
    assert source.count("adminOriginGuard(req)") == 1
    assert source.count("withAdminOriginAllowList(req,") == 2
    assert source.count("sync_creator_entitlement_from_stripe") == original.count("sync_creator_entitlement_from_stripe") == 1
    assert source.count("stripe.subscriptions") == original.count("stripe.subscriptions")
    path.write_text(source)


transform_refund(Path("supabase/functions/admin-refund-purchase/index.ts"))
transform_resync(Path("supabase/functions/admin-force-stripe-resync/index.ts"))
print("admin CORS boundaries transformed without changing financial operation counts")
