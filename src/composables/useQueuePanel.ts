import { useMediaStore } from "@/stores/media";
import { useStatusStore } from "@/stores/status";
import { clearQueue, useQueueStore } from "@/stores/queue";
import { usePlayer } from "@/core/player";
import { useThemeStore } from "@/stores/theme";

export const useQueuePanel = () => {
  const queueStore = useQueueStore();
  const statusStore = useStatusStore();
  const player = usePlayer();

  const clearConfirmOpen = ref(false);

  const requestClear = (): void => {
    if (queueStore.queueLength.value === 0) return;
    clearConfirmOpen.value = true;
  };

  /** 即使列表已为空也停止原生音频，并等待持久化验证。 */
  const clearAll = async (): Promise<void> => {
    player.invalidatePlaybackOperation();
    await player.stop();
    statusStore.playIndex = -1;
    await clearQueue();
    useMediaStore().clear();
    useThemeStore().coverColor = null;
    clearConfirmOpen.value = false;
  };

  const playAtIndex = (index: number): void => {
    player.playAtIndex(index);
  };

  const removeAtIndex = (index: number): void => {
    // 当前队列面板暂无单项删除入口，保留排序与清空操作。
    if (index < 0) return;
  };

  const moveItem = (fromIndex: number, toIndex: number): void => {
    player.moveInQueue(fromIndex, toIndex);
  };

  return {
    queueEntries: queueStore.queueEntries,
    queueLength: queueStore.queueLength,
    playIndex: computed(() => statusStore.playIndex),
    clearConfirmOpen,
    requestClear,
    clearAll,
    playAtIndex,
    removeAtIndex,
    moveItem,
  };
};
