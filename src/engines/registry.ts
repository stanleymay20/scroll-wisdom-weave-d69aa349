/**
 * ScrollLibrary Engine Registry
 * ==============================
 * Central manifest of all engines, their capabilities,
 * current status, and identified gaps.
 *
 * Processing pipeline: Content → Visual → Integrity → Mastery → Publish
 * Governance layer:    Institution (supervisory, runs around pipeline)
 */

import type { EngineManifest, EngineLayer } from './types';

export const ENGINE_REGISTRY: Record<string, EngineManifest> = {

  // ═══════════════════════════════════════════════
  // PROCESSING ENGINES (execute in pipeline order)
  // ═══════════════════════════════════════════════

  ScrollContent: {
    name: 'ScrollContent',
    version: '3.0.0',
    status: 'active',
    layer: 'processing',
    description: 'Book-type-aware content generation with multi-pass intellectual pipeline',
    capabilities: [
      'Book-type-aware generation (10 types)',
      'Four-pass intellectual pipeline (Generate → Stress-Test → Compress → Audit)',
      'Genre-specific micro-contracts (Academic, Professional, Bestseller, etc.)',
      'Structural variation engine with randomized skeletons',
      'Instructional scaffolding (8-15 named constructs per chapter)',
      'Anti-repetition intro logic',
      'Language enforcement with mismatch retry',
      'Document upload and conversion (PDF/DOCX)',
      'Chapter continuity and cross-chapter context',
      'Concept budgeting and CDI enforcement (≥2.0)',
    ],
    gaps: [
      'Chapter memory graph for cross-chapter concept tracking',
      'Section-level continuity control',
      'Adaptive content difficulty based on reader profile',
      'Multi-author voice blending for collaborative books',
      'Content versioning with diff visualization',
    ],
    dependencies: [],
  },

  ScrollVisual: {
    name: 'ScrollVisual',
    version: '2.0.0',
    status: 'active',
    layer: 'processing',
    description: 'Visual Intelligence System with cognitive value scoring and book-type rendering',
    capabilities: [
      'Three-stage pipeline (Detect → Classify → Render)',
      'Visual need detection with trigger keywords',
      'Visual type classification (14 types)',
      'Book-type rendering rules (10 book types)',
      'Cognitive value scoring with quality gate (score ≥ 2)',
      'Structured figure format (TYPE, CAPTION, DESCRIPTION)',
      'Smart placement logic (after_section, before_section, inline, full_width_break)',
      'Visual density rules per book type',
      'Cover generation with book-type art direction',
      'Figure specification objects as single source of truth',
    ],
    gaps: [
      'SVG/Mermaid renderer for academic diagrams',
      'D3/Plotly renderer for data visualizations',
      'Interactive zoomable diagrams',
      'Animated workflow visualizations',
      'Figure numbering automation across chapters',
      'Visual consistency enforcement across a book',
    ],
    dependencies: ['ScrollContent'],
  },

  ScrollIntegrity: {
    name: 'ScrollIntegrity',
    version: '1.5.0',
    status: 'active',
    layer: 'processing',
    description: 'Academic trust, citation verification, and AI authorship governance',
    capabilities: [
      'Assessment integrity scoring (0-100%)',
      'Anti-cheating detection (typing patterns, tab switching, paste detection)',
      'Citation verification (DOI similarity ≥ 0.8)',
      'Epistemic coherence auditing',
      'SHA-256 cryptographic audit trail',
      'Content ownership tracking (AI vs user-authored)',
      'AI disclosure in exports',
      'Integrity logs via SECURITY DEFINER function',
      'Reference compliance panel',
      'Book provenance tracking (Contract 12)',
    ],
    gaps: [
      'Source traceability panel (claim → source mapping)',
      'Derivative-risk detector (similarity to training data)',
      'AI disclosure watermark in exported documents',
      'Plagiarism similarity scoring against external corpus',
      'Institutional audit export (CSV/JSON for compliance)',
      'FERPA/GDPR compliance certification',
    ],
    dependencies: ['ScrollContent', 'ScrollMastery'],
  },

  ScrollMastery: {
    name: 'ScrollMastery',
    version: '2.0.0',
    status: 'active',
    layer: 'processing',
    description: 'Competency verification with Bloom enforcement, SRS, and adaptive difficulty',
    capabilities: [
      'Semantic concept extraction (10-20 constructs/chapter)',
      'Bloom taxonomy enforcement (Remember → Evaluate)',
      'Anti-predictability question generation (Fisher-Yates, length parity)',
      'Mastery depth scoring with 9 cognitive profiles',
      '9-gate certification checklist',
      'Spaced repetition (SM-2 algorithm with Bloom bonus)',
      'Adaptive difficulty (sliding window of last 5-10 attempts)',
      'Score volatility detection (anti-gaming)',
      'Competency learning panel (Concept → Reflect → Apply → Assess)',
      'Flashcard and learning deck generation',
      'Reading session tracking and streak analytics',
      '12-week activity heatmap and 6-axis Bloom radar',
    ],
    gaps: [
      'Open-ended answer grading with rubric',
      'Typed response mode (essay-style assessment)',
      'Anti-outsourcing detection (behavioral biometrics)',
      'Peer assessment capabilities',
      'Learning path recommendations based on weak areas',
      'Cross-book competency aggregation',
    ],
    dependencies: ['ScrollContent'],
  },

  ScrollPublish: {
    name: 'ScrollPublish',
    version: '1.5.0',
    status: 'active',
    layer: 'processing',
    description: 'Professional export, typesetting, and publishing-ready artifact generation',
    capabilities: [
      'PDF export with professional typesetting',
      'EPUB export with per-chapter resilience',
      'DOCX export with dedicated style definitions',
      'Cover image embedding in exports',
      'Table of contents generation',
      'Running headers and page numbers (PDF)',
      'Bibliography/citation merging',
      'Academic footers for academic-mode books',
      'Certificate generation (publishing + competency)',
      'Certificate verification with hash validation',
    ],
    gaps: [
      'KPF (Kindle) export format',
      'Print-ready interior layout (margins, bleed)',
      'Figure numbering automation in exports',
      'Export quality linting before publish',
      'ISBN metadata integration',
      'Storefront-ready packaging (Amazon KDP, IngramSpark)',
      'PowerPoint/slide deck export',
      'Audiobook compilation from TTS',
    ],
    dependencies: ['ScrollContent', 'ScrollVisual', 'ScrollIntegrity'],
  },

  // ═══════════════════════════════════════════════
  // GOVERNANCE LAYER (supervisory, not in pipeline)
  // ═══════════════════════════════════════════════

  ScrollInstitution: {
    name: 'ScrollInstitution',
    version: '0.9.1',
    status: 'beta',
    layer: 'governance',
    description: 'Institution-scoped university operations, curriculum governance, assessment, records, learner lifecycle, and LMS interoperability',
    capabilities: [
      'Institution-scoped academic identity with chancellor, registrar, dean, programme lead, lecturer, TA, advisor, student and auditor roles',
      'Faculty, school, department, programme, term, course, cohort and course-offering management',
      'Programme-course mapping, prerequisites and credit-bearing curriculum structures',
      'Course modules, lessons, linked learning materials and learning-outcome evidence mapping',
      'Evidence-based course readiness gates separating shells, in-development, teaching-ready, scheduled and enrollable courses',
      'Canonical catalogue bridge for reconciling legacy/external course records without duplicating institutional course identity',
      'Concurrent-safe course capacity enforcement and server-enforced enrolment readiness',
      'Lecturer/TA/grader allocation and teaching portfolios',
      'Assignments, submission windows, grade plans, gradebook workflows and transcript reporting',
      'Institution-specific grading schemes with guarded finalisation and credit award',
      'Attendance sessions, learner attendance summaries and lazy-loaded attendance registers',
      'Learner progress analytics, CSV exports and outstanding-work signals',
      'Programme registration, academic standing, advising, recognized credit, progression decisions and completion clearance',
      'Bulk roster provisioning with academic roles kept separate from organization owner/admin authority',
      'Institution branding, academic settings and verification workflow',
      'Inbound LTI 1.3 OIDC login and signed ResourceLink launch with one-time account claim',
      'Role-scoped learner reads and paged institutional data paths for large university datasets',
      'Manual staged k6 load-test workflow supporting profiles up to 1,000 virtual users',
    ],
    gaps: [
      'SCORM package import, runtime API persistence and conformance testing',
      'LTI Advantage services: Assignment and Grade Services, Names and Role Provisioning, and Deep Linking',
      'Execute and pass the staged 1,000-concurrent-user load profile; the harness exists but capacity is not yet proven',
      'Deploy and verify the new university migrations and Edge Functions against the live Lovable-managed Supabase backend',
      'Complete generated Supabase schema/type synchronization after live database deployment',
    ],
    dependencies: ['ScrollMastery', 'ScrollIntegrity'],
  },

};

