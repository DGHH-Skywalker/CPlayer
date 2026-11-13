import { defaultSchoolConfig } from "@shared/school/schedule";
import type { SchoolSnapshot } from "@shared/types/school";

/** 校园 UI 仅缓存主进程快照，不独立持久化配置 */
export const schoolState = shallowRef<SchoolSnapshot>({
  config: structuredClone(defaultSchoolConfig),
  phase: "DISABLED",
  generation: 0,
  activeId: null,
  activeName: null,
  endAt: null,
  nextStartAt: null,
  nextEndAt: null,
  pendingClear: null,
  lastCleared: null,
});

/** 判断校园点歌模式是否启用 */
export const isSchoolMode = (): boolean => schoolState.value.config.enabled;

/** 判断当前是否允许添加和播放 */
export const canRequestNow = (): boolean =>
  !schoolState.value.pendingClear &&
  (!isSchoolMode() ||
    !schoolState.value.config.scheduleEnabled ||
    (schoolState.value.phase === "BREAK" && (schoolState.value.endAt ?? 0) > Date.now()));
