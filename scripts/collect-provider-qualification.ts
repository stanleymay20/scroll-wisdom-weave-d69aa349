import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  QUALIFICATION_POLICIES,
  evaluateBookTypeQualification,
  type ProviderQualificationSample,
  type QualifiableBookType,
} from "../supabase/functions/_shared/provider-qualification.ts";
import {
  validateContract6Content,
  type GovernedBookType,
} from "../supabase/functions/_shared/contract6-governance.ts";

type ReviewEntry = {
  visualAssetGatePassed?: boolean;
  humanReview?: {
    reviewer: string;
    criticalIssues: number;
    dimensions: {
      contentIntegrity: number;
      coherence: number;
      typeFidelity: number;
      readerValue: number;
      editorialPolish: number;
    };
  };
};

type ReviewFile = {
  books?: Record<string, ReviewEntry>;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flags(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  });
  return values;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function codeBearing(content: string): boolean {
  return /\[CODE_BLOCK\][\s\S]*?\[\/CODE_BLOCK\]/i.test(content)
    || /```[\w+.-]*\s*\n[\s\S]*?```/.test(content);
}

function markdownImageCount(content: string): number {
  return (content.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
}

function comicPanelCount(content: string): number {
  const bracketed = content.match(/\[PANEL\s*\d+\]/gi) || [];
  const plain = content.match(/(?:^|\n)Panel\s+\d+\s*(?:\n|$)/gi) || [];
  return Math.max(bracketed.length, plain.length);
}

function comicPanelImageCount(content: string): number {
  return (content.match(/!\[Panel\s*\d+[^\]]*\]\([^)]+\)/gi) || []).length;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

const bookType = flag("--type") as QualifiableBookType | undefined;
const bookIds = flags("--book");
const outputPath = flag("--output") || "provider-qualification-evidence.json";
const reviewsPath = flag("--reviews");

if (!bookType || !(bookType in QUALIFICATION_POLICIES)) {
  throw new Error(
    "Usage: bun scripts/collect-provider-qualification.ts --type <book-type> --book <uuid> [--book <uuid> ...] [--reviews reviews.json] [--output evidence.json]",
  );
}
if (bookIds.length === 0) {
  throw new Error("At least one --book <uuid> is required.");
}

const url = requiredEnv("QUALIFICATION_SUPABASE_URL");
const serverSecret =
  process.env.QUALIFICATION_SUPABASE_SECRET_KEY?.trim()
  || process.env.QUALIFICATION_SUPABASE_SERVICE_ROLE_KEY?.trim();
const publishableKey = process.env.QUALIFICATION_SUPABASE_PUBLISHABLE_KEY?.trim();
const userJwt = process.env.QUALIFICATION_USER_JWT?.trim();

if (!serverSecret && (!publishableKey || !userJwt)) {
  throw new Error(
    "Provide QUALIFICATION_SUPABASE_SECRET_KEY (preferred) or QUALIFICATION_SUPABASE_SERVICE_ROLE_KEY (legacy), or both QUALIFICATION_SUPABASE_PUBLISHABLE_KEY and QUALIFICATION_USER_JWT.",
  );
}

