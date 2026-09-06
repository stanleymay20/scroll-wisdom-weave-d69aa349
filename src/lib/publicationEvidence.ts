import { supabase } from "@/integrations/supabase/client";
import { isAcademicCategory } from "@/lib/academicCategories";

export interface EvidenceBook {
  id: string;
  title: string;
  category: string;
  book_type: string | null;
  language: string | null;
}

export interface EvidenceChapter {
  id: string;
  chapter_number: number;
  title: string;
  content: string | null;
  is_generated: boolean | null;
  word_count: number | null;
  version_number?: number | null;
  chapter_references?: unknown;
}

interface ResearchSource {
  title?: string;
  authors?: string[];
  author?: string;
  year?: number;
  type?: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  verified?: boolean;
  peerReviewed?: boolean;
  database?: string;
}

interface ResearchResponse {
  sources?: ResearchSource[];
  metadata?: Record<string, unknown>;
  error?: string;
}

interface PersistedReference {
  author: string;
  title: string;
  year: number;
  type: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  verified?: boolean;
  peerReviewed?: boolean;
  database?: string;
}

interface ReferenceVerificationResponse {
  certificationBlocked?: boolean;
  hardFailures?: string[];
  claimIntegrityReport?: {
    analysisComplete?: boolean;
  };
  epistemicCoherenceReport?: {
    analysisComplete?: boolean;
  };
  error?: string;
}

export interface EvidenceResult {
  required: boolean;
  checked: number;
  passed: number;
  repaired: number;
  blockers: string[];
}

export function evidenceRequired(book: EvidenceBook): boolean {
  const type = (book.book_type || "text").toLowerCase();
  return (
    isAcademicCategory(book.category) ||
    ["academic", "technical", "reference", "professional"].includes(type)
  );
}

export async function loadEvidenceChapters(bookId: string): Promise<EvidenceChapter[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, chapter_number, title, content, is_generated, word_count, version_number, chapter_references")
    .eq("book_id", bookId)
    .order("chapter_number", { ascending: true });

  if (error) throw new Error(`Unable to load chapters for publication review: ${error.message}`);
  return (data || []) as EvidenceChapter[];
}

function normalizeResearchSources(sources: ResearchSource[]): PersistedReference[] {
  return sources
    .filter((source) => source.title && (source.doi || source.url))
    .slice(0, 20)
    .map((source) => ({
      author: source.authors?.filter(Boolean).join(", ") || source.author || "",
      title: source.title || "",
      year: source.year || new Date().getFullYear(),
      type: source.type || "article",
      doi: source.doi,
      url: source.url || (source.doi ? `https://doi.org/${source.doi}` : undefined),
      journal: source.journal,
      publisher: source.publisher,
      verified: source.verified,
      peerReviewed: source.peerReviewed,
      database: source.database,
    }))
    .filter((source) => source.author && source.title);
}

function formatSourceList(references: PersistedReference[]): string {
  return references
    .slice(0, 15)
    .map((source, index) => {
      const locator = source.doi
        ? ` DOI: ${source.doi}`
        : source.url
          ? ` URL: ${source.url}`
          : "";
      return `${index + 1}. ${source.author} (${source.year}). "${source.title}".${locator}`;
    })
    .join("\n");
}

async function researchChapter(
  book: EvidenceBook,
  chapter: EvidenceChapter,
): Promise<PersistedReference[]> {
  const { data, error } = await supabase.functions.invoke("deep-research", {
    body: {
      topic: `${book.title}: ${chapter.title}`,
      category: book.category,
      keyTopics: [chapter.title],
      mode: "full",
    },
  });

  if (error) throw new Error(`Research failed: ${error.message}`);
  const result = (data || {}) as ResearchResponse;
  if (result.error) throw new Error(`Research failed: ${result.error}`);

  const references = normalizeResearchSources(result.sources || []);
  if (references.length === 0) return [];

  const { error: persistError } = await supabase
    .from("chapters")
    .update({
      chapter_references: references as never,
      research_metadata: {
        ...(result.metadata || {}),
        publication_pipeline_research: true,
        researched_at: new Date().toISOString(),
      } as never,
    })
    .eq("id", chapter.id);

  if (persistError) throw new Error(`Could not persist researched evidence: ${persistError.message}`);
  return references;
}

