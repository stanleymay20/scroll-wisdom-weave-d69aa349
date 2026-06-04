// Client mirror of supabase/functions/_shared/content-quality.ts.
//
// The edge bundle pipeline cleans content at export time; the in-app Quality
// Panel needs the same audit so creators see what the cleaner will do and
// what they need to fix by hand BEFORE they click Publish externally.
//
// Both modules share the same patterns. When the edge cleaner changes,
// update this file to match — the unit test asserts equality of the audit
// surface for fixture inputs.

export type ContentIssueSeverity = "blocker" | "warning" | "info";

export interface ContentIssue {
  severity: ContentIssueSeverity;
  code: string;
  message: string;
  chapter?: number;
  hint?: string;
}

const PREAMBLE_RE = new RegExp(
  "^\\s*(?:" +
    "(?:Sure|Certainly|Absolutely|Of course|Great|Awesome|Alright)[!,.]?\\s*" +
    "|(?:Here(?:'|’)s|Here you go|Below(?:\\s+is)?|This is)\\s+" +
    "|(?:I(?:'|’)?d be happy to|I(?:'|’)?ll|I will|Let me)\\s+(?:write|help|share|provide|give|craft|compose)\\s+" +
    "|As (?:requested|you asked)[,.]?\\s*" +
    "|Below(?:\\s+is)?\\s+(?:the\\s+)?(?:next\\s+)?chapter" +
  ")" +
  "[^\\n]*\\n\\n",
  "i",
);

const POSTAMBLE_RE = new RegExp(
  "(?:\\n\\n|^)\\s*(?:" +
    "(?:Let me know|Feel free to|If you(?:'|’)d like|I hope (?:this|that)|Would you like me|Hope (?:this|that))\\b[^\\n]*" +
    "|(?:That(?:'|’)s|This)\\s+(?:concludes|wraps up|ends|completes|finishes)\\b[^\\n]*" +
    "|\\[(?:Note|Editorial|Author|End of chapter)[^\\]]*\\]" +
    "|---?\\s*(?:Continued|To be continued)\\b[^\\n]*" +
  ")\\s*$",
  "i",
);

const SELF_REFERENCE_PATTERNS: Array<{ code: string; re: RegExp; message: string }> = [
  { code: "ai_self_reference",
    re: /\b(?:as an? AI|as a language model|I am an AI|I'm an AI|I am a language model|I'm a language model|as a large language model)\b/gi,
    message: "AI self-reference" },
  { code: "ai_refusal",
    re: /\b(?:I (?:cannot|can't|am unable to|won't)|I do not have the ability|I'm sorry,? (?:but )?I)\b[^.\n]{0,80}\b(?:assist|help|provide|generate|create|write|comply)\b/gi,
    message: "AI refusal phrase" },
];

const PLACEHOLDER_PATTERNS: Array<{ code: string; re: RegExp; message: string }> = [
  { code: "placeholder_tbd",   re: /\[\s*(?:TBD|TODO|FIXME|PENDING|PLACEHOLDER|WIP|XXX)\s*\]/gi,           message: "Unresolved placeholder" },
  { code: "placeholder_insert", re: /\[\s*(?:INSERT|ADD|REPLACE|FILL IN|REWRITE)\b[^\]\n]*\]/gi,            message: "Unfilled placeholder" },
  { code: "placeholder_note",  re: /\[\s*Note (?:to (?:self|editor|author|reader))?[:\s][^\]\n]*\]/gi,    message: "Editorial note left in body" },
  { code: "placeholder_word_count", re: /\[\s*(?:Word count|Words?|Length)\s*:?\s*\d[^\]\n]*\]/gi,        message: "Word-count marker left in body" },
];

const DANGEROUS_TAGS_RE = /<\s*(script|iframe|object|embed|style|link|meta)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi;
const ON_HANDLER_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

function resetGlobal(re: RegExp) { re.lastIndex = 0; }

export function auditChapterArtifacts(content: string | null | undefined, chapterNumber?: number): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (!content) return issues;
  const s = content.replace(/\r\n?/g, "\n");

  if (PREAMBLE_RE.test(s)) {
    issues.push({
      severity: "warning", code: "ai_preamble", chapter: chapterNumber,
      message: `Chapter ${chapterNumber ?? ""} starts with an AI-style preamble`,
      hint: 'Strip lines like "Sure! Here is the chapter:" before publishing.',
    });
  }
  if (POSTAMBLE_RE.test(s)) {
    issues.push({
      severity: "warning", code: "ai_postamble", chapter: chapterNumber,
      message: `Chapter ${chapterNumber ?? ""} ends with an AI-style postamble`,
      hint: 'Remove sign-offs like "Let me know if you\'d like me to expand…".',
    });
  }
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.re.test(s)) {
      issues.push({
        severity: "blocker", code: p.code, chapter: chapterNumber,
        message: `Chapter ${chapterNumber ?? ""}: ${p.message}`,
        hint: "Resolve all bracketed placeholders before publishing.",
      });
      resetGlobal(p.re);
    }
  }
  for (const p of SELF_REFERENCE_PATTERNS) {
    if (p.re.test(s)) {
      issues.push({
        severity: "warning", code: p.code, chapter: chapterNumber,
        message: `Chapter ${chapterNumber ?? ""}: ${p.message}`,
        hint: "Amazon flags AI self-references; rewrite in the book's voice.",
      });
      resetGlobal(p.re);
    }
  }
  if (DANGEROUS_TAGS_RE.test(s) || ON_HANDLER_RE.test(s)) {
    issues.push({
      severity: "blocker", code: "dangerous_html", chapter: chapterNumber,
      message: `Chapter ${chapterNumber ?? ""} contains script/style tags or event handlers`,
      hint: "Remove inline HTML — it won't render and triggers KDP rejection.",
    });
    resetGlobal(DANGEROUS_TAGS_RE);
    resetGlobal(ON_HANDLER_RE);
  }
  const fences = (s.match(/^[ \t]*```/gm) || []).length;
  if (fences % 2 !== 0) {
    issues.push({
      severity: "warning", code: "unclosed_code_fence", chapter: chapterNumber,
      message: `Chapter ${chapterNumber ?? ""} has an unclosed code fence`,
      hint: "Add a closing ``` — the bundle pipeline auto-fixes this but reader rendering will look wrong.",
    });
  }
  return issues;
}

export function auditBookArtifacts(
  chapters: Array<{ chapter_number: number; content: string | null }>,
): ContentIssue[] {
  const out: ContentIssue[] = [];
  for (const ch of chapters) out.push(...auditChapterArtifacts(ch.content, ch.chapter_number));
  return out;
}
