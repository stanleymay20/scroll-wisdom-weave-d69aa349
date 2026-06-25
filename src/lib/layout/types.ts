// Browser mirror of the layout engine. The Deno modules use `.ts` import
// suffixes which Vite tolerates but TS prefers extension-less; we re-export
// from a single barrel and let bundlers strip the extensions.
export type {
  SemanticBlock, BlockKind,
} from "../../../supabase/functions/_shared/layout/blocks.ts";
export type {
  ValidationIssue, ValidationReport, Severity, RuleCategory,
} from "../../../supabase/functions/_shared/layout/pageValidator.ts";
