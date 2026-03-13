/**
 * ScrollLibrary AI Publishing OS
 * ================================
 * 6-Engine Architecture
 *
 * Processing Pipeline:
 *   Topic / Source Material
 *           ↓
 *   ScrollContent    — Generate structured learning content
 *           ↓
 *   ScrollVisual     — Convert concepts into visual understanding
 *           ↓
 *   ScrollIntegrity  — Ensure academic trust and provenance
 *           ↓
 *   ScrollMastery    — Prove learning happened
 *           ↓
 *   ScrollPublish    — Package into publishable artifacts
 *
 * Governance Layer:
 *   ScrollInstitution — Supervisory controls around the pipeline
 */

// ─── Core Types ──────────────────────────────────────────
export type {
  EngineName,
  ProcessingEngineName,
  GovernanceEngineName,
  EngineStatus,
  EngineLayer,
  EngineManifest,
  BookContext,
  ChapterContext,
  EngineResult,
  EngineModule,
  PipelineStage,
  GovernanceCheck,
  PipelineEvent,
  PipelinePlan,
  PipelineRunResult,
} from './types';

export { STAGE_ENGINE_MAP } from './types';

// ─── Engine Registry ─────────────────────────────────────
export {
  ENGINE_REGISTRY,
  getProcessingPipeline,
  getGovernanceEngines,
  getPipelineOrder,
  getEnginesByStatus,
  getEnginesByLayer,
  getSystemHealth,
} from './registry';

// ─── Pipeline Runner ─────────────────────────────────────
export { PipelineRunner, pipelineRunner } from './pipeline-runner';

// ─── Executable Engine Modules ───────────────────────────
export {
  ScrollContentEngine,
  ScrollVisualEngine,
  ScrollIntegrityEngine,
  ScrollMasteryEngine,
  ScrollPublishEngine,
  ScrollInstitutionEngine,
} from './modules';

// ─── Feature Maps (re-exports for component access) ─────
export * as ScrollContent from './scroll-content';
export * as ScrollVisual from './scroll-visual';
export * as ScrollMastery from './scroll-mastery';
export * as ScrollIntegrity from './scroll-integrity';
export * as ScrollPublish from './scroll-publish';
export * as ScrollInstitution from './scroll-institution';
