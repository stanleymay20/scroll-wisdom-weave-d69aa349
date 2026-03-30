/**
 * Strip inline markdown formatting from text for display in cards/metadata.
 * Removes **, *, __, _, `, and other inline formatting artifacts.
 * NOT for full markdown-to-HTML conversion — just cleaning display text.
 */
export function stripMarkdownInline(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold**
    .replace(/__([^_]+)__/g, '$1')       // __bold__
    .replace(/\*([^*]+)\*/g, '$1')       // *italic*
    .replace(/_([^_]+)_/g, '$1')         // _italic_
    .replace(/~~([^~]+)~~/g, '$1')       // ~~strikethrough~~
    .replace(/`([^`]+)`/g, '$1')         // `code`
    .replace(/#{1,6}\s*/g, '')           // # headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // ![image](url)
    .replace(/^\s*[-*+]\s+/gm, '')       // list markers
    .replace(/^\s*\d+\.\s+/gm, '')       // numbered list markers
    .replace(/>\s*/g, '')                // blockquote markers
    .replace(/\n{2,}/g, ' ')            // collapse double newlines
    .replace(/\n/g, ' ')                // single newlines to spaces
    .replace(/\s{2,}/g, ' ')            // collapse whitespace
    .trim();
}
