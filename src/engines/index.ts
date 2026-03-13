/**
 * ScrollLibrary AI Publishing OS
 * ================================
 * 6-Engine Architecture
 *
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
 *           ↓
 *   ScrollInstitution — Govern for organizational adoption
 */

// Core types
export type {
  EngineName,
  EngineStatus,
  EngineManifest,
  BookContext,
  ChapterContext,
  EngineResult,
  PipelineStage,
  PipelineEvent,
  PipelinePlan,
} from './types';

// Engine registry
export {
  ENGINE_REGISTRY,
  getPipelineOrder,
  getEnginesByStatus,
  getSystemHealth,
} from './registry';

// Engine modules (re-export organized feature maps)
export * as ScrollContent from './scroll-content';
export * as ScrollVisual from './scroll-visual';
export * as ScrollMastery from './scroll-mastery';
export * as ScrollIntegrity from './scroll-integrity';
export * as ScrollPublish from './scroll-publish';
export * as ScrollInstitution from './scroll-institution';
