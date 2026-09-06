import { supabase } from "@/integrations/supabase/client";
import { isAcademicCategory } from "@/lib/academicCategories";

export type PublicationStage =
  | "loading"
  | "editorial-audit"
  | "repairing"
  | "evidence-verification"
  | "publishability-qa"
  | "certified"
  | "blocked";

interface PublicationPipelineOptions {
  bookId: string;
  maxRevisionPasses?: number;
  onStage?: (stage: PublicationStage, message: string) => void;
}

interface AuditResponse {
  success?: boolean;
  auditId?: string;
  scores?: {
    structural?: number;
    academic?: number;
    pedagogical?: number;
    overall?: number;
  };
  penalties?: Array<{
    rule?: string;
    evidence?: string;
    chapterNumber?: number;
  }>;
  certificationEligible?: boolean;
  certificationBlockers?: string[];
  flaggedSections?: Array<{
    chapterNumber?: number;
    severity?: string;
    section?: string;
    issue?: string;
    suggestion?: string;
  }>;
  chapterSuggestions?: Array<{
    chapterNumber?: number;
    improvements?: string[];
  }>;
  error?: string;
}

interface QAResponse {
  report?: {
    status?: "ready" | "needs_review" | "blocked";
    score?: number;
    blocker_count?: number;
    warning_count?: number;
  };
  error?: string;
}

interface ReferenceVerificationResponse {
  certificationBlocked?: boolean;
  hardFailures?: string[];
  tier?: { tier?: string; label?: string };
  claimIntegrityReport?: {
    contradictions?: number;
    unsupportedEmpiricalClaims?: number;
    avgSupportScore?: number;
    analysisComplete?: boolean;
  };
  epistemicCoherenceReport?: {
    criticalConflicts?: number;
    coherenceScore?: number;
    analysisComplete?: boolean;
  };
  error?: string;
}

interface ChapterRow {
  id: string;
  chapter_number: number;
  title: string;
  content: string | null;
  is_generated: boolean | null;
  word_count: number | null;
  version_number?: number | null;
  chapter_references?: unknown;
}

interface BookRow {
  id: string;
  title: string;
  category: string;
  book_type: string | null;
  language: string | null;
}

export interface PublicationPipelineResult {
  ready: boolean;
  blockers: string[];
  revisionPasses: number;
  editorial: {
    eligible: boolean;
    score: number | null;
    auditId: string | null;
  };
  evidence: {
    required: boolean;
    checkedChapters: number;
    passedChapters: number;
  };
  publishability: {
    status: string | null;
    score: number | null;
  };
}

function report(
  onStage: PublicationPipelineOptions["onStage"],
  stage: PublicationStage,
  message: string,
) {
  onStage?.(stage, message);
}

function isEvidenceRequired(book: BookRow): boolean {
  const type = (book.book_type || "text").toLowerCase();
  return (
    isAcademicCategory(book.category) ||
    ["academic", "technical", "reference", "professional"].includes(type)
  );
}

async function runEditorialAudit(bookId: string): Promise<AuditResponse> {
  const { data, error } = await supabase.functions.invoke("chief-editor-audit", {
    body: { bookId, action: "audit" },
  });
  if (error) throw new Error(`Chief Editor audit failed: ${error.message}`);
  const audit = (data || {}) as AuditResponse;
  if (audit.error) throw new Error(`Chief Editor audit failed: ${audit.error}`);
  if (!audit.auditId) throw new Error("Chief Editor audit returned no audit ID");
  return audit;
}

