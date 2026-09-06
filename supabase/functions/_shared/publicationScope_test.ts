import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureBookScopeHash,
  isValidScopeHash,
  recordBoundAttestation,
  scopeStabilityError,
} from "./publicationScope.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function client(handler: (fn: string, args: any) => { data?: any; error?: any }) {
  const calls: Array<{ fn: string; args: any }> = [];
  return {
    calls,
    // deno-lint-ignore no-explicit-any
    rpc(fn: string, args?: any) {
      calls.push({ fn, args });
      const r = handler(fn, args);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
}

Deno.test("isValidScopeHash accepts only 64-char lowercase hex", () => {
  assertEquals(isValidScopeHash(HASH_A), true);
  assertEquals(isValidScopeHash(HASH_A.toUpperCase()), false);
  assertEquals(isValidScopeHash("abc"), false);
  assertEquals(isValidScopeHash(null), false);
});

Deno.test("scopeStabilityError passes when hashes match", () => {
  assertEquals(scopeStabilityError(HASH_A, HASH_A), null);
});

Deno.test("scopeStabilityError fails closed when the manuscript changed", () => {
  const err = scopeStabilityError(HASH_A, HASH_B);
  assertEquals(err?.startsWith("PUBLICATION_SCOPE_CHANGED"), true);
});

Deno.test("scopeStabilityError fails closed when a hash is unavailable", () => {
  assertEquals(
    scopeStabilityError(null, HASH_A)?.startsWith("PUBLICATION_SCOPE_UNAVAILABLE"),
    true,
  );
});

Deno.test("captureBookScopeHash returns null on rpc error or bad value", async () => {
  assertEquals(await captureBookScopeHash(client(() => ({ error: { message: "x" } })), "b"), null);
  assertEquals(await captureBookScopeHash(client(() => ({ data: "nope" })), "b"), null);
  assertEquals(await captureBookScopeHash(client(() => ({ data: HASH_A })), "b"), HASH_A);
});

Deno.test("recordBoundAttestation refuses to attest without a valid hash", async () => {
  const c = client(() => ({ data: "id" }));
  const err = await recordBoundAttestation(c, {
    bookId: "b", userId: "u", gate: "qa", status: "passed", expectedScopeHash: "",
  });
  assertEquals(err?.startsWith("PUBLICATION_SCOPE_UNAVAILABLE"), true);
  assertEquals(c.calls.length, 0);
});

Deno.test("recordBoundAttestation calls the bound RPC with the expected hash", async () => {
  const c = client(() => ({ data: "att-id" }));
  const err = await recordBoundAttestation(c, {
    bookId: "b", userId: "u", gate: "editorial", status: "blocked", expectedScopeHash: HASH_A,
  });
  assertEquals(err, null);
  assertEquals(c.calls[0].fn, "record_publication_gate_attestation_bound");
  assertEquals(c.calls[0].args.p_expected_scope_hash, HASH_A);
  assertEquals(c.calls[0].args.p_status, "blocked");
});

Deno.test("recordBoundAttestation surfaces PUBLICATION_SCOPE_CHANGED", async () => {
  const c = client(() => ({ error: { message: "PUBLICATION_SCOPE_CHANGED" } }));
  const err = await recordBoundAttestation(c, {
    bookId: "b", userId: "u", gate: "evidence", status: "passed", expectedScopeHash: HASH_A,
    chapterId: "c",
  });
  assertEquals(err, "PUBLICATION_SCOPE_CHANGED");
});
