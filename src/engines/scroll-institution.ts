/**
 * ScrollInstitution Engine
 * =========================
 * Institutional governance, roles, and organizational
 * learning infrastructure.
 *
 * Owns: Roles, moderation, collaboration, analytics, compliance
 */

// ─── Role & Access Control ───────────────────────────────
export { useIsAdmin } from '@/hooks/useAdmin';
export { useFeatureAccess } from '@/hooks/useFeatureAccess';
export { useEntitlements } from '@/hooks/useEntitlements';
export { AdminRoute } from '@/components/AdminRoute';
export { ProtectedRoute } from '@/components/ProtectedRoute';

// ─── Collaboration ───────────────────────────────────────
export { CollaborationPanel } from '@/components/books/CollaborationPanel';
export { PresenceAvatars } from '@/components/reader/PresenceAvatars';
export { useCollaboration } from '@/hooks/useCollaboration';

// ─── Subscription & Entitlements ─────────────────────────
export { RequiresPlan } from '@/components/subscription/RequiresPlan';
export { LaunchBanner } from '@/components/subscription/LaunchBanner';
export { TrialBanner } from '@/components/subscription/TrialBanner';
export { LIBRARY_LIMITS } from '@/lib/libraryLimits';
export { useLibraryLimits } from '@/hooks/useLibraryLimits';

// ─── Diagnostics & Health ────────────────────────────────
export { SystemDoctor } from '@/components/diagnostics/SystemDoctor';
export { SystemHealthIndicator } from '@/components/system/SystemHealthIndicator';
export { DiagnosticsPanel } from '@/components/system/DiagnosticsPanel';

// ─── Chief Editor Governance ─────────────────────────────
export { ChiefEditorPanel } from '@/components/books/ChiefEditorPanel';
export { CodeAuditPanel } from '@/components/books/CodeAuditPanel';
export { CodeQualityBadge } from '@/components/books/CodeQualityBadge';

// ─── Certification Governance ────────────────────────────
export { CertificationGateChecklist } from '@/components/certificates/CertificationGateChecklist';

// ─── Deep Research ───────────────────────────────────────
export { DeepResearchPanel } from '@/components/academic/DeepResearchPanel';
export { ResearchPanel } from '@/components/academic/ResearchPanel';
