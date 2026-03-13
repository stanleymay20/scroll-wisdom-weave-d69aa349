/**
 * PipelineRunner — Engine Orchestration Layer
 * =============================================
 * Executes processing engines in dependency-aware order.
 * Applies governance checks at configurable points.
 * Emits PipelineEvent records for telemetry.
 */

import type {
  BookContext,
  EngineModule,
  EngineResult,
  PipelineEvent,
  PipelinePlan,
  PipelineRunResult,
  PipelineStage,
  GovernanceCheck,
} from './types';
import { STAGE_ENGINE_MAP } from './types';

/** Default processing pipeline order */
const DEFAULT_PIPELINE: PipelineStage[] = [
  'content_generation',
  'visual_intelligence',
  'integrity_check',
  'mastery_assessment',
  'publishing_export',
];

/** Default governance check points */
const DEFAULT_GOVERNANCE: GovernanceCheck[] = [
  'access_control',
  'post_certification',
];

export class PipelineRunner {
  private engines: Map<string, EngineModule> = new Map();
  private governanceEngine: EngineModule | null = null;
  private eventLog: PipelineEvent[] = [];
  private listeners: Array<(event: PipelineEvent) => void> = [];

  /** Register a processing engine */
  registerEngine(engine: EngineModule): void {
    this.engines.set(engine.name, engine);
    if (engine.layer === 'governance') {
      this.governanceEngine = engine;
    }
  }

  /** Subscribe to pipeline events (for telemetry / UI) */
  onEvent(listener: (event: PipelineEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: PipelineEvent): void {
    this.eventLog.push(event);
    this.listeners.forEach(l => l(event));
  }

  /** Build an execution plan for the given context */
  plan(
    context: BookContext,
    options?: { stages?: PipelineStage[]; governanceChecks?: GovernanceCheck[] }
  ): PipelinePlan {
    const stages = options?.stages ?? DEFAULT_PIPELINE;
    const governanceChecks = options?.governanceChecks ?? DEFAULT_GOVERNANCE;
    const skipReasons: Partial<Record<PipelineStage, string>> = {};

    for (const stage of stages) {
      const engineName = STAGE_ENGINE_MAP[stage];
      const engine = this.engines.get(engineName);
      if (!engine) {
        skipReasons[stage] = `Engine ${engineName} not registered`;
      } else if (!engine.canRun(context)) {
        skipReasons[stage] = `Engine ${engineName} cannot run for this context`;
      }
    }

    return { bookContext: context, stages, governanceChecks, skipReasons };
  }

  /** Execute the full pipeline */
  async run(
    context: BookContext,
    options?: { stages?: PipelineStage[]; stopOnFailure?: boolean }
  ): Promise<PipelineRunResult> {
    const executionPlan = this.plan(context, options);
    const results: EngineResult[] = [];
    const startTime = performance.now();
    let failedAt: PipelineStage | undefined;

    // Pre-generation governance check
    if (this.governanceEngine && executionPlan.governanceChecks.includes('access_control')) {
      await this.runGovernanceCheck('access_control', context);
    }

    // Run processing engines in order
    for (const stage of executionPlan.stages) {
      if (executionPlan.skipReasons?.[stage]) {
        this.emit({
          stage,
          engine: STAGE_ENGINE_MAP[stage],
          status: 'skipped',
          metadata: { reason: executionPlan.skipReasons[stage] },
        });
        continue;
      }

      const engineName = STAGE_ENGINE_MAP[stage];
      const engine = this.engines.get(engineName)!;

      this.emit({ stage, engine: engineName, status: 'started' });

      const stageStart = performance.now();
      try {
        // Pass accumulated results to context
        const enrichedContext: BookContext = {
          ...context,
          priorResults: [...results],
        };

        const result = await engine.execute(enrichedContext);
        const duration_ms = Math.round(performance.now() - stageStart);

        results.push({ ...result, durationMs: duration_ms });

        this.emit({
          stage,
          engine: engineName,
          status: result.success ? 'completed' : 'failed',
          duration_ms,
          metadata: result.metrics,
        });

        if (!result.success) {
          failedAt = stage;
          if (options?.stopOnFailure !== false) break;
        }
      } catch (error) {
        const duration_ms = Math.round(performance.now() - stageStart);
        const errorMsg = error instanceof Error ? error.message : String(error);

        results.push({
          engine: engineName,
          success: false,
          errors: [errorMsg],
          durationMs: duration_ms,
          timestamp: new Date().toISOString(),
        });

        this.emit({
          stage,
          engine: engineName,
          status: 'failed',
          duration_ms,
          metadata: { error: errorMsg },
        });

        failedAt = stage;
        if (options?.stopOnFailure !== false) break;
      }
    }

    // Post-certification governance check
    if (this.governanceEngine && executionPlan.governanceChecks.includes('post_certification') && !failedAt) {
      await this.runGovernanceCheck('post_certification', context);
    }

    return {
      plan: executionPlan,
      results,
      events: [...this.eventLog],
      totalDurationMs: Math.round(performance.now() - startTime),
      success: !failedAt,
      failedAt,
    };
  }

  private async runGovernanceCheck(check: GovernanceCheck, context: BookContext): Promise<void> {
    if (!this.governanceEngine) return;

    this.emit({ stage: check, engine: this.governanceEngine.name, status: 'started' });

    const start = performance.now();
    try {
      const result = await this.governanceEngine.execute(context);
      this.emit({
        stage: check,
        engine: this.governanceEngine.name,
        status: result.success ? 'completed' : 'failed',
        duration_ms: Math.round(performance.now() - start),
      });
    } catch {
      this.emit({
        stage: check,
        engine: this.governanceEngine.name,
        status: 'failed',
        duration_ms: Math.round(performance.now() - start),
      });
    }
  }

  /** Reset event log (e.g. between runs) */
  clearEvents(): void {
    this.eventLog = [];
  }

  /** Get a snapshot of registered engines and their readiness */
  getStatus(context: BookContext) {
    const status: Record<string, { registered: boolean; canRun: boolean; layer: string }> = {};
    for (const [name, engine] of this.engines) {
      status[name] = {
        registered: true,
        canRun: engine.canRun(context),
        layer: engine.layer,
      };
    }
    return status;
  }
}

/** Singleton pipeline runner */
export const pipelineRunner = new PipelineRunner();
