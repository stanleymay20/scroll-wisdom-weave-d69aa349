import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeSha256Hex } from "../../supabase/functions/_shared/export/hash";
import { recordExportEvent } from "../../supabase/functions/_shared/export/audit";

// Execute the actual handler's post-render delivery section without starting an
// Edge server or contacting storage/database services. Renderer tests cover the
// preceding section; this boundary catches early responses that skip auditing.
const source = readFileSync(resolve(process.cwd(), "supabase/functions/export-book/index.ts"), "utf8");
const start = source.indexOf("    const byteSize = renderedBytes.byteLength;");
const end = source.indexOf("\n  } catch (error) {", start);
if (start < 0 || end < start) throw new Error("Review delivery harness after handler restructuring");
const limit = Number(source.match(/const INLINE_EXPORT_MAX_BYTES = ([\d_]+);/)?.[1].replaceAll("_", ""));
if (!Number.isFinite(limit)) throw new Error("Cannot resolve actual inline export limit");
const delivery = ts.transpileModule(`async function deliver(context: Record<string, unknown>) {
  const { renderedBytes, req, supabase, uint8ArrayToBase64, computeSha256Hex, recordExportEvent } = context;
  const INLINE_EXPORT_MAX_BYTES = ${limit};
  const DIRECT_BINARY_EXPORT_HEADER = "x-scroll-export-response";
  const EXPORT_DOWNLOAD_URL_TTL_SECONDS = 1800;
  const user = { id: "disposable-user" }, bookId = "disposable-book", correlationId = "disposable-correlation";
  const format = "pdf", filename = "fixture.pdf", contentType = "application/pdf", corsHeaders = {};
  const canonicalPublicationId = null, canonicalCertificateId = null, canonicalWorkId = null;
  const canonicalRendererVersion = "canonical", canonicalFallbackUsed = false;
  const exportQualityStatus = "draft", exportQualityScore = null;
  let content = null, downloadUrl = null, storagePath = null, isBase64 = false;
  const buildExportStoragePath = () => "disposable-user/disposable-book/fixture.pdf";
${source.slice(start, end)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const deliver = new Function(`${delivery}; return deliver;`)() as (context: Record<string, unknown>) => Promise<Response>;

async function run(size: number, binary: boolean, auditFailure = false) {
  const bytes = new Uint8Array(size).fill(37);
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const upload = vi.fn(async () => ({ error: null }));
  const base64 = vi.fn((b: Uint8Array) => Buffer.from(b).toString("base64"));
  const signedUrl = vi.fn(async () => ({ error: null, data: { signedUrl: "https://storage.example.test/fixture.pdf" } }));
  const client = {
    from: (table: string) => ({ insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      if (auditFailure) throw new Error("Disposable audit failure");
      return { select: () => ({ single: async () => ({ data: { id: "export-event" }, error: null }) }) };
    } }),
    storage: { from: () => ({ upload, createSignedUrl: signedUrl }) },
  };
  const response = await deliver({
    renderedBytes: bytes,
    req: new Request("https://edge.example.test/export-book", { headers: binary ? { "x-scroll-export-response": "binary" } : {} }),
    supabase: client, uint8ArrayToBase64: base64, computeSha256Hex, recordExportEvent,
  });
  return { response, bytes, inserts, upload, base64, signedUrl };
}

function assertAudit(result: Awaited<ReturnType<typeof run>>) {
  const hash = createHash("sha256").update(result.bytes).digest("hex");
  expect(result.inserts.map(i => i.table)).toEqual(["exports", "authorship_audit_log"]);
  expect(result.inserts[0].row).toMatchObject({ file_hash: hash, book_id: "disposable-book" });
  expect(result.inserts[0].row.client_metadata).toMatchObject({ byte_size: result.bytes.length });
  expect(result.inserts[1].row.metadata).toMatchObject({ file_hash: hash, export_id: "export-event" });
}

describe("actual export-book delivery and integrity boundary", () => {
  beforeEach(() => vi.stubGlobal("crypto", webcrypto));
  afterEach(() => vi.unstubAllGlobals());
  it("audits a large direct binary file without storage or base64 allocation", async () => {
    const result = await run(limit + 1, true);
    assertAudit(result);
    expect(result.response.headers.get("content-type")).toBe("application/pdf");
    expect(result.response.headers.get("x-export-byte-size")).toBe(String(limit + 1));
    expect(Buffer.from(await result.response.arrayBuffer()).equals(Buffer.from(result.bytes))).toBe(true);
    expect(result.upload).not.toHaveBeenCalled();
    expect(result.base64).not.toHaveBeenCalled();
  });

  it.each([false, true])("retains inline JSON and auditing at the exact size threshold (binary=%s)", async binary => {
    const result = await run(limit, binary);
    const body = await result.response.json();
    assertAudit(result);
    expect(body.export_id).toBe("export-event");
    expect(Buffer.from(body.content, "base64").equals(Buffer.from(result.bytes))).toBe(true);
    expect(result.upload).not.toHaveBeenCalled();
  });

  it("retains signed storage delivery and audit metadata for large JSON downloads", async () => {
    const result = await run(limit + 1, false);
    const body = await result.response.json();
    assertAudit(result);
    expect(body.download_url).toBe("https://storage.example.test/fixture.pdf");
    expect(body.export_file_hash).toBe(result.inserts[0].row.file_hash);
    expect(result.upload).toHaveBeenCalledOnce();
    expect(result.signedUrl).toHaveBeenCalledOnce();
    expect(result.base64).not.toHaveBeenCalled();
  });

  it("preserves a successful binary download when the audit write fails", async () => {
    const result = await run(limit + 1, true, true);
    expect(result.inserts.map(i => i.table)).toEqual(["exports"]);
    expect(result.response.status).toBe(200);
    expect(Buffer.from(await result.response.arrayBuffer()).equals(Buffer.from(result.bytes))).toBe(true);
    expect(result.upload).not.toHaveBeenCalled();
    expect(result.base64).not.toHaveBeenCalled();
  });
});
