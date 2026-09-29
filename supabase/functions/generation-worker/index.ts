import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretsMatch } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JobRow = {
  id: string;
  user_id: string;
  book_id: string;
  status: string;
  current_chapter: number;
  total_chapters: number;
  metadata: Record<string, unknown> | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 220))
    .filter(Boolean)
    .slice(0, 12);
}

function responseCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

function classifyGenerationFailure(status: number, payload: unknown): string {
  const code = responseCode(payload);
  if (status === 402 || code === "ai_credits_exhausted") return "AI_CREDITS_EXHAUSTED";
  if (status === 429 || code === "RATE_LIMITED") return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_GENERATION_FAILED";
  return "CHAPTER_GENERATION_FAILED";
}

function qualificationTelemetry(metadata: Record<string, unknown> | null): {
  chapterAttempts: number;
  chapterFailures: number;
} {
  const raw = metadata?.qualificationTelemetry;
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const attempts = Number(record.chapterAttempts);
  const failures = Number(record.chapterFailures);

  return {
    chapterAttempts: Number.isFinite(attempts) ? Math.max(0, Math.trunc(attempts)) : 0,
    chapterFailures: Number.isFinite(failures) ? Math.max(0, Math.trunc(failures)) : 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase configuration missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (!jobId) return json({ error: "jobId required" }, 400);

  const token = authHeader.slice("Bearer ".length).trim();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobData, error: jobError } = await supabase
    .from("generation_jobs")
    .select("id, user_id, book_id, status, current_chapter, total_chapters, metadata")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return json({ error: jobError.message }, 500);
  const job = jobData as JobRow | null;
  if (!job) return json({ error: "Generation job not found" }, 404);

  const isInternal = secretsMatch(token, SUPABASE_SERVICE_ROLE_KEY);
  if (!isInternal) {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "Invalid authentication" }, 401);
    }
    if (authData.user.id !== job.user_id) {
      return json({ error: "Not authorized for this generation job" }, 403);
    }
  }

  if (job.status === "completed") {
    return json({ success: true, state: "completed", jobId });
  }

  const workerToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_generation_job_step",
    {
      _job_id: jobId,
      _worker_token: workerToken,
      _lease_seconds: 300,
    },
  );

  if (claimError) return json({ error: claimError.message }, 500);
  if (claimed !== true) {
    return json({ success: true, state: "busy", jobId }, 202);
  }

  const releaseLease = async () => {
    await supabase.rpc("release_generation_job_lease", {
      _job_id: jobId,
      _worker_token: workerToken,
    });
  };

  try {
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, title, category, language, book_type, target_chapter_words")
      .eq("id", job.book_id)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book) throw new Error("Book not found");

    const { data: nextChapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id, chapter_number, title, is_generated, academic_mode, citation_style, generation_outline")
      .eq("book_id", job.book_id)
      .eq("is_generated", false)
      .order("chapter_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (chapterError) throw chapterError;

    if (!nextChapter) {
      const { count: generatedCount, error: countError } = await supabase
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("book_id", job.book_id)
        .eq("is_generated", true);
      if (countError) throw countError;

      await releaseLease();
      const metadata = {
        ...(job.metadata || {}),
        phase: "quality_review",
        draftCompletedAt: new Date().toISOString(),
      };
      const { error: finalUpdateError } = await supabase
        .from("generation_jobs")
        .update({
          status: "generating",
          current_chapter: generatedCount || job.total_chapters,
          metadata,
          error_code: null,
          error_message: null,
          completed_at: null,
        })
        .eq("id", jobId);
      if (finalUpdateError) throw finalUpdateError;

      return json({
        success: true,
        state: "quality_review",
        jobId,
        generatedChapters: generatedCount || 0,
      });
    }

    const outline = nextChapter.generation_outline && typeof nextChapter.generation_outline === "object"
      ? nextChapter.generation_outline as Record<string, unknown>
      : {};
    const chapterPayload = {
      internalGenerationJobId: jobId,
      chapterId: nextChapter.id,
      bookTitle: book.title || "",
      chapterTitle: nextChapter.title || "",
      chapterNumber: nextChapter.chapter_number || 1,
      keyTopics: safeTopics(outline.keyTopics),
      category: book.category || "general",
      language: book.language || "en",
      bookType: book.book_type || "text",
      academicMode: Boolean(nextChapter.academic_mode),
      citationStyle: nextChapter.citation_style || "APA",
      wordCount: Number(book.target_chapter_words) || 4000,
    };

    const telemetry = qualificationTelemetry(job.metadata);
    const attemptMetadata = {
      ...(job.metadata || {}),
      qualificationTelemetry: {
        chapterAttempts: telemetry.chapterAttempts + 1,
        chapterFailures: telemetry.chapterFailures,
      },
    };
    const { error: attemptTelemetryError } = await supabase
      .from("generation_jobs")
      .update({ metadata: attemptMetadata })
      .eq("id", jobId);
    if (attemptTelemetryError) throw attemptTelemetryError;

    const chapterResponse = await fetch(
      SUPABASE_URL + "/functions/v1/generate-chapter",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          "x-generation-worker-token": workerToken,
        },
        body: JSON.stringify(chapterPayload),
      },
    );

    const chapterResult = await chapterResponse.json().catch(() => ({}));
    if (!chapterResponse.ok || chapterResult?.error) {
      const errorCode = classifyGenerationFailure(chapterResponse.status, chapterResult);
      const message = String(
        chapterResult?.error || "Chapter generation failed with HTTP " + chapterResponse.status,
      ).slice(0, 1000);

      const failedMetadata = {
        ...attemptMetadata,
        qualificationTelemetry: {
          chapterAttempts: telemetry.chapterAttempts + 1,
          chapterFailures: telemetry.chapterFailures + 1,
        },
      };
      const { error: failureTelemetryError } = await supabase
        .from("generation_jobs")
        .update({ metadata: failedMetadata })
        .eq("id", jobId);
      if (failureTelemetryError) throw failureTelemetryError;

      await supabase.rpc("finish_generation_job_step", {
        _job_id: jobId,
        _worker_token: workerToken,
        _current_chapter: job.current_chapter || 0,
        _status: "partial",
        _error_code: errorCode,
        _error_message: message,
      });

      return json({
        success: false,
        state: "partial",
        jobId,
        chapterNumber: nextChapter.chapter_number,
        error: message,
        code: errorCode,
      }, chapterResponse.status >= 400 ? chapterResponse.status : 502);
    }

    const { count: generatedCount, error: progressError } = await supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("book_id", job.book_id)
      .eq("is_generated", true);
    if (progressError) throw progressError;

    const progress = generatedCount || 0;
    const { data: finished, error: finishError } = await supabase.rpc(
      "finish_generation_job_step",
      {
        _job_id: jobId,
        _worker_token: workerToken,
        _current_chapter: progress,
        _status: "generating",
        _error_code: null,
        _error_message: null,
      },
    );
    if (finishError) throw finishError;
    if (finished !== true) throw new Error("Generation worker lease was lost before progress commit");

    if (progress >= job.total_chapters) {
      const metadata = {
        ...(job.metadata || {}),
        phase: "quality_review",
        draftCompletedAt: new Date().toISOString(),
      };
      const { error: qualityHandoffError } = await supabase
        .from("generation_jobs")
        .update({
          status: "generating",
          current_chapter: progress,
          metadata,
          error_code: null,
          error_message: null,
          completed_at: null,
        })
        .eq("id", jobId);
      if (qualityHandoffError) throw qualityHandoffError;

      return json({
        success: true,
        state: "quality_review",
        jobId,
        generatedChapters: progress,
        chapterNumber: nextChapter.chapter_number,
      });
    }

    const continuation = fetch(
      SUPABASE_URL + "/functions/v1/generation-worker",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId }),
      },
    ).then(async (response) => {
      if (!response.ok) {
        console.error(
          "[GENERATION-WORKER] Continuation dispatch failed:",
          response.status,
          await response.text(),
        );
      }
    }).catch((error) => {
      console.error("[GENERATION-WORKER] Continuation dispatch exception:", error);
    });

    const edgeRuntime = (
      globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
      }
    ).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(continuation);
    } else {
      await continuation;
    }

    return json({
      success: true,
      state: "generating",
      jobId,
      generatedChapters: progress,
      chapterNumber: nextChapter.chapter_number,
    });
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : String(error);
    console.error("[GENERATION-WORKER] Fatal worker error:", internalMessage);

    // Never expose caught exception details to callers or user-readable job
    // state. Upstream/database errors can contain implementation details,
    // identifiers, query fragments, or other sensitive diagnostic context.
    const publicMessage =
      "Book generation could not continue. Retry generation or contact support with the job ID.";

    try {
      await supabase.rpc("finish_generation_job_step", {
        _job_id: jobId,
        _worker_token: workerToken,
        _current_chapter: job.current_chapter || 0,
        _status: "partial",
        _error_code: "GENERATION_WORKER_FAILED",
        _error_message: publicMessage,
      });
    } catch (finishError) {
      console.error("[GENERATION-WORKER] Failed to release lease after error:", finishError);
    }

    return json({
      success: false,
      state: "partial",
      jobId,
      error: publicMessage,
      code: "GENERATION_WORKER_FAILED",
    }, 500);
  }
});
