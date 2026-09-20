import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight,
  json,
  serverError,
  requireUser,
  validateBody,
  enforceDurableRateLimit,
  serviceClient,
  z,
} from "../_shared/http.ts";
import {
  applyCorrections,
  planWindows,
  summarizeByKind,
  type Correction,
} from "../_shared/proofread.ts";

/**
 * Line-level copyediting for a generated chapter.
 *
 * chief-editor-audit grades structure and reasoning; this grades sentences.
 * The two are deliberately separate passes because they want opposite
 * instruments: the auditor's repair path regenerates a chapter, which is right
 * for "this section does not justify its claim" and catastrophic for "this
 * sentence is missing a comma".
 *
 * The model here never returns prose. It returns corrections, which are
 * applied by _shared/proofread.ts under guards that reject anything
 * unfindable, ambiguous, oversized or aimed at a figure marker or citation.
 * The worst case is therefore a chapter that is corrected less than it could
 * have been, never one that is silently rewritten.
 */

const BodySchema = z.object({
  chapterId: z.string().uuid(),
});

/**
 * Copyediting is the last pass before a reader sees the text, so it does not
 * run on the cheapest model. Flash Lite is a competent drafter and a poor
 * proofreader — it misses agreement and tense errors that Flash catches — and
 * the whole point of this endpoint is the errors the existing pipeline misses.
 */
const getProofreadModelForPlan = (plan: string): string => {
  switch (plan) {
    case "prophet_tier":
    case "premium":
      return "google/gemini-2.5-pro";
    case "student":
    case "free":
    default:
      return "google/gemini-2.5-flash";
  }
};

/** Characters per window, and how much consecutive windows share. */
const WINDOW_SIZE = 6_000;
const WINDOW_OVERLAP = 400;

/**
 * Ceiling on AI calls for a single chapter.
 *
 * An unexpectedly long chapter must not turn one request into a hundred. The
 * cap is honoured by WIDENING the windows rather than dropping any, because
 * skipping text is the exact defect this endpoint was built to fix — a
 * proofreader with a blind spot is the bug, not the mitigation.
 */
const MAX_WINDOWS = 24;

function windowSizeFor(contentLength: number): number {
  const needed = Math.ceil(contentLength / MAX_WINDOWS) + WINDOW_OVERLAP;
  return Math.max(WINDOW_SIZE, needed);
}

/** A window that proposes more than this many corrections is not proofreading. */
const MAX_CORRECTIONS_PER_WINDOW = 40;

const SYSTEM_PROMPT =
  `You are a copy editor for ScrollLibrary. You correct mechanics. You do not rewrite, restructure, or re-argue.

You will be shown an excerpt of a book chapter. Return ONLY mechanical corrections:
- spelling: misspellings and typos
- grammar: broken syntax, comma splices, dangling modifiers, missing words
- punctuation: wrong or missing punctuation
- agreement: subject-verb and pronoun-antecedent disagreement
- tense: inconsistent tense within a passage
- repetition: a word or phrase repeated so closely it reads as an error
- clarity: a sentence that is ungrammatical or genuinely ambiguous as written

DO NOT propose:
- stylistic preferences, reordering, or "stronger" wording
- changes to facts, numbers, names, dates, claims or meaning
- changes to citations such as (Smith, 2020), figure markers, code, links or headings structure
- changes that make a passage longer for its own sake

RULES:
- "find" MUST be copied EXACTLY from the excerpt, character for character.
- "find" MUST be unique in the chapter. Include enough surrounding words to make it unique, but keep it under 200 characters.
- "replace" MUST be the corrected version of that exact text, and similar in length.
- If a passage is already correct, return no correction for it. Returning an empty list is a valid and common answer.

Respond ONLY with valid JSON:
{"corrections":[{"find":"<exact text>","replace":"<corrected text>","kind":"spelling|grammar|punctuation|agreement|tense|repetition|clarity","note":"<max 12 words>"}]}`;

