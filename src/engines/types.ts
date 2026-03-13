/**
 * ScrollLibrary AI Publishing OS — Engine Type Definitions
 * =========================================================
 * Shared types across all 6 engines:
 *   ScrollContent | ScrollVisual | ScrollMastery
 *   ScrollIntegrity | ScrollPublish | ScrollInstitution
 */

// ─── Engine Identity ─────────────────────────────────────
export type EngineName =
  | 'ScrollContent'
  | 'ScrollVisual'
  | 'ScrollMastery'
  | 'ScrollIntegrity'
  | 'ScrollPublish'
  | 'ScrollInstitution';

export type EngineStatus = 'active' | 'beta' | 'planned' | 'disabled';

export interface EngineManifest {
  name: EngineName;
  version: string;
  status: EngineStatus;
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
}

/** Chapter-level context for engine processing */
export interface ChapterContext {
  chapterId: string;
  chapterNumber: number;
  title: string;
  wordCount: number;
  bookContext: BookContext;
}

/** Result of any engine operation */
export interface EngineResult<T = unknown> {
  engine: EngineName;
  success: boolean;
  data?: T;
  errors?: string[];
  metrics?: Record<string, number>;
  timestamp: string;
}

// ─── Pipeline Orchestration ──────────────────────────────

export type PipelineStage =
  | 'content_generation'
  | 'visual_intelligence'
  | 'integrity_check'
  | 'mastery_assessment'
  | 'publishing_export'
  | 'institution_governance';

export interface PipelineEvent {
  stage: PipelineStage;
  engine: EngineName;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

/** Full pipeline execution plan */
export interface PipelinePlan {
  bookContext: BookContext;
  stages: PipelineStage[];
  skipReasons?: Partial<Record<PipelineStage, string>>;
}
