import { shallowRef } from "vue";
import type { BilibiliSongEvent } from "@shared/types/bilibili";
import { clampSeekPosition, sanitizeTimeRanges } from "@shared/bilibiliTimeline";
import * as playback from "./playback";
import { useStatusStore } from "@/stores/status";
import { toast } from "@/composables/useToast";
interface PendingSeek {
  id: string;
  order?: number;
  token: string;
  target: number;
  timer: ReturnType<typeof setTimeout>;
}
let pending: PendingSeek | null = null;
let lastSeekOrder = 0;
export const bilibiliTimeline = shallowRef({
  pendingTarget: null as number | null,
  buffering: false,
  buffered: [] as [number, number][],
  seekable: [] as [number, number][],
});
/** 停止或切歌时作废定位及补偿计时器，不能让旧回报覆盖新曲目 */
export const cancelBilibiliSeek = (): void => {
  if (pending) clearTimeout(pending.timer);
  pending = null;
  lastSeekOrder = 0;
  playback.setSeeking(false);
  bilibiliTimeline.value = { pendingTarget: null, buffering: false, buffered: [], seekable: [] };
};
/**
 * 乐观显示目标，只提交一次请求；超时查询真实位置而不重新播放
 * @param token - 当前网页曲目操作标识
 * @param position - 毫秒目标
 * @param allowed - 当前曲目及校园代次是否仍有效
 */
export const seekBilibili = async (
  token: string,
  position: number,
  allowed: () => boolean,
): Promise<void> => {
  const status = useStatusStore();
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(status.duration) ||
    status.duration <= 0 ||
    !allowed()
  )
    return;
  if (pending) clearTimeout(pending.timer);
  const target = clampSeekPosition(position, status.duration, bilibiliTimeline.value.seekable);
  const id = crypto.randomUUID();
  const request: PendingSeek = {
    id,
    token,
    target,
    timer: setTimeout(() => {
      if (pending !== request) return;
      if (!allowed()) {
        cancelBilibiliSeek();
        return;
      }
      void window.api.bilibili
        .controlSong("inspect", token, undefined, id)
        .finally(() => {
          if (pending === request) {
            pending = null;
            playback.setSeeking(false);
            bilibiliTimeline.value = {
              ...bilibiliTimeline.value,
              pendingTarget: null,
              buffering: false,
            };
            toast.error("视频定位超时");
          }
        })
        .catch(() => {});
    }, 10000),
  };
  pending = request;
  bilibiliTimeline.value = { ...bilibiliTimeline.value, pendingTarget: target, buffering: true };
  playback.setSeeking(true);
  status.position = target;
  playback.setCurrentTime(target, { force: true });
  try {
    const result = await window.api.bilibili.controlSong("seek", token, target, id);
    if (pending === request && result?.seekId === id) {
      request.order = result.seekOrder;
      lastSeekOrder = Math.max(lastSeekOrder, result.seekOrder ?? 0);
    }
  } catch (error) {
    if (pending === request) {
      cancelBilibiliSeek();
      throw error;
    }
  }
};
/**
 * 更新缓存并判断是否允许使用本次位置，旧时间回报不能拉回定位目标
 * @param event - 主进程验证的最新网页状态
 * @returns 是否已确认真实位置
 */
export const acceptBilibiliPosition = (event: BilibiliSongEvent): boolean => {
  // owner 校验由调用方完成，终态不能被在途定位的旧序号吞掉
  const terminal = ["ended", "error", "stopped"].includes(event.state);
  if (!terminal && event.seekOrder !== undefined && event.seekOrder < lastSeekOrder) return false;
  let request = pending;
  if (!terminal && request && event.seekId !== request.id) {
    if (
      request.order !== undefined &&
      event.seekOrder !== undefined &&
      event.seekOrder > request.order
    ) {
      clearTimeout(request.timer);
      pending = null;
      request = null;
      playback.setSeeking(false);
    } else return false;
  }
  if (request && event.seekOrder !== undefined) request.order = event.seekOrder;
  lastSeekOrder = Math.max(lastSeekOrder, event.seekOrder ?? 0);
  bilibiliTimeline.value = {
    pendingTarget: pending?.target ?? null,
    buffering: event.buffering === true,
    buffered: sanitizeTimeRanges(event.buffered, event.duration),
    seekable: sanitizeTimeRanges(event.seekable, event.duration),
  };
  if (!request) return true;
  if (
    event.state === "ended" ||
    event.state === "error" ||
    event.state === "stopped" ||
    (event.seekId === request.id && (event.seekPhase === "seeked" || event.seekPhase === "failed"))
  ) {
    clearTimeout(request.timer);
    pending = null;
    playback.setSeeking(false);
    bilibiliTimeline.value = { ...bilibiliTimeline.value, pendingTarget: null };
    if (event.seekPhase === "failed") toast.error("视频定位超时");
    return true;
  }
  const status = useStatusStore();
  status.state =
    event.state === "loading"
      ? event.paused
        ? "paused"
        : "loading"
      : (event.state as typeof status.state);
  playback.setPlaying(event.state === "playing");
  return false;
};
