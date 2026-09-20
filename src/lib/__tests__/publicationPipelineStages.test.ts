/**
 * Which stages of the publication pipeline actually fire.
 *
 * This exists because three separate features in this codebase turned out to
 * be code that nothing called — the release-schedule worker, Stripe payouts,
 * and the proofreader, which was written, tested, deployed and then wired to
 * nothing. Each of those passed every check the repository had. None of them
 * ran.
 *
 * Unit tests prove a function is correct when called. Nothing proved it was
 * called. So this drives the real runPublicationQualityPipeline with every
 * Supabase call intercepted, and asserts on the recorded sequence of edge
 * functions: what fires, in what order, and under which conditions. An
 * orphaned stage fails here instead of shipping silently.
 *
 * It is not a substitute for generating a real book. The edge functions are
 * stubbed, so this proves orchestration, not that any of them work.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// A Supabase stand-in that records every call.
// ---------------------------------------------------------------------------

interface InvokeCall {
  fn: string;
  body: Record<string, unknown>;
}

const invokeCalls: InvokeCall[] = [];
let invokeHandler: (fn: string, body: Record<string, unknown>) => unknown = () => ({});
let tableHandler: (table: string) => unknown[] = () => [];

/**
 * Minimal PostgREST query-builder double.
 *
 * Every chained method returns `this` so the pipeline's real call shapes
 * (`.select().eq().order()`, `.select().eq().single()`) work unchanged, and the
 * builder resolves as a promise to whatever the table handler supplies.
 */
function queryBuilder(table: string) {
  const rows = () => tableHandler(table);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "in", "not", "is", "limit", "update", "insert", "upsert"]) {
    builder[method] = () => builder;
  }
  builder.single = () => Promise.resolve({ data: rows()[0] ?? null, error: rows().length ? null : { message: "no rows" } });
  builder.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(resolve);
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => queryBuilder(table),
    functions: {
      invoke: (fn: string, options?: { body?: Record<string, unknown> }) => {
        const body = options?.body ?? {};
        invokeCalls.push({ fn, body });
        return Promise.resolve({ data: invokeHandler(fn, body), error: null });
      },
    },
  },
}));

// Evidence verification reaches the network on its own; the pipeline's
// orchestration is what is under test, so it is held still here.
vi.mock("@/lib/publicationEvidence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publicationEvidence")>();
  return {
    ...actual,
    loadEvidenceChapters: vi.fn(async () => CHAPTERS),
    verifyPublicationEvidence: vi.fn(async () => ({
      required: true,
      checked: 2,
      passed: 2,
      repaired: 0,
      blockers: [],
    })),
  };
});

const BOOK = {
  id: "book-1",
  title: "A Real Book",
  category: "non_fiction",
  book_type: "academic",
  language: "en",
};

const CHAPTERS = [
  { id: "ch-1", chapter_number: 1, title: "One", content: "Body one.", is_generated: true },
  { id: "ch-2", chapter_number: 2, title: "Two", content: "Body two.", is_generated: true },
];

/** A run in which every gate passes, so the pipeline reaches the end. */
function happyPathHandler(fn: string): unknown {
  switch (fn) {
    case "chief-editor-audit":
      return {
        success: true,
        auditId: "audit-1",
        eligible: true,
        scores: { overall: 88, structural: 88, academic: 88, pedagogical: 88 },
        chapters: [],
      };
    case "proofread-chapter":
      return { success: true, changed: true, applied: 3 };
    case "qa-publishability-audit":
      return { report: { status: "ready", blockerCount: 0, score: 96 } };
    case "certify-production-render":
      // The pipeline refuses anything without an explicit boolean verdict, and
      // productionBlockers only clears on the literal status "ready".
      return { passed: true, status: "ready", score: 95, fileHash: "abc", pageCount: 120, issues: [] };
    case "finalize-publication-certification":
      return { ready: true, blockers: [] };
    default:
      return {};
  }
}

function namesOf(): string[] {
  return invokeCalls.map((call) => call.fn);
}

async function runPipeline() {
  const { runPublicationQualityPipeline } = await import("@/lib/publicationPipeline");
  const stages: string[] = [];
  const result = await runPublicationQualityPipeline({
    bookId: BOOK.id,
    maxRevisionPasses: 2,
    onStage: (stage) => stages.push(stage),
  });
  return { result, stages };
}

beforeEach(() => {
  invokeCalls.length = 0;
  invokeHandler = happyPathHandler;
  tableHandler = (table) => {
    if (table === "books") return [BOOK];
    if (table === "chapters") return CHAPTERS;
    return [];
  };
});

