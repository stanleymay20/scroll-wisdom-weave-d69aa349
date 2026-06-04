// Locks the AI/markdown content-quality contract for export-bound chapters.
// Each test names a specific failure that would otherwise reach a buyer.
import { describe, it, expect } from "vitest";
import {
  cleanChapterContent,
  cleanBookChapters,
  auditChapterArtifacts,
} from "../../../supabase/functions/_shared/content-quality";

describe("cleanChapterContent — AI preambles", () => {
  it("strips 'Sure! Here is the chapter:'", () => {
    const raw = "Sure! Here is the chapter you requested:\n\nThe storm began at midnight.";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned.startsWith("The storm began at midnight.")).toBe(true);
    expect(stats.preambles_stripped).toBe(1);
    expect(stats.changed).toBe(true);
  });

  it("strips 'Certainly! Below is the next chapter…'", () => {
    const raw = "Certainly! Below is the next chapter of your book.\n\nReal content here.";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("Real content here.");
  });

  it("strips \"Here's the chapter\" smart-quote variant", () => {
    const raw = "Here’s the chapter you asked for:\n\nReal opener.";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).toBe("Real opener.");
    expect(stats.preambles_stripped).toBe(1);
  });

  it("strips 'I'd be happy to write…'", () => {
    const raw = "I'd be happy to write this chapter for you.\n\nFirst paragraph.";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("First paragraph.");
  });

  it("does NOT touch content with no preamble", () => {
    const raw = "She walked into the room.\n\nAnd everything changed.";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).toBe("She walked into the room.\n\nAnd everything changed.");
    expect(stats.preambles_stripped).toBe(0);
    expect(stats.changed).toBe(false);
  });
});

describe("cleanChapterContent — AI postambles", () => {
  it("strips 'Let me know if you'd like…'", () => {
    const raw = "Final paragraph.\n\nLet me know if you'd like me to expand this section.";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).toBe("Final paragraph.");
    expect(stats.postambles_stripped).toBe(1);
  });

  it("strips 'I hope this helps'", () => {
    const raw = "End of chapter content here.\n\nI hope this helps! Want me to continue?";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("End of chapter content here.");
  });

  it("strips '[End of chapter]' editorial markers", () => {
    const raw = "Content.\n\n[End of chapter 3]";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("Content.");
  });

  it("strips '— To be continued'", () => {
    const raw = "Cliffhanger.\n\n--- To be continued in chapter 4";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("Cliffhanger.");
  });
});

describe("cleanChapterContent — placeholders", () => {
  it("strips [TBD] [TODO] [FIXME]", () => {
    const raw = "First line. [TBD] Last line. [TODO] Second sentence. [FIXME]";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/\[TBD\]|\[TODO\]|\[FIXME\]/);
    expect(stats.placeholders_found).toBe(3);
  });

  it("strips [INSERT example here]", () => {
    const raw = "Intro. [INSERT example here] Conclusion.";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/INSERT/i);
  });

  it("strips [Note to editor: rephrase]", () => {
    const raw = "Body. [Note to editor: this paragraph needs work]";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/Note to editor/);
  });

  it("strips [Word count: 1500]", () => {
    const raw = "Chapter body.\n\n[Word count: 1500]";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/Word count/);
  });

  it("preserves legitimate brackets like citation refs", () => {
    const raw = "As shown in [1] and [Smith 2023].";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toContain("[1]");
    expect(cleaned).toContain("[Smith 2023]");
  });
});

describe("cleanChapterContent — dangerous HTML", () => {
  it("strips <script> tags entirely", () => {
    const raw = "Hello\n<script>alert('xss')</script>\nWorld";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/alert/);
    expect(stats.dangerous_html_stripped).toBeGreaterThan(0);
  });

  it("strips <iframe>, <style>, <object>, <embed>", () => {
    const raw = "<iframe src=evil></iframe><style>x</style><object></object><embed/>";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/<iframe|<style|<object|<embed/i);
  });

  it("strips on-handlers like onerror=", () => {
    const raw = 'Image: <img src=x onerror="alert(1)" />';
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/onerror=/i);
    expect(cleaned).not.toMatch(/alert/);
  });

  it("neutralizes javascript: URIs", () => {
    const raw = '<a href="javascript:alert(1)">click</a>';
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/javascript:/i);
  });
});

