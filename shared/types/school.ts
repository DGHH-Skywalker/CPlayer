/** 校园调度状态 */
export type SchoolPhase = "DISABLED" | "CLASS" | "BREAK" | "TRANSITIONING";

/** 课间时间段，星期采用 ISO 1 至 7，跨午夜归开始日期 */
export interface SchoolBreak {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  enabled: boolean;
  autoPlayFirstRequest: boolean;
}

/** 校园配置的唯一持久化来源为主进程 */
export interface SchoolConfig {
  enabled: boolean;
  searchHome: boolean;
  scheduleEnabled: boolean;
  autoPlayFirstRequest: boolean;
  breaks: SchoolBreak[];
  disabledDates: string[];
  specialDates: Record<string, SchoolBreak[]>;
  bilibili: {
    enabled: boolean;
    coreEnabled: boolean;
    noLogin: boolean;
    biliSongEnabled: boolean;
    retainLogin: boolean;
    pauseOnClass: boolean;
    audioPolicy: "pause-music" | "parallel" | "muted";
  };
}

/** 主进程权威快照 */
export interface SchoolSnapshot {
  config: SchoolConfig;
  phase: SchoolPhase;
  generation: number;
  activeId: string | null;
  activeName: string | null;
  endAt: number | null;
  nextStartAt: number | null;
  nextEndAt: number | null;
  pendingClear: string | null;
  lastCleared: string | null;
}

/** 校园功能的受信 IPC 接口 */
export interface SchoolApi {
  get(): Promise<SchoolSnapshot>;
  configure(config: SchoolConfig): Promise<SchoolSnapshot>;
  endBreak(): Promise<SchoolSnapshot>;
  acknowledge(eventId: string): Promise<SchoolSnapshot>;
  onState(callback: (state: SchoolSnapshot) => void): () => void;
}
