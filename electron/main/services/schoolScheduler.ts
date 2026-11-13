import type { SchoolConfig, SchoolState } from "@shared/types/school";
import { evaluateSchoolSchedule } from "@shared/utils/schoolSchedule";

interface SchoolSchedulerOptions {
  getConfig: () => SchoolConfig;
  now?: () => number;
  onState: (state: SchoolState) => void;
  enforceClass: (generation: number) => Promise<void>;
  onBreak?: (state: SchoolState) => void;
  onError?: (error: unknown) => void;
  timers?: boolean;
}

/** 主进程校园状态机；所有状态都由当前绝对时间重新计算。 */
export class SchoolScheduler {
  private readonly now: () => number;
  private readonly timers: boolean;
  private state: SchoolState = {
    phase: "TRANSITIONING",
    generation: 0,
    activePeriodId: null,
    activePeriodName: null,
    nextTransitionAt: null,
    checkedAt: 0,
    cleanupVerifiedAt: null,
  };
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;
  private reconcileAgain = false;
  private disposed = false;
  private forcedClassUntil: number | null = null;
  private cleanupRetryAt = 0;

  constructor(private readonly options: SchoolSchedulerOptions) {
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? true;
  }

  async init(): Promise<void> {
    await this.reconcile();
  }

  getState(): SchoolState {
    return structuredClone(this.state);
  }

  async configChanged(): Promise<void> {
    this.forcedClassUntil = null;
    this.cleanupRetryAt = 0;
    await this.reconcile();
  }

  async powerResumed(): Promise<void> {
    await this.reconcile();
  }

  /** 提前结束当前课间，在原定结束时间前保持上课锁定。 */
  async forceEndBreak(): Promise<void> {
    if (this.state.phase !== "BREAK") return;
    this.forcedClassUntil = this.state.nextTransitionAt ?? this.now();
    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    if (this.disposed) return;
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciling = true;
    try {
      do {
        this.reconcileAgain = false;
        await this.reconcileOnce();
      } while (this.reconcileAgain && !this.disposed);
    } finally {
      this.reconciling = false;
      this.scheduleNextCheck();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async reconcileOnce(): Promise<void> {
    const now = this.now();
    const evaluation = evaluateSchoolSchedule(this.options.getConfig(), now);
    if (this.forcedClassUntil !== null) {
      if (now >= this.forcedClassUntil) this.forcedClassUntil = null;
      else if (evaluation.phase === "BREAK") evaluation.phase = "CLASS";
    }
    const previous = this.state;

    if (evaluation.phase === "CLASS") {
      const entering = previous.phase !== "CLASS";
      this.state = {
        phase: "CLASS",
        generation: entering ? previous.generation + 1 : previous.generation,
        activePeriodId: null,
        activePeriodName: null,
        nextTransitionAt: evaluation.nextTransitionAt,
        checkedAt: now,
        cleanupVerifiedAt: entering ? null : previous.cleanupVerifiedAt,
      };
      if (entering) this.options.onState(this.getState());
      if ((entering || this.state.cleanupVerifiedAt === null) && now >= this.cleanupRetryAt) {
        this.cleanupRetryAt = now + 5000;
        try {
          await this.options.enforceClass(this.state.generation);
          if (this.state.phase === "CLASS" && this.state.generation === previous.generation + (entering ? 1 : 0)) {
            this.state.cleanupVerifiedAt = this.now();
          }
        } catch (error) {
          this.options.onError?.(error);
        }
      }
      this.options.onState(this.getState());
      return;
    }

    this.state = {
      phase: evaluation.phase,
      generation: previous.generation,
      activePeriodId: evaluation.activePeriod?.id ?? null,
      activePeriodName: evaluation.activePeriod?.name ?? null,
      nextTransitionAt: evaluation.nextTransitionAt,
      checkedAt: now,
      cleanupVerifiedAt: null,
    };
    this.options.onState(this.getState());
    if (evaluation.phase === "BREAK" && previous.phase !== "BREAK") {
      this.options.onBreak?.(this.getState());
    }
  }

  private scheduleNextCheck(): void {
    if (!this.timers || this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    const now = this.now();
    const boundaryDelay = this.state.nextTransitionAt
      ? Math.max(0, this.state.nextTransitionAt - now)
      : Number.POSITIVE_INFINITY;
    const delay = Math.max(10, Math.min(1000, boundaryDelay));
    this.timer = setTimeout(() => void this.reconcile(), delay);
  }
}