function buildRepairPlan(audit: AuditResponse): Map<number, string[]> {
  const plan = new Map<number, string[]>();

  for (const suggestion of audit.chapterSuggestions || []) {
    if (!suggestion.chapterNumber) continue;
    const improvements = (suggestion.improvements || []).filter(Boolean);
    if (improvements.length > 0) {
      plan.set(suggestion.chapterNumber, [
        ...(plan.get(suggestion.chapterNumber) || []),
        ...improvements,
      ]);
    }
  }

  for (const penalty of audit.penalties || []) {
    if (!penalty.chapterNumber) continue;
    const instruction = [penalty.rule, penalty.evidence].filter(Boolean).join(": ");
    if (!instruction) continue;
    plan.set(penalty.chapterNumber, [
      ...(plan.get(penalty.chapterNumber) || []),
      `Resolve deterministic quality failure — ${instruction}`,
    ]);
  }

  for (const flagged of audit.flaggedSections || []) {
    if (!flagged.chapterNumber) continue;
    const instruction = [
      flagged.severity ? `[${flagged.severity}]` : "",
      flagged.section,
      flagged.issue,
      flagged.suggestion ? `Fix: ${flagged.suggestion}` : "",
    ].filter(Boolean).join(" ");
    if (!instruction) continue;
    plan.set(flagged.chapterNumber, [
      ...(plan.get(flagged.chapterNumber) || []),
      instruction,
    ]);
  }

  return plan;
}

async function repairFromAudit(
  book: BookRow,
  chapters: ChapterRow[],
  audit: AuditResponse,
): Promise<{ improved: number; failed: number }> {
  if (!audit.auditId) return { improved: 0, failed: 0 };

  const plan = buildRepairPlan(audit);
  let improved = 0;
  let failed = 0;

  for (const [chapterNumber, improvements] of plan) {
    const chapterMeta = chapters.find((chapter) => chapter.chapter_number === chapterNumber);
    if (!chapterMeta) continue;

    const { data: freshChapter, error: fetchError } = await supabase
      .from("chapters")
      .select("id, content, version_number, chapter_number, title")
      .eq("id", chapterMeta.id)
      .single();

    if (fetchError || !freshChapter?.content) {
      failed++;
      continue;
    }

    const previousVersion = freshChapter.version_number || 1;
    const { error: versionError } = await supabase
      .from("chapters")
      .update({
        previous_content: freshChapter.content,
        version_number: previousVersion + 1,
        audit_id: audit.auditId,
      })
      .eq("id", freshChapter.id);

    if (versionError) {
      failed++;
      continue;
    }

    const chapterPenalties = (audit.penalties || [])
      .filter((penalty) => penalty.chapterNumber === chapterNumber)
      .map((penalty) => `- ${penalty.rule || "Quality rule"}: ${penalty.evidence || "failed"}`);

    const chapterFlags = (audit.flaggedSections || [])
      .filter((flagged) => flagged.chapterNumber === chapterNumber)
      .map((flagged) =>
        `- ${flagged.section || "Section"}: ${flagged.issue || "quality issue"}${flagged.suggestion ? ` → ${flagged.suggestion}` : ""}`,
      );

    const editIntent = [
      "[CHIEF_EDITOR_REWRITE]",
      "You are performing an autonomous publication-quality repair.",
      `CURRENT BOOK AUDIT: overall=${audit.scores?.overall ?? "unknown"}/100, structural=${audit.scores?.structural ?? "unknown"}/100, academic=${audit.scores?.academic ?? "unknown"}/100, pedagogical=${audit.scores?.pedagogical ?? "unknown"}/100.`,
      "Repair the identified weaknesses without inventing facts, citations, quotations, dates, statistics, or sources.",
      "Preserve correct material. Improve only where the audit evidence requires it. Return a complete, coherent chapter.",
      "",
      "REQUIRED IMPROVEMENTS:",
      ...improvements.map((item) => `- ${item}`),
      ...(chapterPenalties.length ? ["", "DETERMINISTIC FAILURES:", ...chapterPenalties] : []),
      ...(chapterFlags.length ? ["", "FLAGGED SECTIONS:", ...chapterFlags] : []),
      "",
      "FINAL SELF-CHECK: remove repetition, unsupported certainty, generic filler, mechanical AI transitions, and unresolved placeholders before returning the chapter.",
    ].join("\n");

    const { data: generated, error: generationError } = await supabase.functions.invoke(
      "generate-chapter",
      {
        body: {
          chapterId: freshChapter.id,
          bookTitle: book.title,
          chapterTitle: freshChapter.title,
          chapterNumber: freshChapter.chapter_number,
          category: book.category,
          bookType: book.book_type || "text",
          language: book.language || "en",
          regenerate: true,
          isRegeneration: true,
          originalContent: freshChapter.content,
          editIntent,
        },
      },
    );

    if (generationError || generated?.error) {
      await supabase
        .from("chapters")
        .update({
          previous_content: null,
          version_number: previousVersion,
          audit_id: null,
        })
        .eq("id", freshChapter.id);
      failed++;
      continue;
    }

    improved++;
  }

  if (improved > 0) {
    await supabase
      .from("book_audits")
      .update({
        improvements_applied: true,
        improvements_applied_at: new Date().toISOString(),
      })
      .eq("id", audit.auditId);
  }

  return { improved, failed };
}

