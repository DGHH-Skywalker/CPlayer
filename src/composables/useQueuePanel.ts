import { computed, ref } from "vue";
import { useQueueStore, clearQueue } from "@/stores/queue";
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { useThemeStore } from "@/stores/theme";
import { usePlayer } from "@/core/player";

export const useQueuePanel = () => {
  const { queueEntries, queueLength } = useQueueStore();
  const statusStore = useStatusStore();
  const player = usePlayer();

  const clearConfirmOpen = ref(false);

  const requestClear = (): void => {
    if (queueLength.value === 0) return;
    clearConfirmOpen.value = true;
  };

  const clearAll = (): void => {
    if (queueLength.value === 0) return;
    player.stop();
    statusStore.playIndex = -1;
    clearQueue();
    useMediaStore().clear();
    useThemeStore().coverColor = null;
    clearConfirmOpen.value = false;
  };

  const playAtIndex = (index: number): void => {
    player.playAtIndex(index);
  };

  const moveItem = (fromIndex: number, toIndex: number): void => {
    player.moveInQueue(fromIndex, toIndex);
  };

  return {
    queueEntries,
    queueLength,
    playIndex: computed(() => statusStore.playIndex),
    clearConfirmOpen,
    requestClear,
    clearAll,
    playAtIndex,
    moveItem,
  };
};
