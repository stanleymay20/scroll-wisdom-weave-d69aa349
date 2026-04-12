/**
 * Lightweight A/B Experiment Framework
 * Assigns users to variants and persists assignment + outcomes.
 */

import { supabase } from "@/integrations/supabase/client";

export type ExperimentId =
  | 'hook_screen'
  | 'progressive_disclosure'
  | 'curiosity_gaps'
  | 'ai_companion'
  | 'visible_gamification_bar'
  | 'ch1_summary_first'
  | 'ch1_guided_start';

export type Variant = 'control' | 'treatment';

const STORAGE_KEY = 'scroll_experiments';

interface Assignments {
  [key: string]: Variant;
}

function loadAssignments(): Assignments {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAssignments(a: Assignments) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch { /* noop */ }
}

/** Get or create a variant assignment for a given experiment */
export function getVariant(experiment: ExperimentId): Variant {
  const assignments = loadAssignments();
  if (assignments[experiment]) return assignments[experiment];
  // 50/50 split
  const variant: Variant = Math.random() < 0.5 ? 'control' : 'treatment';
  assignments[experiment] = variant;
  saveAssignments(assignments);
  // Persist to DB async
  persistAssignment(experiment, variant);
  return variant;
}

/** Check if a feature is enabled (treatment = enabled, control = disabled) */
export function isFeatureEnabled(experiment: ExperimentId): boolean {
  return getVariant(experiment) === 'treatment';
}

/** Override a variant (for admin/testing) */
export function setVariant(experiment: ExperimentId, variant: Variant) {
  const assignments = loadAssignments();
  assignments[experiment] = variant;
  saveAssignments(assignments);
}

/** Get all current assignments */
export function getAllAssignments(): Assignments {
  return loadAssignments();
}

async function persistAssignment(experiment: string, variant: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('pmf_events' as any).insert({
      user_id: user.id,
      event_type: 'experiment_assigned',
      metadata: { experiment, variant },
    });
  } catch { /* silent */ }
}

/** Track an experiment outcome event */
export async function trackExperimentOutcome(
  experiment: ExperimentId,
  outcome: string,
  meta: Record<string, unknown> = {}
) {
  const variant = getVariant(experiment);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('pmf_events' as any).insert({
      user_id: user.id,
      event_type: 'experiment_outcome',
      metadata: { experiment, variant, outcome, ...meta },
    });
  } catch { /* silent */ }
}