async function verifyEvidence(
  book: BookRow,
  chapters: ChapterRow[],
): Promise<{ required: boolean; checked: number; passed: number; blockers: string[] }> {
  const required = isEvidenceRequired(book);
  const blockers: string[] = [];
  let checked = 0;
  let passed = 0;

  for (const chapter of chapters) {
    const references = Array.isArray(chapter.chapter_references)
      ? chapter.chapter_references
      : [];

    if (references.length === 0) {
      if (required) {
        blockers.push(`Chapter ${chapter.chapter_number}: no verifiable references were produced.`);
      }
      continue;
    }

    checked++;
    const { data, error } = await supabase.functions.invoke("verify-references", {
      body: {
        references,
        bookCategory: book.category,
        chapterContent: chapter.content || "",
      },
    });

    if (error) {
      blockers.push(`Chapter ${chapter.chapter_number}: reference verification failed (${error.message}).`);
      continue;
    }

    const result = (data || {}) as ReferenceVerificationResponse;
    if (result.error) {
      blockers.push(`Chapter ${chapter.chapter_number}: ${result.error}`);
      continue;
    }

    const hardFailures = result.hardFailures || [];
    const incompleteClaims = result.claimIntegrityReport?.analysisComplete === false;
    const incompleteCoherence = result.epistemicCoherenceReport?.analysisComplete === false;

    if (result.certificationBlocked || hardFailures.length > 0 || incompleteClaims || incompleteCoherence) {
      const details = hardFailures.length > 0
        ? hardFailures.join("; ")
        : "claim/evidence analysis did not complete";
      blockers.push(`Chapter ${chapter.chapter_number}: evidence gate blocked — ${details}.`);
      continue;
    }

    passed++;
  }

  if (required && checked === 0) {
    blockers.push("Evidence verification could not run because the book has no persisted chapter references.");
  }

  return { required, checked, passed, blockers };
}

async function updateGenerationJob(
  bookId: string,
  ready: boolean,
  chapterCount: number,
  blockers: string[],
) {
  const { data: job } = await supabase
    .from("generation_jobs")
    .select("id, metadata")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return;

  const previousMetadata =
    job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata
      : {};

  await supabase
    .from("generation_jobs")
    .update({
      status: ready ? "completed" : "partial",
      current_chapter: chapterCount,
      completed_at: new Date().toISOString(),
      error_code: ready ? null : "QUALITY_GATE_FAILED",
      error_message: ready ? null : blockers.slice(0, 6).join(" | ").slice(0, 1000),
      metadata: {
        ...previousMetadata,
        publicationQuality: {
          ready,
          blockers: blockers.slice(0, 20),
          checkedAt: new Date().toISOString(),
        },
      },
    })
    .eq("id", job.id);
}

