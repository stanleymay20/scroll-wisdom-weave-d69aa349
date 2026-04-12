/**
 * Section Completion Evaluator — Multi-signal heuristic
 * 
 * A section is complete only when a combination of signals fires:
 * - Minimum dwell time (proportional to word count)
 * - User reached section end (IntersectionObserver or explicit click)
 * - OR TTS covered ≥80% of section
 * 
 * Prevents false-positive completions from fast scrolling.
 */

export interface SectionSignals {
  sectionIndex: number;
  wordCount: number;
  /** How long the section has been visible (ms) */
  dwellTimeMs: number;
  /** User scrolled past section end sentinel */
  reachedEnd: boolean;
  /** User explicitly clicked "Continue" */
  explicitAction: boolean;
  /** TTS coverage of this section (0-1) */
  ttsCoverage: number;
  /** Section was visible at least once */
  wasVisible: boolean;
}

export interface CompletionResult {
  isComplete: boolean;
  reason: CompletionReason;
  confidence: 'high' | 'medium' | 'low';
}

export type CompletionReason =
  | 'explicit_action'
  | 'dwell_and_scroll'
  | 'tts_covered'
  | 'not_ready';

// Minimum dwell time: 3s base + 1s per 100 words (capped at 30s)
function minDwellMs(wordCount: number): number {
  return Math.min(30_000, 3_000 + Math.floor(wordCount / 100) * 1_000);
}

/**
 * Evaluate whether a section should be marked as complete.
 * Returns a result with reason and confidence.
 */
export function evaluateSectionCompletion(signals: SectionSignals): CompletionResult {
  // 1. Explicit user action (highest confidence)
  if (signals.explicitAction) {
    return { isComplete: true, reason: 'explicit_action', confidence: 'high' };
  }

  // 2. TTS covered ≥80% of section
  if (signals.ttsCoverage >= 0.8) {
    return { isComplete: true, reason: 'tts_covered', confidence: 'high' };
  }

  // 3. Dwell time + scroll-to-end
  const requiredDwell = minDwellMs(signals.wordCount);
  if (signals.reachedEnd && signals.dwellTimeMs >= requiredDwell) {
    return { isComplete: true, reason: 'dwell_and_scroll', confidence: 'medium' };
  }

  // 4. Reached end but dwell time is marginal (>50% of required)
  if (signals.reachedEnd && signals.dwellTimeMs >= requiredDwell * 0.5) {
    return { isComplete: true, reason: 'dwell_and_scroll', confidence: 'low' };
  }

  return { isComplete: false, reason: 'not_ready', confidence: 'low' };
}

/**
 * Section completion tracker — manages state for all sections in a chapter.
 */
export class SectionCompletionTracker {
  private completed = new Set<number>();
  private dwellStart = new Map<number, number>();
  private dwellAccum = new Map<number, number>();
  private reachedEnd = new Set<number>();
  private ttsCoverage = new Map<number, number>();
  private sectionWordCounts: number[] = [];
  private onComplete?: (index: number, result: CompletionResult) => void;

  constructor(
    wordCounts: number[],
    onComplete?: (index: number, result: CompletionResult) => void
  ) {
    this.sectionWordCounts = wordCounts;
    this.onComplete = onComplete;
  }

  /** Called when section becomes visible */
  onSectionVisible(index: number): void {
    if (this.completed.has(index)) return;
    if (!this.dwellStart.has(index)) {
      this.dwellStart.set(index, Date.now());
    }
  }

  /** Called when section leaves viewport */
  onSectionHidden(index: number): void {
    const start = this.dwellStart.get(index);
    if (start) {
      const elapsed = Date.now() - start;
      this.dwellAccum.set(index, (this.dwellAccum.get(index) || 0) + elapsed);
      this.dwellStart.delete(index);
    }
  }

  /** Called when scroll sentinel at section end is intersected */
  onReachedEnd(index: number): void {
    if (this.completed.has(index)) return;
    this.reachedEnd.add(index);
    this.tryComplete(index);
  }

  /** Called when user explicitly clicks continue/next */
  onExplicitAction(index: number): void {
    if (this.completed.has(index)) return;
    this.markComplete(index, { isComplete: true, reason: 'explicit_action', confidence: 'high' });
  }

  /** Update TTS coverage for a section */
  updateTTSCoverage(index: number, coverage: number): void {
    if (this.completed.has(index)) return;
    this.ttsCoverage.set(index, Math.max(this.ttsCoverage.get(index) || 0, coverage));
    this.tryComplete(index);
  }

  /** Check if section is already completed */
  isCompleted(index: number): boolean {
    return this.completed.has(index);
  }

  /** Get count of completed sections */
  getCompletedCount(): number {
    return this.completed.size;
  }

  /** Pre-mark sections as completed (for resumed sessions) */
  preMarkCompleted(indices: number[]): void {
    indices.forEach(i => this.completed.add(i));
  }

  private tryComplete(index: number): void {
    if (this.completed.has(index)) return;

    // Accumulate current dwell if still visible
    let totalDwell = this.dwellAccum.get(index) || 0;
    const start = this.dwellStart.get(index);
    if (start) totalDwell += Date.now() - start;

    const signals: SectionSignals = {
      sectionIndex: index,
      wordCount: this.sectionWordCounts[index] || 200,
      dwellTimeMs: totalDwell,
      reachedEnd: this.reachedEnd.has(index),
      explicitAction: false,
      ttsCoverage: this.ttsCoverage.get(index) || 0,
      wasVisible: this.dwellAccum.has(index) || this.dwellStart.has(index),
    };

    const result = evaluateSectionCompletion(signals);
    if (result.isComplete) {
      this.markComplete(index, result);
    }
  }

  private markComplete(index: number, result: CompletionResult): void {
    if (this.completed.has(index)) return;
    this.completed.add(index);
    this.onComplete?.(index, result);
  }

  /** Cleanup — flush any pending dwell time */
  destroy(): void {
    this.dwellStart.forEach((_, idx) => this.onSectionHidden(idx));
  }
}
