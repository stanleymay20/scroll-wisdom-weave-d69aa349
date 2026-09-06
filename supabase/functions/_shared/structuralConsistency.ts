export type ConsistencySeverity = "blocker" | "warning";

export interface ConsistencyIssue {
  severity: ConsistencySeverity;
  code: string;
  message: string;
  chapters: number[];
}

export interface ConsistencyChapter {
  chapter_number: number;
  title: string | null;
  content: string | null;
  word_count?: number | null;
  is_generated?: boolean | null;
}

export interface SemanticConsistencyReview {
  analysisComplete: boolean;
  status: "passed" | "blocked";
  blockers: Array<{ code: string; message: string; chapters: number[] }>;
  warnings: Array<{ code: string; message: string; chapters: number[] }>;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string): string {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/^chapter\s+\d+\s*[:.\-–—]?\s*/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function normalizeContent(value: string): string {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[`*_>#|~]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingleSet(value: string, width = 5, cap = 1600): Set<string> {
  const words = normalizeContent(value).split(" ").filter(Boolean);
  const shingles = new Set<string>();
  if (words.length < width) return shingles;

  // Sample deterministically across the whole chapter so long books do not
  // create unbounded memory while copied sections remain detectable.
  const total = words.length - width + 1;
  const stride = Math.max(1, Math.ceil(total / cap));
  for (let i = 0; i < total && shingles.size < cap; i += stride) {
    shingles.add(words.slice(i, i + width).join(" "));
  }
  return shingles;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const item of smaller) if (larger.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function actualWordCount(chapter: ConsistencyChapter): number {
  if (chapter.word_count && chapter.word_count > 0) return chapter.word_count;
  return (chapter.content || "").split(/\s+/).filter(Boolean).length;
}

export function deterministicConsistencyIssues(chapters: ConsistencyChapter[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  if (chapters.length === 0) {
    return [{
      severity: "blocker",
      code: "no_chapters",
      message: "The manuscript has no chapters to audit.",
      chapters: [],
    }];
  }

  const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const numberCounts = new Map<number, number>();
  for (const chapter of sorted) {
    numberCounts.set(chapter.chapter_number, (numberCounts.get(chapter.chapter_number) || 0) + 1);
  }
  const duplicatedNumbers = [...numberCounts.entries()].filter(([, count]) => count > 1).map(([n]) => n);
  if (duplicatedNumbers.length) {
    issues.push({
      severity: "blocker",
      code: "duplicate_chapter_numbers",
      message: `Duplicate chapter numbers detected: ${duplicatedNumbers.join(", ")}.`,
      chapters: duplicatedNumbers,
    });
  }

  const uniqueNumbers = [...new Set(sorted.map((chapter) => chapter.chapter_number))];
  const expected = Array.from({ length: uniqueNumbers.length }, (_, index) => index + 1);
  if (JSON.stringify(uniqueNumbers) !== JSON.stringify(expected)) {
    issues.push({
      severity: "blocker",
      code: "non_contiguous_chapter_numbers",
      message: `Chapter numbering is not contiguous from 1. Found: ${uniqueNumbers.join(", ")}.`,
      chapters: uniqueNumbers,
    });
  }

  const titles = new Map<string, number[]>();
  for (const chapter of sorted) {
    const title = normalizeTitle(chapter.title || "");
    const content = normalizeContent(chapter.content || "");

    if (!title) {
      issues.push({
        severity: "blocker",
        code: "missing_chapter_title",
        message: `Chapter ${chapter.chapter_number} has no usable title.`,
        chapters: [chapter.chapter_number],
      });
    } else {
      titles.set(title, [...(titles.get(title) || []), chapter.chapter_number]);
    }

    if (!chapter.is_generated || content.length < 200) {
      issues.push({
        severity: "blocker",
        code: "incomplete_chapter",
        message: `Chapter ${chapter.chapter_number} is missing generated publication content.`,
        chapters: [chapter.chapter_number],
      });
    }
  }

  for (const [title, nums] of titles) {
    if (nums.length > 1) {
      issues.push({
        severity: "blocker",
        code: "duplicate_chapter_titles",
        message: `Chapters ${nums.join(", ")} share the same normalized title (“${title}”).`,
        chapters: nums,
      });
    }
  }

  const substantial = sorted.filter((chapter) => actualWordCount(chapter) >= 300);
  const normalizedByChapter = new Map<number, string>();
  const shinglesByChapter = new Map<number, Set<string>>();
  for (const chapter of substantial) {
    normalizedByChapter.set(chapter.chapter_number, normalizeContent(chapter.content || ""));
    shinglesByChapter.set(chapter.chapter_number, shingleSet(chapter.content || ""));
  }

  for (let i = 0; i < substantial.length; i++) {
    for (let j = i + 1; j < substantial.length; j++) {
      const left = substantial[i];
      const right = substantial[j];
      const leftNormalized = normalizedByChapter.get(left.chapter_number) || "";
      const rightNormalized = normalizedByChapter.get(right.chapter_number) || "";

      if (leftNormalized && leftNormalized === rightNormalized) {
        issues.push({
          severity: "blocker",
          code: "duplicate_chapter_content",
          message: `Chapters ${left.chapter_number} and ${right.chapter_number} contain identical normalized content.`,
          chapters: [left.chapter_number, right.chapter_number],
        });
        continue;
      }

      const similarity = jaccard(
        shinglesByChapter.get(left.chapter_number) || new Set<string>(),
        shinglesByChapter.get(right.chapter_number) || new Set<string>(),
      );
      if (similarity >= 0.78) {
        issues.push({
          severity: "blocker",
          code: "near_duplicate_chapter_content",
          message: `Chapters ${left.chapter_number} and ${right.chapter_number} are ${(similarity * 100).toFixed(0)}% similar by sampled 5-word shingles.`,
          chapters: [left.chapter_number, right.chapter_number],
        });
      } else if (similarity >= 0.58) {
        issues.push({
          severity: "warning",
          code: "high_chapter_overlap",
          message: `Chapters ${left.chapter_number} and ${right.chapter_number} have unusually high content overlap (${(similarity * 100).toFixed(0)}%).`,
          chapters: [left.chapter_number, right.chapter_number],
        });
      }
    }
  }

  const counts = substantial.map(actualWordCount).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  if (median >= 800) {
    for (const chapter of substantial) {
      const count = actualWordCount(chapter);
      if (count < median * 0.3) {
        issues.push({
          severity: "warning",
          code: "chapter_length_outlier",
          message: `Chapter ${chapter.chapter_number} is ${count} words versus a manuscript median of ${median}.`,
          chapters: [chapter.chapter_number],
        });
      }
    }
  }

  return issues;
}

function extractSentences(content: string): string[] {
  return normalizeSpace(content)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25 && sentence.length <= 360);
}

function selectEvidenceSentences(content: string, max = 12): string[] {
  const candidates = extractSentences(content).filter((sentence) =>
    /\b(?:is defined as|refers to|means|is the|are the|consists of|equals|represents|denotes|19\d{2}|20\d{2}|\d+(?:\.\d+)?%|\$|€|£)\b/i.test(sentence)
  );
  return candidates.slice(0, max);
}

function headings(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,4}\s+\S/.test(line))
    .map((line) => line.replace(/^#{1,4}\s+/, ""))
    .slice(0, 16);
}

export function buildConsistencyDigest(chapters: ConsistencyChapter[], maxChars = 70_000): string {
  const records = [...chapters]
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((chapter) => {
      const content = normalizeSpace(chapter.content || "");
      return {
        chapterNumber: chapter.chapter_number,
        title: chapter.title || "",
        wordCount: actualWordCount(chapter),
        headings: headings(chapter.content || ""),
        opening: content.slice(0, 420),
        closing: content.slice(Math.max(0, content.length - 420)),
        consistencyClaims: selectEvidenceSentences(content),
      };
    });

  let serialized = JSON.stringify(records);
  if (serialized.length <= maxChars) return serialized;

  // Preserve every chapter while shrinking evidence, rather than silently
  // dropping late chapters from the consistency review.
  const compact = records.map((record) => ({
    ...record,
    headings: record.headings.slice(0, 8),
    opening: record.opening.slice(0, 180),
    closing: record.closing.slice(-180),
    consistencyClaims: record.consistencyClaims.slice(0, 5).map((claim) => claim.slice(0, 220)),
  }));
  serialized = JSON.stringify(compact);
  return serialized.length <= maxChars ? serialized : serialized.slice(0, maxChars);
}

export function parseSemanticConsistencyReview(raw: string): SemanticConsistencyReview | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || raw;
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return null;

  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    if (typeof parsed?.analysisComplete !== "boolean") return null;
    if (parsed?.status !== "passed" && parsed?.status !== "blocked") return null;
    if (!Array.isArray(parsed?.blockers) || !Array.isArray(parsed?.warnings)) return null;

    const normalizeIssues = (items: unknown[]) => items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        code: typeof item.code === "string" ? item.code : "semantic_consistency_issue",
        message: typeof item.message === "string" ? item.message : "Unspecified consistency issue",
        chapters: Array.isArray(item.chapters)
          ? item.chapters.filter((value): value is number => Number.isInteger(value as number))
          : [],
      }));

    return {
      analysisComplete: parsed.analysisComplete,
      status: parsed.status,
      blockers: normalizeIssues(parsed.blockers),
      warnings: normalizeIssues(parsed.warnings),
    };
  } catch {
    return null;
  }
}
