import type { SchoolConfig, SchoolSnapshot } from "../../../shared/types/school";
import { resolveSchedule, validateSchoolConfig } from "../../../shared/school/schedule";

/** 可注入时钟和副作用，真实定时器与测试共用同一状态机 */
export interface SchoolSchedulerHooks {
  now(): number;
  stop(eventId: string): void;
  publish(snapshot: SchoolSnapshot): void;
  persist(snapshot: SchoolSnapshot): void;
}

/** 主进程绝对时间调度器，待清理事件确认前保持播放锁定 */
export class SchoolScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: SchoolSnapshot;
  private endedActive: string | null = null;
  private serial = 0;
  private ticking = false;

  /**
   * 创建调度器，启动校园模式时始终清理旧会话
   * @param config - 主进程配置
   * @param hooks - 时钟和停止、持久化回调
   * @param generation - 已持久化的播放代次
   */
  constructor(
    config: SchoolConfig,
    private hooks: SchoolSchedulerHooks,
    generation = 0,
  ) {
    this.snapshot = {
      config: validateSchoolConfig(config),
      phase: "DISABLED",
      generation,
      activeId: null,
      activeName: null,
      endAt: null,
      nextStartAt: null,
      nextEndAt: null,
      pendingClear: null,
      lastCleared: null,
    };
    if (config.enabled) this.cutoff("startup");
    this.tick();
  }

  /** 读取当前权威快照，并补偿系统时钟跳变 */
  get(): SchoolSnapshot {
    this.tick();
    return structuredClone(this.snapshot);
  }

  /** 开始边界计时与低频补偿检查 */
  start(): void {
    this.checkTimer = setInterval(() => this.tick(), 15_000);
    this.tick();
  }

  /** 清理主进程计时资源 */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.timer = this.checkTimer = null;
  }

  /**
   * 保存并立即应用用户配置
   * @param config - 已编辑的完整配置
   */
  configure(config: SchoolConfig): SchoolSnapshot {
    validateSchoolConfig(config);
    const wasEnabled = this.snapshot.config.enabled;
    const wasScheduled = this.snapshot.config.scheduleEnabled;
    this.snapshot.generation++;
    this.snapshot.config = structuredClone(config);
    if (config.enabled && (!wasEnabled || (config.scheduleEnabled && !wasScheduled)))
      this.cutoff("enable");
    this.tick();
    this.hooks.persist(this.snapshot);
    this.hooks.publish(this.snapshot);
    return this.get();
  }

  /** 立即结束当前课间，禁止在同一课间被重新打开 */
  endBreak(): SchoolSnapshot {
    this.endedActive = this.snapshot.activeId;
    this.cutoff("manual");
    this.tick();
    return this.get();
  }

  /**
   * 接受渲染端确认，迟到事件不能解除新事件锁定
   * @param eventId - 已完成可靠清空的事件 ID
   */
  acknowledge(eventId: string): SchoolSnapshot {
    if (this.snapshot.pendingClear === eventId) {
      this.snapshot.pendingClear = null;
      this.snapshot.lastCleared = eventId;
      this.hooks.persist(this.snapshot);
      this.tick();
      this.hooks.publish(this.snapshot);
    }
    return this.get();
  }

  /** 在原生音频启动前读取权限，包含绝对边界检查 */
  allowsPlayback(): boolean {
    const s = this.get();
    return (
      !s.pendingClear && (!s.config.enabled || !s.config.scheduleEnabled || s.phase === "BREAK")
    );
  }

  /**
   * 先锁定、持久化代次和清理标记，再停止原生引擎
   * @param reason - 结束原因
   */
  private cutoff(reason: string): void {
    this.snapshot.phase = "CLASS";
    this.snapshot.generation++;
    this.snapshot.pendingClear = `${this.hooks.now()}/${++this.serial}/${reason}`;
    this.hooks.persist(this.snapshot);
    this.hooks.stop(this.snapshot.pendingClear);
    this.hooks.publish(this.snapshot);
  }

  /** 重新计算当前状态，切换课间必须先清理前一个会话 */
  tick(): void {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const previous = JSON.stringify(this.snapshot);
      const now = this.hooks.now();
      const config = this.snapshot.config;
      const resolved = resolveSchedule(config, now);
      const active = config.enabled && config.scheduleEnabled ? resolved.active : null;
      const previousId = this.snapshot.activeId;
      if (previousId && previousId !== active?.key && previousId !== this.endedActive)
        this.cutoff("boundary");
      this.snapshot.activeId = active?.key ?? null;
      this.snapshot.activeName = active?.name ?? null;
      this.snapshot.endAt = active?.end ?? null;
      this.snapshot.nextStartAt = resolved.nextStartAt;
      this.snapshot.nextEndAt = resolved.nextEndAt;
      if (!config.enabled || !config.scheduleEnabled) this.snapshot.phase = "DISABLED";
      else
        this.snapshot.phase =
          active && active.key !== this.endedActive && !this.snapshot.pendingClear
            ? "BREAK"
            : "CLASS";
      if (this.timer) clearTimeout(this.timer);
      const boundary = active?.end ?? resolved.nextStartAt;
      this.timer =
        boundary == null
          ? null
          : setTimeout(() => this.tick(), Math.min(2_147_483_647, Math.max(1, boundary - now)));
      if (previous !== JSON.stringify(this.snapshot)) {
        this.hooks.persist(this.snapshot);
        this.hooks.publish(this.snapshot);
      }
    } finally {
      this.ticking = false;
    }
  }
}
