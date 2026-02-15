/**
 * Shared sentence parsing utilities for audio sync and highlighting.
 * Single source of truth to guarantee identical sentence splitting.
 */

/** Strip markdown to plain text for sentence parsing */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')        // code blocks
    .replace(/`[^`]+`/g, '')               // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')  // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/#{1,6}\s*/g, '')             // headings
    .replace(/[*_]{1,3}/g, '')             // bold/italic
    .replace(/^\s*[-*>]\s+/gm, '')         // list / quote markers
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Split plain text into sentences */
export function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}