describe("cleanChapterContent — markdown structural healing", () => {
  it("closes an unclosed code fence", () => {
    const raw = "Intro\n\n```js\nconst x = 1;\n";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).toMatch(/```js[\s\S]*```/);
    expect(stats.unclosed_code_fences_closed).toBe(1);
  });

  it("doesn't double-close already-closed fences", () => {
    const raw = "```\ncode\n```\n";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect((cleaned.match(/```/g) || []).length).toBe(2);
    expect(stats.unclosed_code_fences_closed).toBe(0);
  });

  it("removes empty headings", () => {
    const raw = "## Real heading\n\nBody\n\n###    \n\nMore body";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).not.toMatch(/^[ \t]*#+[ \t]*$/m);
    expect(stats.empty_headings_removed).toBe(1);
  });

  it("demotes a body H1 to H2 so the chapter title stays the only H1", () => {
    const raw = "# Body heading\n\nParagraph text.";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned.startsWith("## Body heading")).toBe(true);
  });

  it("does not demote H2/H3 inside the chapter body", () => {
    const raw = "## Section A\n\nText.\n\n### Subsection";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toContain("## Section A");
    expect(cleaned).toContain("### Subsection");
  });
});

describe("cleanChapterContent — typography", () => {
  it("normalizes ASCII '...' to '…'", () => {
    const raw = "Hold on...wait a moment...";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).toContain("…");
    expect(cleaned).not.toContain("...");
    expect(stats.smart_typography_applied).toBeGreaterThan(0);
  });

  it("converts double-hyphen between words to em-dash", () => {
    const raw = "She paused--for the first time--and listened.";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toContain("paused—for");
    expect(cleaned).toContain("time—and");
  });

  it("converts year ranges like 1990-2020 to en-dash", () => {
    const raw = "Between 1990-2020, everything changed.";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toContain("1990–2020");
  });

  it("does NOT touch dashes inside code blocks", () => {
    const raw = "```\nflag --enable-foo\n```";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toContain("--enable-foo");
  });

  it("strips zero-width characters and BOMs", () => {
    const raw = "﻿Hello​world‌!";
    const { cleaned, stats } = cleanChapterContent(raw);
    expect(cleaned).toBe("Helloworld!");
    expect(stats.zero_width_chars_removed).toBe(3);
  });
});

describe("cleanChapterContent — whitespace", () => {
  it("normalizes CRLF line endings to LF", () => {
    const raw = "line1\r\nline2\r\nline3";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).not.toContain("\r");
  });

  it("collapses triple+ blank lines to a single blank line", () => {
    const raw = "para1\n\n\n\n\npara2";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("para1\n\npara2");
  });

  it("trims trailing whitespace per line", () => {
    const raw = "para1   \npara2\t\t";
    const { cleaned } = cleanChapterContent(raw);
    expect(cleaned).toBe("para1\npara2");
  });
});

describe("cleanChapterContent — idempotency", () => {
  it("a cleaned chapter is a fixed point", () => {
    const raw = "Sure! Here's the chapter:\n\n# Body H1\n\nWith [TBD] markers and ```code\nblock";
    const first = cleanChapterContent(raw).cleaned;
    const second = cleanChapterContent(first).cleaned;
    expect(second).toBe(first);
  });

  it("returns empty string for null/undefined input", () => {
    expect(cleanChapterContent(null).cleaned).toBe("");
    expect(cleanChapterContent(undefined).cleaned).toBe("");
  });
});

describe("auditChapterArtifacts", () => {
  it("flags ai_self_reference as warning", () => {
    const issues = auditChapterArtifacts("As an AI, I cannot pretend to know how she felt.", 1);
    expect(issues.some((i) => i.code === "ai_self_reference" && i.severity === "warning")).toBe(true);
  });

  it("flags placeholders as blockers", () => {
    const issues = auditChapterArtifacts("Content with [TBD] inside.", 2);
    expect(issues.some((i) => i.code === "placeholder_tbd" && i.severity === "blocker")).toBe(true);
  });

  it("flags dangerous HTML as blocker", () => {
    const issues = auditChapterArtifacts("<script>x</script>", 3);
    expect(issues.some((i) => i.code === "dangerous_html" && i.severity === "blocker")).toBe(true);
  });

  it("flags unclosed code fences as warning", () => {
    const issues = auditChapterArtifacts("```js\ncode", 4);
    expect(issues.some((i) => i.code === "unclosed_code_fence")).toBe(true);
  });

  it("returns no issues for clean prose", () => {
    expect(auditChapterArtifacts("A perfectly ordinary paragraph.")).toEqual([]);
  });
});

describe("cleanBookChapters", () => {
  it("aggregates per-chapter stats and produces blocker issues for placeholders", () => {
    const chapters = [
      { chapter_number: 1, title: "One", content: "Sure! Here is chapter 1:\n\nClean body." },
      { chapter_number: 2, title: "Two", content: "Body with [TBD]." },
      { chapter_number: 3, title: "Three", content: "As an AI, I think..." },
    ];
    const { cleaned, report } = cleanBookChapters(chapters);
    expect(cleaned[0].content).toBe("Clean body.");
    expect(report.totals.preambles_stripped).toBe(1);
    expect(report.totals.placeholders_found).toBe(1);
    expect(report.totals.ai_self_references_found).toBeGreaterThanOrEqual(1);
    // Chapter 3 should produce a warning, not a blocker (self-reference is auditable, not auto-fixable)
    expect(report.issues.some((i) => i.severity === "warning" && i.code === "ai_self_reference")).toBe(true);
  });

  it("changed=true when any chapter changed", () => {
    const { report } = cleanBookChapters([
      { chapter_number: 1, title: "x", content: "Clean." },
      { chapter_number: 2, title: "x", content: "Sure! Here's the chapter:\n\nReal." },
    ]);
    expect(report.totals.changed).toBe(true);
  });

  it("changed=false when no chapter needed cleaning", () => {
    const { report } = cleanBookChapters([
      { chapter_number: 1, title: "x", content: "Clean paragraph one." },
      { chapter_number: 2, title: "x", content: "Clean paragraph two." },
    ]);
    expect(report.totals.changed).toBe(false);
  });
});
