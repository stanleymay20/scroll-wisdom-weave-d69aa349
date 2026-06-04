// Locks the publisher-grade style audit contract.
// Each failure here means content that should have been flagged as
// "reads like LLM output" instead ships to a buyer.
import { describe, it, expect } from "vitest";
import {
  measureChapter, auditBookStyle, STYLE_THRESHOLDS,
} from "../../../supabase/functions/_shared/style-quality";

const goodProse =
  "She closed the door behind her. The street was quiet. A bus hissed somewhere down the avenue. " +
  "She walked to the kerb and waited. Someone passed her, eyes down. She caught the smell of rain on the asphalt. " +
  "By the time the bus arrived she had decided. The ticket clattered into the machine. The driver nodded once.\n\n" +
  "On the upper deck the windows were misted. She drew a small square on the glass and watched the world go by.";

describe("measureChapter — basic counts", () => {
  it("counts words, sentences, paragraphs", () => {
    const m = measureChapter(1, goodProse);
    expect(m.words).toBeGreaterThan(50);
    expect(m.sentences).toBeGreaterThan(8);
    expect(m.paragraphs).toBe(2);
  });

  it("reading grade is reasonable for plain prose", () => {
    const m = measureChapter(1, goodProse);
    // Short-sentence single-syllable prose can dip well below the typical
    // FK floor — accept anything in the legal range, just not NaN/garbage.
    expect(Number.isFinite(m.reading_grade)).toBe(true);
    expect(m.reading_grade).toBeGreaterThan(0);
    expect(m.reading_grade).toBeLessThan(20);
  });
});

describe("measureChapter — clichés", () => {
  it("catches 'delve into' / 'tapestry' / 'in conclusion'", () => {
    const text = "Let us delve into the rich tapestry of ideas. " +
      "In conclusion, the realm of philosophy stands as a testament to human curiosity. " +
      "We will navigate the landscape together. The intricate dance of thought is captivating.";
    const m = measureChapter(1, text);
    expect(m.cliches.count).toBeGreaterThanOrEqual(5);
    expect(m.cliches.samples).toEqual(expect.arrayContaining(["delve into"]));
  });

  it("does not over-flag innocuous prose", () => {
    const m = measureChapter(1, goodProse);
    expect(m.cliches.count).toBe(0);
  });
});

describe("measureChapter — em-dash density", () => {
  it("counts em-dashes", () => {
    const text = "She paused—then ran. The dog—the same one—barked. He stopped—again.";
    const m = measureChapter(1, text);
    expect(m.em_dashes.count).toBe(4);
    expect(m.em_dashes.per_1k_words).toBeGreaterThan(0);
  });
});

describe("measureChapter — adverbs", () => {
  it("counts -ly adverbs but skips false positives", () => {
    const text = "She walked slowly, then quietly closed the door — really, only family knew.";
    const m = measureChapter(1, text);
    // 'slowly', 'quietly' — true adverbs. 'really', 'family', 'only' — excluded.
    expect(m.adverbs.count).toBe(2);
  });
});

describe("measureChapter — passive voice", () => {
  it("flags 'was killed', 'were seen'", () => {
    const text = "The door was opened. Three men were seen. The window was broken at midnight.";
    const m = measureChapter(1, text);
    expect(m.passive.count).toBeGreaterThanOrEqual(2);
  });

  it("doesn't flag active voice", () => {
    const text = "She opened the door. He saw three men. Someone broke the window at midnight.";
    const m = measureChapter(1, text);
    expect(m.passive.count).toBe(0);
  });
});

describe("measureChapter — sentence-starter repetition", () => {
  it("catches She/She/She/She runs", () => {
    const text = "She walked. She paused. She turned. She listened. She closed the door.";
    const m = measureChapter(1, text);
    expect(m.starter_repetition.longest_run).toBeGreaterThanOrEqual(4);
    expect(m.starter_repetition.runs).toBeGreaterThanOrEqual(1);
  });

  it("does not flag varied starters", () => {
    const m = measureChapter(1, goodProse);
    expect(m.starter_repetition.longest_run).toBeLessThan(3);
  });
});

describe("measureChapter — paragraph rhythm", () => {
  it("flags walls of text >400 words", () => {
    const wall = ("word ".repeat(450)).trim();
    const m = measureChapter(1, wall + "\n\nShort follow-up.");
    expect(m.paragraph_rhythm.walls).toBe(1);
  });

  it("flags chapters dominated by short fragments", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1}.`).join("\n\n");
    const m = measureChapter(1, text);
    expect(m.paragraph_rhythm.fragment_rate).toBeGreaterThan(0.5);
  });
});

describe("auditBookStyle — issues surface", () => {
  it("flags blocker on extreme cliché density", () => {
    const text = (
      "delve into the tapestry. " +
      "delve into the realm. " +
      "delve into the journey. " +
      "delve into the landscape. " +
      "delve into the world. "
    );
    const report = auditBookStyle([{ chapter_number: 1, content: text }]);
    expect(report.issues.some((i) => i.code === "cliche_density_high" && i.severity === "blocker")).toBe(true);
  });

  it("flags em-dash overuse as warning", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Word ${i}—word—word—word.`).join("\n\n");
    const report = auditBookStyle([{ chapter_number: 1, content: text }]);
    expect(report.issues.some((i) => i.code === "em_dash_overuse" || i.code === "em_dash_density")).toBe(true);
  });

  it("flags reading-grade variance across chapters", () => {
    const easy = "I like cats. Cats are nice. They are small. They sleep a lot. ".repeat(40);
    const hard = "The epistemological ramifications of post-structuralist hermeneutics necessarily implicate the interpretative paradigm. ".repeat(20);
    const report = auditBookStyle([
      { chapter_number: 1, content: easy },
      { chapter_number: 2, content: hard },
    ]);
    expect(report.totals.reading_grade_stddev).toBeGreaterThan(STYLE_THRESHOLDS.reading_grade_variance_warning);
    expect(report.issues.some((i) => i.code === "reading_grade_variance")).toBe(true);
  });

  it("clean prose produces no blocker issues", () => {
    const report = auditBookStyle([
      { chapter_number: 1, content: goodProse },
      { chapter_number: 2, content: goodProse },
    ]);
    expect(report.issues.filter((i) => i.severity === "blocker")).toEqual([]);
  });

  it("ignores code blocks when counting em-dashes", () => {
    const text = "Normal prose here.\n\n```\nflag --enable-foo --bar --baz --quux\n```\n\nMore prose.";
    const m = measureChapter(1, text);
    // Two ASCII dashes inside the code block; em-dash count should still be 0.
    expect(m.em_dashes.count).toBe(0);
  });
});
