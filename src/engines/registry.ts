/**
 * ScrollLibrary Engine Registry
 * ==============================
 * Central manifest of all 6 engines, their capabilities,
 * current status, and identified gaps.
 */

import type { EngineManifest } from './types';

export const ENGINE_REGISTRY: Record<string, EngineManifest> = {

  ScrollContent: {
    name: 'ScrollContent',
    version: '3.0.0',
    status: 'active',
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

  ScrollMastery: {
    name: 'ScrollMastery',
    version: '2.0.0',
    status: 'active',
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

  ScrollIntegrity: {
    name: 'ScrollIntegrity',
    version: '1.5.0',
    status: 'active',
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

  ScrollPublish: {
    name: 'ScrollPublish',
    version: '1.5.0',
    status: 'active',
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

  ScrollInstitution: {
    name: 'ScrollInstitution',
    version: '0.5.0',
    status: 'beta',
    description: 'Institutional governance, roles, and organizational learning infrastructure',
    capabilities: [
      'Role-based access (admin, moderator, user)',
      'Institutional mode with stricter assessment rules',
      'Content moderation queue',
      'Content reporting system',
      'Admin panel for system management',
      'User profile with learning preferences',
      'Book collaboration (editor/viewer roles)',
      'Real-time presence for collaborative editing',
    ],
    gaps: [
      'Lecturer/instructor dashboard',
      'Class/cohort creation and management',
      'Per-learner mastery analytics for instructors',
      'Curriculum mapping and alignment tools',
      'LMS integration (LTI 1.3, SCORM)',
      'Organization verification and branding',
      'Bulk user provisioning (CSV import)',
      'Grade book export',
      'Assignment creation from book chapters',
      'Learning outcome mapping (ILO → chapter → assessment)',
    ],
    dependencies: ['ScrollMastery', 'ScrollIntegrity'],
  },

};

/** Get all engines in pipeline execution order */
export function getPipelineOrder(): EngineManifest[] {
  const order: (keyof typeof ENGINE_REGISTRY)[] = [
    'ScrollContent',
    'ScrollVisual',
    'ScrollIntegrity',
    'ScrollMastery',
    'ScrollPublish',
    'ScrollInstitution',
  ];
  return order.map(name => ENGINE_REGISTRY[name]);
}

/** Get engines by status */
export function getEnginesByStatus(status: EngineManifest['status']): EngineManifest[] {
  return Object.values(ENGINE_REGISTRY).filter(e => e.status === status);
}

/** Get total capability and gap counts */
export function getSystemHealth() {
  const engines = Object.values(ENGINE_REGISTRY);
  return {
    totalEngines: engines.length,
    activeEngines: engines.filter(e => e.status === 'active').length,
    totalCapabilities: engines.reduce((sum, e) => sum + e.capabilities.length, 0),
    totalGaps: engines.reduce((sum, e) => sum + e.gaps.length, 0),
    readinessScore: Math.round(
      (engines.reduce((sum, e) => sum + e.capabilities.length, 0) /
        (engines.reduce((sum, e) => sum + e.capabilities.length + e.gaps.length, 0) || 1)) * 100
    ),
  };
}