/** Get processing engines in pipeline execution order */
export function getProcessingPipeline(): EngineManifest[] {
  const order = ['ScrollContent', 'ScrollVisual', 'ScrollIntegrity', 'ScrollMastery', 'ScrollPublish'];
  return order.map(name => ENGINE_REGISTRY[name]);
}

/** Get governance layer engines */
export function getGovernanceEngines(): EngineManifest[] {
  return Object.values(ENGINE_REGISTRY).filter(e => e.layer === 'governance');
}

/** @deprecated Use getProcessingPipeline() instead */
export function getPipelineOrder(): EngineManifest[] {
  return [...getProcessingPipeline(), ...getGovernanceEngines()];
}

/** Get engines by status */
export function getEnginesByStatus(status: EngineManifest['status']): EngineManifest[] {
  return Object.values(ENGINE_REGISTRY).filter(e => e.status === status);
}

/** Get engines by layer */
export function getEnginesByLayer(layer: EngineLayer): EngineManifest[] {
  return Object.values(ENGINE_REGISTRY).filter(e => e.layer === layer);
}

/** Get total capability and gap counts */
export function getSystemHealth() {
  const engines = Object.values(ENGINE_REGISTRY);
  const processing = engines.filter(e => e.layer === 'processing');
  const governance = engines.filter(e => e.layer === 'governance');
  return {
    totalEngines: engines.length,
    processingEngines: processing.length,
    governanceEngines: governance.length,
    activeEngines: engines.filter(e => e.status === 'active').length,
    totalCapabilities: engines.reduce((sum, e) => sum + e.capabilities.length, 0),
    totalGaps: engines.reduce((sum, e) => sum + e.gaps.length, 0),
    readinessScore: Math.round(
      (engines.reduce((sum, e) => sum + e.capabilities.length, 0) /
        (engines.reduce((sum, e) => sum + e.capabilities.length + e.gaps.length, 0) || 1)) * 100
    ),
  };
}