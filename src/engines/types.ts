/**
 * ScrollLibrary AI Publishing OS — Engine Type Definitions
 * =========================================================
 * Shared types across all engines:
 *   Processing: ScrollContent | ScrollVisual | ScrollMastery | ScrollIntegrity | ScrollPublish
 *   Governance: ScrollInstitution
 */

// ─── Engine Identity ─────────────────────────────────────
export type ProcessingEngineName =
  | 'ScrollContent'
  | 'ScrollVisual'
  | 'ScrollMastery'
  | 'ScrollIntegrity'
  | 'ScrollPublish';

export type GovernanceEngineName = 'ScrollInstitution';

export type EngineName = ProcessingEngineName | GovernanceEngineName;

export type EngineStatus = 'active' | 'beta' | 'planned' | 'disabled';

export type EngineLayer = 'processing' | 'governance';

export interface EngineManifest {
  name: EngineName;
  version: string;
  status: EngineStatus;
  layer: EngineLayer;
  description: string;
  capabilities: string[];
  gaps: string[];
  dependencies: EngineName[];
}

// ─── Cross-Engine Data Contracts ─────────────────────────

/** Shared book context passed between engines */
export interface BookContext {
  bookId: string;
  bookType: string;
  category: string;
  language: string;
  academicLevel?: string;
  targetAudience?: string;
  totalChapters: number;
  /** Optional chapter-level scope for single-chapter operations */
  chapterScope?: ChapterContext;
  /** Accumulated results from prior pipeline stages */
  priorResults?: EngineResult[];
}

/** Chapter-level context for engine processing */
export interface ChapterContext {
  chapterId: string;
  chapterNumber: number;
  title: string;
  wordCount: number;
}

/** Result of any engine operation */
export interface EngineResult<T = unknown> {
  engine: EngineName;
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
  metrics?: Record<string, number>;
  durationMs: number;
  timestamp: string;
}

// ─── Executable Engine Contract ──────────────────────────

/**
 * Every engine module must implement this interface.
 * Processing engines execute in pipeline order.
 * Governance engines run as supervisory checks at any stage.
 */
export interface EngineModule {
  readonly name: EngineName;
  readonly layer: EngineLayer;

  /** Pre-flight check: can this engine run given the current context? */
  canRun(context: BookContext): boolean;

  /** Execute the engine's core logic */
  execute(context: BookContext): Promise<EngineResult>;

  /** Optional: validate outputs from a prior engine */
  validate?(result: EngineResult, context: BookContext): EngineResult<{ valid: boolean; issues: string[] }>;
}

// ─── Pipeline Orchestration ──────────────────────────────

export type PipelineStage =
  | 'content_generation'
  | 'visual_intelligence'
  | 'integrity_check'
  | 'mastery_assessment'
  | 'publishing_export';

/** Governance is not a stage — it's a supervisory layer */
export type GovernanceCheck =
  | 'pre_generation'
  | 'post_certification'
  | 'reporting'
  | 'access_control';

export const STAGE_ENGINE_MAP: Record<PipelineStage, ProcessingEngineName> = {
  content_generation: 'ScrollContent',
  visual_intelligence: 'ScrollVisual',
  integrity_check: 'ScrollIntegrity',
  mastery_assessment: 'ScrollMastery',
  publishing_export: 'ScrollPublish',
};

export interface PipelineEvent {
  stage: PipelineStage | GovernanceCheck;
  engine: EngineName;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

/** Full pipeline execution plan */
export interface PipelinePlan {
  bookContext: BookContext;
  stages: PipelineStage[];
  governanceChecks: GovernanceCheck[];
  skipReasons?: Partial<Record<PipelineStage, string>>;
}

/** Result of a full pipeline run */
export interface PipelineRunResult {
  plan: PipelinePlan;
  results: EngineResult[];
  events: PipelineEvent[];
  totalDurationMs: number;
  success: boolean;
  failedAt?: PipelineStage;
}
