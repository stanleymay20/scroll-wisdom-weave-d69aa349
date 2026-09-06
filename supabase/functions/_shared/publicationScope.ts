/**
 * Publication scope hash binding (TOCTOU protection).
 *
 * Publication gates inspect a manuscript state and later record an attestation.
 * Without binding, the attestation is written against the *then-current* hash,
 * which may differ from the state that was actually inspected. These helpers
 * capture the scope hash up-front and hand it to the bound attestation RPC,
 * which fails closed when the manuscript changed in the meantime.
 */

export const SCOPE_HASH_RE = /^[0-9a-f]{64}$/;

export interface ScopeRpcClient {
  // Structural, so both the raw supabase-js client and test doubles satisfy it.
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args?: any): PromiseLike<{ data: any; error: any }>;
}


export function isValidScopeHash(hash: unknown): hash is string {
  return typeof hash === "string" && SCOPE_HASH_RE.test(hash);
}

/**
 * Pure guard: the manuscript must be identical before and after loading it.
 * Returns null when stable, otherwise a human-readable fail-closed reason.
 */
export function scopeStabilityError(
  before: unknown,
  after: unknown,
): string | null {
  if (!isValidScopeHash(before) || !isValidScopeHash(after)) {
    return "PUBLICATION_SCOPE_UNAVAILABLE: unable to compute a publication scope hash.";
  }
  if (before !== after) {
    return "PUBLICATION_SCOPE_CHANGED: the manuscript changed while it was being loaded for review.";
  }
  return null;
}

async function computeHash(
  sc: ScopeRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await sc.rpc(fn, args);
  if (error) return null;
  return isValidScopeHash(data) ? data : null;
}

export function captureBookScopeHash(sc: ScopeRpcClient, bookId: string) {
  return computeHash(sc, "compute_book_publication_hash", { p_book_id: bookId });
}

export function captureChapterScopeHash(sc: ScopeRpcClient, chapterId: string) {
  return computeHash(sc, "compute_chapter_publication_hash", { p_chapter_id: chapterId });
}

/**
 * Capture a stable book hash: read it, run the loader, read it again, and
 * require both reads to match. Returns the bound hash or a failure reason.
 */
export async function captureStableBookScope<T>(
  sc: ScopeRpcClient,
  bookId: string,
  load: () => Promise<T>,
): Promise<{ hash: string; loaded: T } | { error: string }> {
  const before = await captureBookScopeHash(sc, bookId);
  const loaded = await load();
  const after = await captureBookScopeHash(sc, bookId);
  const err = scopeStabilityError(before, after);
  if (err) return { error: err };
  return { hash: after as string, loaded };
}

export interface BoundAttestationInput {
  bookId: string;
  userId: string;
  gate: "editorial" | "evidence" | "qa" | "structural" | "production" | "rights";
  status: "passed" | "blocked";
  expectedScopeHash: string;
  artifact?: Record<string, unknown>;
  sourceRecordId?: string | null;
  chapterId?: string | null;
}

/**
 * Record a scope-bound attestation. Returns an error message when the
 * attestation could not be recorded (including because the manuscript changed).
 */
export async function recordBoundAttestation(
  sc: ScopeRpcClient,
  input: BoundAttestationInput,
): Promise<string | null> {
  if (!isValidScopeHash(input.expectedScopeHash)) {
    return "PUBLICATION_SCOPE_UNAVAILABLE: missing expected publication scope hash.";
  }
  const { error } = await sc.rpc("record_publication_gate_attestation_bound", {
    p_book_id: input.bookId,
    p_user_id: input.userId,
    p_gate: input.gate,
    p_status: input.status,
    p_expected_scope_hash: input.expectedScopeHash,
    p_artifact: input.artifact ?? {},
    p_source_record_id: input.sourceRecordId ?? null,
    p_chapter_id: input.chapterId ?? null,
  });
  return error ? error.message : null;
}
