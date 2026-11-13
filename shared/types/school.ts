/** 校园调度运行状态。 */
export type SchoolPhase = "DISABLED" | "CLASS" | "BREAK" | "TRANSITIONING";

/** 每周课间时间段，星期使用 0（周日）至 6（周六）。 */
export interface SchoolBreakPeriod {
  id: string;
  name: string;
  days: number[];
  start: string;
  end: string;
}

/** 特殊日期使用该清单替代每周时间表。 */
export interface SchoolSpecialDate {
  date: string;
  periods: SchoolBreakPeriod[];
}

export interface SchoolConfig {
  enabled: boolean;
  autoPlay: boolean;
  periods: SchoolBreakPeriod[];
  specialDates: SchoolSpecialDate[];
  disabledDates: string[];
}

export interface SchoolState {
  phase: SchoolPhase;
  generation: number;
  activePeriodId: string | null;
  activePeriodName: string | null;
  nextTransitionAt: number | null;
  checkedAt: number;
  cleanupVerifiedAt: number | null;
}

export interface SchoolScheduleDocument {
  version: 1;
  timeZone: "Asia/Shanghai";
  config: SchoolConfig;
}

export interface SchoolCleanupAck {
  generation: number;
  queueEmpty: boolean;
  originalQueueEmpty: boolean;
  persistedAt: number;
}

export interface BilibiliConfig {
  enabled: boolean;
  coreEnabled: boolean;
  noLoginEnabled: boolean;
  mvMuted: boolean;
  pauseMusicOnMv: boolean;
  allowSimultaneousPlayback: boolean;
}

export type BilibiliViewMode = "browser" | "theater";

export interface BilibiliViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BilibiliNavigationState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  visible: boolean;
  mode: BilibiliViewMode;
  coreInjected: boolean;
}

export interface BilibiliMediaState {
  playing: boolean;
  muted: boolean;
  url: string;
  generation: number;
}
