# Live Database Inspection Report (read-only, no changes made)

All queries ran against the Live/production database (the one the published app uses; Test/preview is a separate instance).

## Results

1. **`public.generation_jobs` table** — does NOT exist in Live.
2. **`public.enforce_generation_job_completion_truth()` function** — does NOT exist in Live.
3. **`public.enforce_verified_publication_gate()` function** — does NOT exist in Live.
4. **Triggers `generation_jobs_truthful_completion` and `books_verified_publication_gate`** — neither exists in Live.
5. **Newest applied migration in Live** — `20260127034600` (top 5: 20260127034600, 20260127032706, 20260126215255, 20260121181947, 20260121181855). This is far behind Test, which has migrations into mid-2026.
6. **Tables `book_audits`, `book_qa_reports`, `chapter_references`** — all three do NOT exist in Live.

## Implication

Live is significantly behind Test. The `supabase--project_info` tool also reported "Migration drift: could not compare Test and Live migrations." The generation-jobs completion-truth and verified-publication-gate enforcement, plus the audit/QA/reference tables, exist only in Test and have not been published to Live. A publish (which applies Test migrations and edge functions to Live) is required to bring Live up to date.

## Actions taken
None. Read-only queries only; no files edited, no migrations applied, no database state changed.