describe("publication pipeline stages", () => {
  it("runs every quality gate on a clean manuscript", async () => {
    const { result } = await runPipeline();

    // The point of the whole file: each of these is a stage that could quietly
    // stop being called, and nothing else in the repository would notice.
    expect(namesOf()).toContain("chief-editor-audit");
    expect(namesOf()).toContain("proofread-chapter");
    expect(namesOf()).toContain("qa-publishability-audit");
    expect(namesOf()).toContain("certify-production-render");
    expect(namesOf()).toContain("finalize-publication-certification");
    expect(result.ready).toBe(true);
  });

  it("proofreads every chapter, not just the first", async () => {
    await runPipeline();
    const proofread = invokeCalls.filter((call) => call.fn === "proofread-chapter");
    expect(proofread).toHaveLength(CHAPTERS.length);
    expect(proofread.map((call) => call.body.chapterId)).toEqual(["ch-1", "ch-2"]);
  });

  it("copyedits after the editorial audit and before anything is rendered", async () => {
    // Order is the design. The editorial repair path REGENERATES a chapter, so
    // a copyedit applied before it would be rewritten away; and the production
    // render must see the corrected prose, not the draft.
    await runPipeline();
    const names = namesOf();
    const firstProofread = names.indexOf("proofread-chapter");
    expect(names.indexOf("chief-editor-audit")).toBeLessThan(firstProofread);
    expect(firstProofread).toBeLessThan(names.indexOf("qa-publishability-audit"));
    expect(firstProofread).toBeLessThan(names.indexOf("certify-production-render"));
  });

  it("reports the copyedits it applied", async () => {
    const { result } = await runPipeline();
    expect(result.proofreading.chaptersProofread).toBe(2);
    expect(result.proofreading.chaptersChanged).toBe(2);
    expect(result.proofreading.correctionsApplied).toBe(6);
    expect(result.proofreading.failed).toBe(0);
  });

  it("announces the proofreading stage to the caller", async () => {
    // The UI renders these messages; a stage that never reports is invisible.
    const { stages } = await runPipeline();
    expect(stages).toContain("proofreading");
  });

  // -------------------------------------------------------------------------
  // Failure behaviour: copyediting must never be what blocks a publication.
  // -------------------------------------------------------------------------

  it("a failed copyedit is counted but does not block certification", async () => {
    invokeHandler = (fn, body) => {
      if (fn === "proofread-chapter") {
        return body.chapterId === "ch-1"
          ? { error: "AI credits exhausted", code: "credits_exhausted" }
          : { success: true, changed: true, applied: 2 };
      }
      return happyPathHandler(fn);
    };

    const { result } = await runPipeline();
    expect(result.proofreading.failed).toBe(1);
    expect(result.proofreading.chaptersProofread).toBe(1);

    // The editorial audit decides whether a book certifies. A missing comma
    // must not. Asserting on `ready` alone would not prove this — that bit is
    // owned by the server's finalizer — so the blocker list is checked too:
    // nothing about copyediting may appear in it.
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.blockers.join(" ")).not.toMatch(/copyedit|proofread/i);
    expect(namesOf()).toContain("certify-production-render");
  });

  it("a wholly failed copyedit pass still does not block the book", async () => {
    // Every chapter fails, which is the case most likely to be mistaken for a
    // publication-blocking problem.
    invokeHandler = (fn) =>
      fn === "proofread-chapter"
        ? { error: "AI credits exhausted", code: "credits_exhausted" }
        : happyPathHandler(fn);

    const { result } = await runPipeline();
    expect(result.proofreading.failed).toBe(2);
    expect(result.proofreading.chaptersProofread).toBe(0);
    expect(result.blockers).toEqual([]);
    expect(result.ready).toBe(true);
  });

  it("a blocked book is never blocked FOR a copyediting failure", async () => {
    // The sharpest form of the rule. When a book genuinely cannot certify, the
    // reasons shown to the author are editorial, evidential, publishability or
    // production — never that the copy editor could not reach its provider.
    // Checked on a failing run because a passing one discards the blocker list
    // entirely, so a copyedit blocker would be invisible there.
    invokeHandler = (fn) => {
      if (fn === "proofread-chapter") return { error: "AI credits exhausted", code: "credits_exhausted" };
      if (fn === "certify-production-render") {
        return {
          passed: false,
          status: "blocked",
          issues: [{ severity: "blocker", code: "page_overflow", message: "text runs past the trim box", page: 12 }],
        };
      }
      if (fn === "finalize-publication-certification") return { ready: false, blockers: [] };
      return happyPathHandler(fn);
    };

    const { result } = await runPipeline();
    expect(result.ready).toBe(false);
    expect(result.proofreading.failed).toBe(2);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers.join(" ")).toMatch(/page_overflow/);
    expect(result.blockers.join(" ")).not.toMatch(/copyedit|proofread/i);
  });

  it("an empty chapter is not counted as a copyedit failure", async () => {
    invokeHandler = (fn) =>
      fn === "proofread-chapter"
        ? { error: "Chapter has no content to proofread", code: "empty_chapter" }
        : happyPathHandler(fn);

    const { result } = await runPipeline();
    expect(result.proofreading.failed).toBe(0);
    expect(result.proofreading.chaptersChanged).toBe(0);
  });

  it("still renders when the copyeditor changes nothing", async () => {
    invokeHandler = (fn) =>
      fn === "proofread-chapter" ? { success: true, changed: false, applied: 0 } : happyPathHandler(fn);

    const { result } = await runPipeline();
    expect(result.proofreading.chaptersProofread).toBe(2);
    expect(result.proofreading.chaptersChanged).toBe(0);
    expect(result.ready).toBe(true);
  });

  // -------------------------------------------------------------------------
  // The early exits must not silently skip the gates either.
  // -------------------------------------------------------------------------

  it("does not proofread a manuscript that is not fully generated", async () => {
    tableHandler = (table) => {
      if (table === "books") return [BOOK];
      if (table === "chapters") return CHAPTERS;
      return [];
    };
    const evidence = await import("@/lib/publicationEvidence");
    vi.mocked(evidence.loadEvidenceChapters).mockResolvedValueOnce([
      { ...CHAPTERS[0] },
      { ...CHAPTERS[1], is_generated: false, content: "" },
    ] as never);

    const { result } = await runPipeline();
    expect(result.ready).toBe(false);
    expect(namesOf()).not.toContain("proofread-chapter");
    expect(result.blockers.join(" ")).toMatch(/chapters are generated/i);
  });
});
