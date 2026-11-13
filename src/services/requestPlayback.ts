import type { Track, PlaybackContext } from "@shared/types/player";
import * as player from "@/core/player";
import * as queue from "@/stores/queue";
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { canRequestNow, schoolState } from "@/stores/school";
import { toast } from "@/composables/useToast";
export { canRequestNow } from "@/stores/school";

/** 获取当前校园点歌状态 */
export const getRequestState = () => schoolState.value;

/**
 * 统一批量点歌，复用播放器末尾插入与去重
 * @param tracks - 待点歌曲
 * @param context - 原始来源上下文
 * @returns 实际添加数
 */
export const requestSongs = (tracks: readonly Track[], context?: PlaybackContext): number => {
  if (!canRequestNow()) {
    toast.info("上课中，点歌暂不可用");
    return 0;
  }
  const status = useStatusStore();
  player.setShuffleMode("off");
  player.setRepeatMode("list");
  status.fmMode = false;
  status.heartMode = false;
  const seen = new Set(queue.queue.value.map((track) => track.id));
  const fresh = tracks.filter((track) => {
    if (!track?.id || !track.title || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
  queue.insertManyToQueue(fresh, queue.queueLength.value, context);
  const count = fresh.length;
  if (!count) toast.info("歌曲已经在队列中");
  const snapshot = schoolState.value;
  const active =
    snapshot.config.breaks.find((b) => snapshot.activeId?.endsWith(`/${b.id}`)) ??
    Object.values(snapshot.config.specialDates)
      .flat()
      .find((b) => snapshot.activeId?.endsWith(`/${b.id}`));
  if (
    count &&
    status.playIndex < 0 &&
    snapshot.config.autoPlayFirstRequest &&
    (active?.autoPlayFirstRequest ?? true)
  ) {
    void player.playAtIndex(0);
  }
  return count;
};

/**
 * 点播单首歌曲
 * @param track - 待点歌曲
 * @param context - 来源上下文
 */
export const requestSong = (track: Track, context?: PlaybackContext): number =>
  requestSongs([track], context);

/**
 * 人工调整队列顺序
 * @param from - 原索引
 * @param to - 目标索引
 */
export const reorderRequests = (from: number, to: number): void => {
  if (canRequestNow()) player.moveInQueue(from, to);
};

/**
 * 无条件停止并可靠清空，即使 UI 队列为空也停止原生音频
 * @param eventId - 调度结束事件，手动清空可省略
 */
export const stopAndClearForClass = async (eventId?: string): Promise<void> => {
  const stopping = player.stop();
  player.resetPlaybackPresentation();
  useMediaStore().clear();
  const clearing = queue.clearQueue();
  await Promise.all([stopping, clearing]);
  if (eventId) {
    const snapshot = await window.api.school.acknowledge(eventId);
    if (snapshot.generation >= schoolState.value.generation) schoolState.value = snapshot;
  }
};