const supabase = serverSecret
  ? createClient(url, serverSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : createClient(url, publishableKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${userJwt!}`,
        },
      },
    });

const reviews: ReviewFile = reviewsPath
  ? JSON.parse(readFileSync(reviewsPath, "utf8"))
  : {};

const samples: ProviderQualificationSample[] = [];

for (const bookId of bookIds) {
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id,book_type,total_chapters")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) throw new Error(`Book ${bookId}: ${bookError.message}`);
  if (!book) throw new Error(`Book ${bookId}: not found or not readable by the qualification user`);
  if (book.book_type !== bookType) {
    throw new Error(`Book ${bookId}: expected type ${bookType}, found ${book.book_type || "null"}`);
  }

  const { data: chapters, error: chapterError } = await supabase
    .from("chapters")
    .select("id,chapter_number,title,is_generated,content,version_number")
    .eq("book_id", bookId)
    .order("chapter_number", { ascending: true });

  if (chapterError) throw new Error(`Book ${bookId} chapters: ${chapterError.message}`);

  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .select("id,status,current_chapter,total_chapters,metadata,created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) throw new Error(`Book ${bookId} generation job: ${jobError.message}`);

  const { data: audit, error: auditError } = await supabase
    .from("book_audits")
    .select("certification_eligible,overall_score,created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (auditError) throw new Error(`Book ${bookId} editorial audit: ${auditError.message}`);

  const { data: qa, error: qaError } = await supabase
    .from("book_qa_reports")
    .select("status,score,blocker_count,warning_count,created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qaError) throw new Error(`Book ${bookId} publishability QA: ${qaError.message}`);

  const metadata = asRecord(job?.metadata);
  const publicationQuality = asRecord(metadata.publicationQuality);
  const reliability = asRecord(metadata.qualificationTelemetry);
  const telemetryComplete =
    Number.isFinite(Number(reliability.chapterAttempts))
    && Number(reliability.chapterAttempts) > 0
    && Number.isFinite(Number(reliability.chapterFailures));

  const chapterRows = chapters || [];
  const expectedChapters = numeric(book.total_chapters, chapterRows.length);
  const generatedChapters = chapterRows.filter(
    (chapter) => chapter.is_generated === true
      && typeof chapter.content === "string"
      && chapter.content.trim().length > 0,
  ).length;

  const codeChapters = chapterRows.filter(
    (chapter) => typeof chapter.content === "string" && codeBearing(chapter.content),
  );

  let codeAuditsPassed = 0;
  if (codeChapters.length > 0) {
    const { data: codeAudits, error: codeAuditError } = await supabase
      .from("chapter_code_audits")
      .select("chapter_id,content_hash,passed,risk_level,created_at")
      .in("chapter_id", codeChapters.map((chapter) => chapter.id))
      .eq("passed", true);

    if (codeAuditError) throw new Error(`Book ${bookId} code audits: ${codeAuditError.message}`);

    for (const chapter of codeChapters) {
      const content = typeof chapter.content === "string" ? chapter.content : "";
      const currentHash = sha256(content);
      const hasCurrentPass = (codeAudits || []).some(
        (row) => row.chapter_id === chapter.id
          && row.content_hash === currentHash
          && row.passed === true
          && row.risk_level !== "high",
      );
      if (hasCurrentPass) codeAuditsPassed++;
    }
  }

  const review = reviews.books?.[bookId] || {};
  const contractViolations = chapterRows.flatMap((chapter) => {
    const chapterContent = typeof chapter.content === "string" ? chapter.content : "";
    if (!chapter.is_generated || !chapterContent.trim()) {
      return [{ chapter: chapter.chapter_number, code: "INCOMPLETE_CHAPTER" }];
    }

    const result = validateContract6Content(
      chapterContent,
      bookType as GovernedBookType,
      typeof chapter.title === "string" ? chapter.title : undefined,
    );

    const blockers = result.violations
      .filter((violation) => violation.severity === "critical" || violation.severity === "high")
      .map((violation) => ({
        chapter: chapter.chapter_number,
        code: violation.code,
      }));

    const images = markdownImageCount(chapterContent);
    if (bookType === "illustrated" && images < 3) {
      blockers.push({ chapter: chapter.chapter_number, code: "ILLUSTRATED_VISUAL_DENSITY" });
    }
    if (bookType === "children" && images < 4) {
      blockers.push({ chapter: chapter.chapter_number, code: "CHILDREN_VISUAL_DENSITY" });
    }
    if (bookType === "comic") {
      const panels = comicPanelCount(chapterContent);
      const panelImages = comicPanelImageCount(chapterContent);
      if (panels < 4 || panelImages < 4 || panelImages / Math.max(1, panels) < 0.8) {
        blockers.push({ chapter: chapter.chapter_number, code: "COMIC_PANEL_IMAGE_COVERAGE" });
      }
    }

    return blockers;
  });
  const specializedContractPassed = contractViolations.length === 0;

  const currentReady =
    job?.status === "completed"
    && boolean(publicationQuality.ready);

  const structuralPassed = boolean(publicationQuality.structuralPassed);
  const rightsPassed = boolean(publicationQuality.rightsPassed);
  const productionPassed = boolean(publicationQuality.productionPassed);

  const revisions = chapterRows.reduce(
    (total, chapter) => total + Math.max(0, numeric(chapter.version_number, 1) - 1),
    0,
  );

  samples.push({
    sampleId: bookId,
    bookId,
    bookType,
    generation: {
      terminalStatus: job?.status === "completed"
        ? "completed"
        : job?.status === "failed"
          ? "failed"
          : "partial",
      expectedChapters,
      generatedChapters,
      chapterAttempts: telemetryComplete ? numeric(reliability.chapterAttempts) : 0,
      chapterFailures: telemetryComplete ? numeric(reliability.chapterFailures) : 1,
      regenerationPasses: revisions,
    },
    editorial: {
      certificationEligible: audit?.certification_eligible === true && currentReady,
      overallScore: numeric(audit?.overall_score),
    },
    publishability: {
      status: qa?.status === "ready" || qa?.status === "needs_review" || qa?.status === "blocked"
        ? qa.status
        : "blocked",
      score: numeric(qa?.score),
      blockerCount: numeric(qa?.blocker_count),
      warningCount: numeric(qa?.warning_count),
    },
    attestations: {
      editorial: currentReady && audit?.certification_eligible === true ? "passed" : audit ? "blocked" : "missing",
      evidence: QUALIFICATION_POLICIES[bookType].requiresEvidenceGate
        ? currentReady ? "passed" : "blocked"
        : "missing",
      qa: currentReady && qa?.status === "ready" ? "passed" : qa ? "blocked" : "missing",
      structural: structuralPassed ? "passed" : currentReady ? "blocked" : "missing",
      rights: rightsPassed ? "passed" : currentReady ? "blocked" : "missing",
      production: productionPassed ? "passed" : currentReady ? "blocked" : "missing",
    },
    specialized: {
      contractPassed: specializedContractPassed,
      codeAuditsRequired: bookType === "technical" ? codeChapters.length : undefined,
      codeAuditsPassed: bookType === "technical" ? codeAuditsPassed : undefined,
      visualAssetGatePassed: ["illustrated", "children", "comic"].includes(bookType)
        ? (rightsPassed && productionPassed && review.visualAssetGatePassed !== false)
        : undefined,
      notes: [
        telemetryComplete
          ? null
          : "Generation job lacks post-qualification chapter-attempt telemetry; regenerate a fresh qualification sample.",
        contractViolations.length
          ? `Contract 6 blockers: ${contractViolations.slice(0, 12).map((item) => `ch${item.chapter}:${item.code}`).join(", ")}`
          : null,
      ].filter(Boolean).join(" | ") || undefined,
    },
    humanReview: review.humanReview
      ? {
          reviewer: review.humanReview.reviewer,
          criticalIssues: numeric(review.humanReview.criticalIssues),
          score: (() => {
            const dimensions = review.humanReview!.dimensions;
            const values = [
              numeric(dimensions?.contentIntegrity),
              numeric(dimensions?.coherence),
              numeric(dimensions?.typeFidelity),
              numeric(dimensions?.readerValue),
              numeric(dimensions?.editorialPolish),
            ];
            return values.reduce((sum, value) => sum + value, 0) / values.length;
          })(),
        }
      : undefined,
  });
}

const result = evaluateBookTypeQualification(bookType, samples);
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  bookType,
  policy: QUALIFICATION_POLICIES[bookType],
  result,
  samples,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({
  output: outputPath,
  bookType,
  status: result.status,
  qualified: result.qualified,
  passingSamples: result.passingSamples,
  sampleCount: result.sampleCount,
  blockers: result.blockers,
}, null, 2));

if (!result.qualified) process.exitCode = 2;
