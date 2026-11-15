import type { Track } from "@shared/types/player";
import type { BilibiliSongEvent } from "@shared/types/bilibili";
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { canRequestNow, schoolState } from "@/stores/school";
import * as playback from "@/services/playback";
import { nextTrack, stop } from "@/core/player";
import { queueLength, queue } from "@/stores/queue";
import { toast } from "@/composables/useToast";

let active: {
  token: string;
  id: string;
  generation: number;
  revision: number;
  finished?: boolean;
} | null = null;
let revision = 0;
let unsubscribe: (() => void) | undefined;

/** 判断原生事件是否应由当前网页队列项隔离 */
export const isBilibiliSongActive = (): boolean => active !== null;

/**
 * 消费当前网页项的状态，仅自然结束推进一次，过期事件无效
 * @param event - 主进程验证的网页状态
 */
export const handleBilibiliSongEvent = async (event: BilibiliSongEvent): Promise<void> => {
  const owner = active;
  if (
    !owner ||
    owner.finished ||
    owner.token !== event.token ||
    owner.id !== event.trackId ||
    owner.generation !== schoolState.value.generation ||
    !canRequestNow()
  )
    return;
  const status = useStatusStore();
  if (status.currentTrack?.id !== owner.id || useMediaStore().track?.id !== owner.id) return;
  status.position = event.position;
  status.duration = event.duration;
  playback.setCurrentTime(event.position, { force: true });
  playback.setDuration(event.duration);
  if (event.state === "ended") {
    owner.finished = true;
    playback.setPlaying(false);
    status.state = "stopped";
    const index = status.playIndex;
    await window.api.bilibili.controlSong("stop", owner.token);
    if (
      active !== owner ||
      revision !== owner.revision ||
      !canRequestNow() ||
      owner.generation !== schoolState.value.generation
    )
      return;
    active = null;
    status.isPlayerExpanded = false;
    const { default: router } = await import("@/router");
    if (
      queue.value[index + 1]?.source !== "bilibili" &&
      router.currentRoute.value.path === "/bilibili"
    )
      await router.push("/");
    if (
      active ||
      revision !== owner.revision ||
      !canRequestNow() ||
      owner.generation !== schoolState.value.generation ||
      status.playIndex !== index ||
      status.currentTrack?.id !== owner.id
    )
      return;
    if (index >= queueLength.value - 1) await stop();
    else await nextTrack();
  } else if (event.state === "error") {
    await stopBilibiliSong();
    status.state = "stopped";
    status.trackLoading = false;
    toast.error("哔哩Song 播放失败，请刷新网页或关闭 Core 后重试");
  } else {
    if (event.state === "stopped") active = null;
    status.state = event.state;
    status.trackLoading = event.state === "loading";
    playback.setPlaying(event.state === "playing");
  }
};

/**
 * 在现有队列索引上启动网页播放器，页面显示交由既有路由
 * @param track - 已验证的网页曲目
 * @param autoPlay - 是否立即播放
 */
export const startBilibiliSong = async (track: Track, autoPlay: boolean): Promise<void> => {
  if (!schoolState.value.config.bilibili.biliSongEnabled) throw new Error("请先启用实验性哔哩Song");
  const previous = active;
  const owner = {
    token: crypto.randomUUID(),
    id: track.id,
    generation: schoolState.value.generation,
    revision: ++revision,
  };
  active = owner;
  useStatusStore().isPlayerExpanded = false;
  if (previous) await window.api.bilibili.controlSong("stop", previous.token);
  if (active !== owner || !canRequestNow()) return;
  if (!unsubscribe)
    unsubscribe = window.api.bilibili.onSong((event) => {
      void handleBilibiliSongEvent(event);
    });
  const result = await window.api.player.stop();
  if (!result.success) throw new Error("无法停止音乐播放器");
  if (active !== owner || !canRequestNow()) return;
  const { default: router } = await import("@/router");
  await router.push("/bilibili");
  if (active !== owner || !canRequestNow()) return;
  await window.api.bilibili.playSong(toRaw(track), owner.token, autoPlay);
};

/** 停止并作废当前网页项，空状态下无需发送 IPC */
export const stopBilibiliSong = async (): Promise<void> => {
  revision++;
  const owner = active;
  active = null;
  if (owner) await window.api.bilibili.controlSong("stop", owner.token);
};

/**
 * 转发当前网页项的用户操作
 * @param command - 播放、暂停或定位
 * @param position - 毫秒进度
 */
export const controlBilibiliSong = async (
  command: "play" | "pause" | "seek",
  position?: number,
): Promise<void> => {
  const owner = active;
  if (!owner || !canRequestNow()) return;
  if (command === "play") {
    useStatusStore().isPlayerExpanded = false;
    const { default: router } = await import("@/router");
    await router.push("/bilibili");
  }
  if (active === owner && canRequestNow() && owner.generation === schoolState.value.generation)
    await window.api.bilibili.controlSong(command, owner.token, position);
};
