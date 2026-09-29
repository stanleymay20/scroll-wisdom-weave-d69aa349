export interface NormalizedOutlineChapter {
  chapterNumber: number;
  title: string;
  description: string;
  keyTopics: string[];
}

export interface NormalizedBookOutline {
  bookTitle: string;
  bookDescription: string;
  chapters: NormalizedOutlineChapter[];
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\0/g, "").trim().slice(0, max)
    : "";
}

function fallbackTopics(index: number): string[] {
  return [
    `Core concept ${index}`,
    `Worked example ${index}`,
    `Practice and application ${index}`,
  ];
}

/**
 * Treat model outline JSON as a suggestion, never as authority.
 *
 * The requested/effective chapter count is server-owned. Models sometimes
 * over-return or under-return chapters even when explicitly instructed. This
 * normalizer guarantees exactly N chapters, sequential numbering, non-empty
 * titles/descriptions, and bounded topic strings before anything is persisted.
 */
export function normalizeGeneratedOutline(
  raw: unknown,
  chapterCount: number,
  fallbackTitle: string,
  fallbackDescription: string,
): NormalizedBookOutline {
  if (!Number.isInteger(chapterCount) || chapterCount < 1 || chapterCount > 100) {
    throw new Error("chapterCount must be an integer between 1 and 100");
  }

  const obj = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const rawChapters = Array.isArray(obj.chapters) ? obj.chapters : [];
  const chapters: NormalizedOutlineChapter[] = [];

  for (let i = 0; i < chapterCount; i++) {
    const source = rawChapters[i] && typeof rawChapters[i] === "object" && !Array.isArray(rawChapters[i])
      ? rawChapters[i] as Record<string, unknown>
      : {};

    const chapterNumber = i + 1;
    const title = cleanText(source.title, 220) || `Chapter ${chapterNumber}`;
    const description = cleanText(source.description, 1200) || "Content pending generation";

    const topics = Array.isArray(source.keyTopics)
      ? source.keyTopics
          .map((topic) => cleanText(topic, 180))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    chapters.push({
      chapterNumber,
      title,
      description,
      keyTopics: topics.length > 0 ? topics : fallbackTopics(chapterNumber),
    });
  }

  return {
    bookTitle: cleanText(obj.bookTitle, 220) || cleanText(fallbackTitle, 220) || "Untitled Book",
    bookDescription:
      cleanText(obj.bookDescription, 2400)
      || cleanText(fallbackDescription, 2400)
      || "A comprehensive exploration of the topic",
    chapters,
  };
}