export async function runPublicationQualityPipeline({
  bookId,
  maxRevisionPasses = 2,
  onStage,
}: PublicationPipelineOptions): Promise<PublicationPipelineResult> {
  report(onStage, "loading", "Loading the complete manuscript for publication review…");

  const [{ data: bookData, error: bookError }, { data: chapterData, error: chapterError }] =
    await Promise.all([
      supabase
        .from("books")
        .select("id, title, category, book_type, language")
        .eq("id", bookId)
        .single(),
      supabase
        .from("chapters")
        .select("id, chapter_number, title, content, is_generated, word_count, version_number, chapter_references")
        .eq("book_id", bookId)
        .order("chapter_number", { ascending: true }),
    ]);

  if (bookError || !bookData) throw new Error("Unable to load the book for publication review.");
  if (chapterError) throw new Error(`Unable to load chapters for publication review: ${chapterError.message}`);

  const book = bookData as BookRow;
  let chapters = (chapterData || []) as ChapterRow[];
  const generated = chapters.filter((chapter) => chapter.is_generated && chapter.content);
  if (generated.length === 0) throw new Error("No generated chapters are available for publication review.");
  if (generated.length !== chapters.length) {
    throw new Error(`Only ${generated.length}/${chapters.length} chapters are generated. Complete the manuscript before certification.`);
  }

  report(onStage, "editorial-audit", "Chief Editor is auditing the complete manuscript…");
  let audit = await runEditorialAudit(bookId);
  let revisionPasses = 0;
  const blockers: string[] = [];

  while (!audit.certificationEligible && revisionPasses < maxRevisionPasses) {
    const plan = buildRepairPlan(audit);
    if (plan.size === 0) break;

    revisionPasses++;
    report(
      onStage,
      "repairing",
      `Repair pass ${revisionPasses}/${maxRevisionPasses}: rewriting only the chapters that failed editorial review…`,
    );

    const repair = await repairFromAudit(book, chapters, audit);
    if (repair.improved === 0) {
      blockers.push("Automatic editorial repair could not improve any flagged chapter.");
      break;
    }
    if (repair.failed > 0) {
      blockers.push(`${repair.failed} chapter repair(s) failed during pass ${revisionPasses}.`);
    }

    const { data: refreshed, error: refreshError } = await supabase
      .from("chapters")
      .select("id, chapter_number, title, content, is_generated, word_count, version_number, chapter_references")
      .eq("book_id", bookId)
      .order("chapter_number", { ascending: true });
    if (refreshError) throw new Error(`Unable to reload repaired chapters: ${refreshError.message}`);
    chapters = (refreshed || []) as ChapterRow[];

    report(onStage, "editorial-audit", `Re-auditing manuscript after repair pass ${revisionPasses}…`);
    audit = await runEditorialAudit(bookId);
  }

  if (!audit.certificationEligible) {
    blockers.push(...(audit.certificationBlockers || ["Chief Editor certification threshold was not reached."]));
  }

  report(onStage, "evidence-verification", "Verifying citations, claims, and evidence integrity…");
  const evidence = await verifyEvidence(book, chapters);
  blockers.push(...evidence.blockers);

  report(onStage, "publishability-qa", "Running deterministic publishability and rendering-risk checks…");
  const { data: qaData, error: qaError } = await supabase.functions.invoke(
    "qa-publishability-audit",
    { body: { bookId } },
  );
  if (qaError) throw new Error(`Publishability QA failed: ${qaError.message}`);
  const qa = (qaData || {}) as QAResponse;
  if (qa.error) throw new Error(`Publishability QA failed: ${qa.error}`);

  const qaReady = qa.report?.status === "ready" && (qa.report?.blocker_count || 0) === 0;
  if (!qaReady) {
    blockers.push(
      `Publishability QA is ${qa.report?.status || "incomplete"}${qa.report?.score != null ? ` (${qa.report.score}/100)` : ""}.`,
    );
  }

  const ready = Boolean(audit.certificationEligible && evidence.blockers.length === 0 && qaReady);
  await updateGenerationJob(bookId, ready, chapters.length, blockers);

  report(
    onStage,
    ready ? "certified" : "blocked",
    ready
      ? "Publication candidate passed editorial, evidence, and publishability gates."
      : "Draft is complete, but publication certification is blocked by unresolved quality issues.",
  );

  return {
    ready,
    blockers: [...new Set(blockers)],
    revisionPasses,
    editorial: {
      eligible: Boolean(audit.certificationEligible),
      score: audit.scores?.overall ?? null,
      auditId: audit.auditId ?? null,
    },
    evidence: {
      required: evidence.required,
      checkedChapters: evidence.checked,
      passedChapters: evidence.passed,
    },
    publishability: {
      status: qa.report?.status ?? null,
      score: qa.report?.score ?? null,
    },
  };
}