async function rewriteChapterAroundEvidence(
  book: EvidenceBook,
  chapter: EvidenceChapter,
  references: PersistedReference[],
  priorFailures: string[] = [],
): Promise<boolean> {
  if (!chapter.content || references.length === 0) return false;

  const previousVersion = chapter.version_number || 1;
  const { error: versionError } = await supabase
    .from("chapters")
    .update({
      previous_content: chapter.content,
      version_number: previousVersion + 1,
    })
    .eq("id", chapter.id);

  if (versionError) return false;

  const editIntent = [
    "[CHIEF_EDITOR_REWRITE]",
    "EVIDENCE-INTEGRITY REWRITE. Revise this chapter so its material factual and empirical claims are traceable to the approved sources below.",
    "Use ONLY these sources for factual citations. Do not invent authors, titles, dates, DOIs, URLs, quotations, findings, statistics, or study results.",
    "Where a claim is not supported by the approved sources, remove it, narrow it, or explicitly label the uncertainty. Do not preserve unsupported certainty for stylistic reasons.",
    "Add natural APA-style in-text citations adjacent to the claims they support and maintain a complete References section.",
    "Preserve useful reasoning, voice, examples, and structure where they remain accurate. Return the COMPLETE revised chapter.",
    ...(priorFailures.length
      ? ["", "PREVIOUS VERIFICATION FAILURES TO RESOLVE:", ...priorFailures.map((item) => `- ${item}`)]
      : []),
    "",
    "APPROVED SOURCES:",
    formatSourceList(references),
  ].join("\n");

  const { data, error } = await supabase.functions.invoke("generate-chapter", {
    body: {
      chapterId: chapter.id,
      bookTitle: book.title,
      chapterTitle: chapter.title,
      chapterNumber: chapter.chapter_number,
      category: book.category,
      bookType: book.book_type || "text",
      language: book.language || "en",
      academicMode: true,
      citationStyle: "APA",
      regenerate: true,
      isRegeneration: true,
      originalContent: chapter.content,
      editIntent,
    },
  });

  if (error || data?.error) {
    await supabase
      .from("chapters")
      .update({
        previous_content: null,
        version_number: previousVersion,
      })
      .eq("id", chapter.id);
    return false;
  }

  return true;
}

async function verifyChapterReferences(
  book: EvidenceBook,
  chapter: EvidenceChapter,
  references: PersistedReference[],
): Promise<ReferenceVerificationResponse> {
  const { data, error } = await supabase.functions.invoke("verify-references", {
    body: {
      references,
      bookCategory: book.category,
      chapterContent: chapter.content || "",
    },
  });

  if (error) throw new Error(`Reference verification failed: ${error.message}`);
  const result = (data || {}) as ReferenceVerificationResponse;
  if (result.error) throw new Error(result.error);
  return result;
}

function verificationPassed(result: ReferenceVerificationResponse): boolean {
  const hardFailures = result.hardFailures || [];
  const incompleteClaims = result.claimIntegrityReport?.analysisComplete === false;
  const incompleteCoherence = result.epistemicCoherenceReport?.analysisComplete === false;
  return !result.certificationBlocked && hardFailures.length === 0 && !incompleteClaims && !incompleteCoherence;
}

export async function verifyPublicationEvidence(
  book: EvidenceBook,
  chapters: EvidenceChapter[],
  allowRepair: boolean,
): Promise<EvidenceResult> {
  const required = evidenceRequired(book);
  const blockers: string[] = [];
  let checked = 0;
  let passed = 0;
  let repaired = 0;

  for (const initialChapter of chapters) {
    let chapter = initialChapter;
    let references = Array.isArray(chapter.chapter_references)
      ? chapter.chapter_references as PersistedReference[]
      : [];

    if (references.length === 0 && required && allowRepair) {
      try {
        references = await researchChapter(book, chapter);
      } catch (error) {
        blockers.push(
          `Chapter ${chapter.chapter_number}: ${error instanceof Error ? error.message : "research failed"}`,
        );
        continue;
      }

      if (references.length > 0) {
        const repairedEvidence = await rewriteChapterAroundEvidence(book, chapter, references);
        if (!repairedEvidence) {
          blockers.push(`Chapter ${chapter.chapter_number}: sources were found but citation repair failed.`);
          continue;
        }
        repaired++;

        const refreshed = await loadEvidenceChapters(book.id);
        chapter = refreshed.find((item) => item.id === chapter.id) || chapter;
        references = Array.isArray(chapter.chapter_references)
          ? chapter.chapter_references as PersistedReference[]
          : references;
      }
    }

    if (references.length === 0) {
      if (required) blockers.push(`Chapter ${chapter.chapter_number}: no verifiable references are available.`);
      continue;
    }

    checked++;

    let result: ReferenceVerificationResponse;
    try {
      result = await verifyChapterReferences(book, chapter, references);
    } catch (error) {
      blockers.push(
        `Chapter ${chapter.chapter_number}: ${error instanceof Error ? error.message : "reference verification failed"}`,
      );
      continue;
    }

    if (verificationPassed(result)) {
      passed++;
      continue;
    }

    if (allowRepair) {
      const failures = result.hardFailures || ["Evidence verification did not reach certification quality."];
      const repairedEvidence = await rewriteChapterAroundEvidence(book, chapter, references, failures);
      if (repairedEvidence) {
        repaired++;
        const refreshed = await loadEvidenceChapters(book.id);
        chapter = refreshed.find((item) => item.id === chapter.id) || chapter;
        references = Array.isArray(chapter.chapter_references)
          ? chapter.chapter_references as PersistedReference[]
          : references;

        try {
          result = await verifyChapterReferences(book, chapter, references);
        } catch (error) {
          blockers.push(
            `Chapter ${chapter.chapter_number}: ${error instanceof Error ? error.message : "reference verification failed after repair"}`,
          );
          continue;
        }

        if (verificationPassed(result)) {
          passed++;
          continue;
        }
      }
    }

    const details = (result.hardFailures || []).length > 0
      ? (result.hardFailures || []).join("; ")
      : "claim/evidence analysis did not reach certification quality";
    blockers.push(`Chapter ${chapter.chapter_number}: evidence gate blocked — ${details}.`);
  }

  if (required && checked === 0 && blockers.length === 0) {
    blockers.push("Evidence verification could not run because the book has no persisted chapter references.");
  }

  return { required, checked, passed, repaired, blockers };
}