function parseCorrections(raw: string): Correction[] {
  if (!raw) return [];
  let payload = raw.trim();

  // Models wrap JSON in fences often enough to be worth handling.
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) payload = fenced[1].trim();

  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(payload.slice(start, end + 1));
    const list = Array.isArray(parsed?.corrections) ? parsed.corrections : [];
    return list
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: Record<string, unknown>) => ({
        find: typeof item.find === "string" ? item.find : "",
        replace: typeof item.replace === "string" ? item.replace : "",
        // Not validated here on purpose: applyCorrections rejects any kind it
        // does not recognise, so there is exactly one place that decides what
        // a valid correction is.
        kind: item.kind as Correction["kind"],
        note: typeof item.note === "string" ? item.note.slice(0, 120) : undefined,
      }));
  } catch {
    return [];
  }
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const admin = serviceClient();

    // One call fans out to an AI request per window, so a long chapter is
    // several requests. Cap per user, durably: an in-memory limit would reset
    // on the cold start a caller can simply wait for.
    const limited = await enforceDurableRateLimit(admin, {
      name: "proofread-chapter",
      key: auth.userId,
      limit: 30,
      windowSec: 3600,
    });
    if (limited) return limited;

    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return serverError(new Error("LOVABLE_API_KEY not configured"), "ai_misconfigured");
    }

    const { data: chapter, error: chapterError } = await admin
      .from("chapters")
      .select("id, book_id, chapter_number, title, content, version_number")
      .eq("id", body.chapterId)
      .single();

    if (chapterError || !chapter) {
      return json({ error: "Chapter not found" }, 404);
    }
    if (!chapter.content || chapter.content.trim().length === 0) {
      return json({ error: "Chapter has no content to proofread", code: "empty_chapter" }, 400);
    }

    // Ownership is checked against the book, covering both the historical
    // creator_id authority and the newer user_id compatibility key.
    const { data: book, error: bookError } = await admin
      .from("books")
      .select("id, title, user_id, creator_id")
      .eq("id", chapter.book_id)
      .single();

    if (bookError || !book) return json({ error: "Book not found" }, 404);
    if (book.user_id !== auth.userId && book.creator_id !== auth.userId) {
      return json({ error: "You do not own this chapter" }, 403);
    }

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", auth.userId)
      .maybeSingle();
    const userPlan = (subscription?.status === "active" && subscription?.tier)
      ? String(subscription.tier)
      : "free";
    const model = getProofreadModelForPlan(userPlan);

    const original: string = chapter.content;
    const windows = planWindows(original, windowSizeFor(original.length), WINDOW_OVERLAP);

    console.log("[proofread-chapter] start", {
      chapterId: chapter.id.slice(0, 8),
      chars: original.length,
      windows: windows.length,
      model,
      plan: userPlan,
    });

    const proposed: Correction[] = [];
    let windowsFailed = 0;

    for (const segment of windows) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `Chapter ${chapter.chapter_number}: "${chapter.title}" (excerpt ${segment.index + 1} of ${windows.length})\n\n${segment.text}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 4000,
        }),
      });

      if (response.status === 402) {
        return json({ error: "AI credits exhausted", code: "credits_exhausted" }, 402);
      }
      if (response.status === 429) {
        return json({ error: "AI provider rate-limited", code: "ai_rate_limited" }, 429);
      }
      if (!response.ok) {
        // One bad window must not discard the corrections already gathered.
        windowsFailed++;
        console.error("[proofread-chapter] window failed", {
          window: segment.index,
          status: response.status,
        });
        continue;
      }

      const payload = await response.json().catch(() => null);
      const raw = payload?.choices?.[0]?.message?.content ?? "";
      const corrections = parseCorrections(raw).slice(0, MAX_CORRECTIONS_PER_WINDOW);
      proposed.push(...corrections);
    }

    // Corrections are applied against the whole chapter, not per window, so a
    // duplicate proposed by two overlapping windows collapses into one edit
    // and the second is rejected as a no-op or not_found.
    const result = applyCorrections(original, proposed);

    if (result.applied.length === 0) {
      console.log("[proofread-chapter] no corrections applied", {
        chapterId: chapter.id.slice(0, 8),
        proposed: proposed.length,
        rejected: result.rejected.length,
      });
      return json({
        success: true,
        changed: false,
        chapterId: chapter.id,
        windows: windows.length,
        windowsFailed,
        proposed: proposed.length,
        applied: 0,
        rejected: result.rejected.length,
        rejectionReasons: summarizeRejections(result.rejected),
      });
    }

    // Preserve the pre-proofread text exactly as the editorial repair path
    // does, so an author can always see and recover what was changed.
    const previousVersion = chapter.version_number || 1;
    const { error: updateError } = await admin
      .from("chapters")
      .update({
        previous_content: original,
        content: result.text,
        version_number: previousVersion + 1,
        word_count: result.text.split(/\s+/).filter(Boolean).length,
      })
      .eq("id", chapter.id);

    if (updateError) {
      console.error("[proofread-chapter] failed to persist", updateError);
      return serverError(new Error("Could not save proofread chapter"), "persist_failed");
    }

    console.log("[proofread-chapter] applied", {
      chapterId: chapter.id.slice(0, 8),
      applied: result.applied.length,
      rejected: result.rejected.length,
      changedChars: result.changedChars,
    });

    return json({
      success: true,
      changed: true,
      chapterId: chapter.id,
      versionNumber: previousVersion + 1,
      windows: windows.length,
      windowsFailed,
      proposed: proposed.length,
      applied: result.applied.length,
      rejected: result.rejected.length,
      changedChars: result.changedChars,
      byKind: summarizeByKind(result.applied),
      rejectionReasons: summarizeRejections(result.rejected),
      corrections: result.applied.map((correction) => ({
        kind: correction.kind,
        find: correction.find,
        replace: correction.replace,
        note: correction.note,
      })),
    });
  } catch (err) {
    return serverError(err, "proofread_failed");
  }
});

function summarizeRejections(
  rejected: Array<{ reason: string }>,
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const item of rejected) {
    summary[item.reason] = (summary[item.reason] || 0) + 1;
  }
  return summary;
}
