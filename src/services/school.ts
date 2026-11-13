import type {
  SchoolCleanupAck,
  SchoolConfig,
  SchoolState,
} from "@shared/types/school";
import { clearQueue, setPlayMode, useQueueStore } from "@/stores/queue";
import { useMediaStore } from "@/stores/media";
import { useStatusStore } from "@/stores/status";
import { usePlayer } from "@/core/player";

let lastCleanupGeneration = 0;
let cleanupRunning = false;
let initialized = false;

export const getSchoolState = (): Promise<SchoolState> => window.api.school.getState();
export const getSchoolConfig = (): Promise<SchoolConfig> => window.api.school.getConfig();
export const isSchoolClass = async (): Promise<boolean> => {
  const state = await getSchoolState();
  return state.phase === "CLASS" || state.phase === "TRANSITIONING";
};

/** 作废全部渲染层播放任务，停止原生音频并等待队列读回验证。 */
export const enforceSchoolClassCleanup = async (generation: number): Promise<void> => {
  if (generation <= lastCleanupGeneration || cleanupRunning) return;
  cleanupRunning = true;
  try {
    const player = usePlayer();
    const status = useStatusStore();
    const media = useMediaStore();
    player.invalidatePlaybackOperation();
    setPlayMode("sequential");
    status.playIndex = -1;
    status.autoNextBlocked = true;
    status.pendingNextTrack = null;
    status.preparedNextTrack = null;
    status.trackLoading = false;
    status.transitioning = false;
    await player.stop();
    await clearQueue();
    media.clear();
    const queue = useQueueStore();
    const ack: SchoolCleanupAck = {
      generation,
      queueEmpty: queue.queueEntries.value.length === 0,
      originalQueueEmpty: queue.originalQueue.value === null,
      persistedAt: Date.now(),
    };
    window.api.school.ackCleanup(ack);
    lastCleanupGeneration = generation;
  } finally {
    cleanupRunning = false;
  }
};

/** 在 restoreQueue 和 restoreLastTrack 之前安装校园事件。 */
export const initSchoolService = async (): Promise<SchoolState> => {
  if (initialized) return getSchoolState();
  initialized = true;
  window.api.school.onState((state) => {
    if (state.phase === "CLASS" || state.phase === "TRANSITIONING") {
      useStatusStore().autoNextBlocked = true;
      if (state.phase === "CLASS" && state.cleanupVerifiedAt === null) {
        void enforceSchoolClassCleanup(state.generation).catch(console.error);
      }
    }
  });
  window.api.school.onForceCleanup(({ generation }) => {
    void enforceSchoolClassCleanup(generation).catch(console.error);
  });
  const state = await window.api.school.ready();
  if (state.phase === "CLASS") await enforceSchoolClassCleanup(state.generation);
  return state;
};
