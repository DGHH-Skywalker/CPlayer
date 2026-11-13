import { schoolState } from "@/stores/school";
import { stopAndClearForClass } from "./requestPlayback";
import type { SchoolSnapshot } from "@shared/types/school";

let clearing: string | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * 应用主进程状态；确认失败保留 pending，后续同步可重试
 * @param snapshot - 主进程快照
 */
const apply = async (snapshot: SchoolSnapshot): Promise<void> => {
  if (
    snapshot.generation < schoolState.value.generation ||
    (snapshot.pendingClear !== null && snapshot.pendingClear === schoolState.value.lastCleared)
  )
    return;
  schoolState.value = snapshot;
  if (!snapshot.pendingClear || clearing === snapshot.pendingClear) return;
  clearing = snapshot.pendingClear;
  try {
    await stopAndClearForClass(clearing);
  } catch (error) {
    console.error("[school] 清理失败，保持播放锁定", error);
  } finally {
    clearing = null;
  }
};

/** 在队列恢复之前订阅，并等待旧会话清理完成 */
export const initSchoolBridge = async (): Promise<void> => {
  unsubscribe?.();
  unsubscribe = window.api.school.onState((snapshot) => {
    void apply(snapshot);
  });
  await apply(await window.api.school.get());
};
