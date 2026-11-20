<script setup lang="ts">
import type { Track } from "@shared/types/player";
import { bilibiliSurfaceBounds } from "@/services/bilibiliSurface";
import type { BilibiliState } from "@shared/types/bilibili";
import { useStatusStore } from "@/stores/status";
import { isSchoolMode, canRequestNow } from "@/stores/school";
import { requestSong } from "@/services/requestPlayback";
import * as player from "@/core/player";
import { toast } from "@/composables/useToast";
import { queue } from "@/stores/queue";
const state = shallowRef<BilibiliState | null>(null);
const surface = useTemplateRef<HTMLElement>("surface");
const theater = ref(false);
const error = ref("");
const route = useRoute();
let unsubscribe: (() => void) | undefined;
let unsubscribeRequest: (() => void) | undefined;
let observer: MutationObserver | undefined;
let frame = 0;
let disposed = false;
let display: "hidden" | "visible" | "occluded" = "hidden";
let layoutRevision = 0;
/** 将当前视频作为独立队列项追加，校园模式遵守课间闸门 */
const addSong = (track: Track): void => {
  try {
    if (!canRequestNow()) throw new Error("上课中，点歌暂不可用");
    if (queue.value.some((item) => item.id === track.id)) {
      toast.info("歌曲已经在队列中");
      return;
    }
    if (isSchoolMode()) {
      if (!requestSong(track)) return;
    } else player.insertManyToQueue([track], "end");
    toast.info("哔哩Song 已加入播放列表");
  } catch (e) {
    error.value = String(e);
  }
};
/** 发送管理命令并显示被阻止的导航或加载错误 */
const command = async (name: string, value?: unknown): Promise<void> => {
  try {
    state.value = await window.api.bilibili.command(name, value);
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
};
/** 搜索等弹窗仅遮住画面，离开页面或窗口隐藏才暂停媒体 */
const syncBounds = async (): Promise<void> => {
  if (disposed || !surface.value) return;
  const revision = ++layoutRevision;
  const overlay = [
    ...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]'),
  ].some((el) => el.getClientRects().length > 0);
  const show = route.path === "/bilibili" && !document.hidden && !useStatusStore().isPlayerExpanded;
  if (!show) {
    if (display !== "hidden") {
      display = "hidden";
      await command("hide");
    }
    return;
  }
  const content = document.querySelector<HTMLElement>("[data-main-content]");
  const footer = document.querySelector<HTMLElement>("[data-player-bar]");
  const b = surface.value.getBoundingClientRect();
  const clipped = bilibiliSurfaceBounds(
    b,
    content?.getBoundingClientRect() ?? b,
    { width: window.innerWidth, height: window.innerHeight },
    footer?.getBoundingClientRect(),
  );
  await command("bounds", clipped);
  if (disposed || revision !== layoutRevision) return;
  const next = overlay ? "occluded" : "visible";
  if (display !== next) {
    display = next;
    await command(overlay ? "occlude" : "show");
  }
};
/** 将布局变化合并到一次动画帧，隐藏时不持续运行 */
const scheduleBounds = (): void => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    void syncBounds();
  });
};
useResizeObserver(surface, scheduleBounds);
watch(() => useStatusStore().isPlayerExpanded, scheduleBounds);
watch(theater, (value) => {
  void command("theater", value);
});
onMounted(async () => {
  unsubscribeRequest = window.api.bilibili.onRequest((request) => {
    if (disposed) return;
    if (request.error) error.value = request.error;
    else if (request.track) addSong(request.track);
  });
  unsubscribe = window.api.bilibili.onState((value) => {
    state.value = value;
    if (!value.visible && display !== "hidden") {
      display = "hidden";
      scheduleBounds();
    }
  });
  observer = new MutationObserver(scheduleBounds);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "hidden", "aria-hidden"],
  });
  document.addEventListener("visibilitychange", scheduleBounds);
  document.addEventListener("transitionend", scheduleBounds, true);
  window.addEventListener("resize", scheduleBounds);
  window.addEventListener("scroll", scheduleBounds, true);
  await syncBounds();
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  unsubscribe?.();
  unsubscribeRequest?.();
  cancelAnimationFrame(frame);
  document.removeEventListener("visibilitychange", scheduleBounds);
  document.removeEventListener("transitionend", scheduleBounds, true);
  window.removeEventListener("resize", scheduleBounds);
  window.removeEventListener("scroll", scheduleBounds, true);
  void window.api.bilibili.command("hide");
});
</script>
<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden gap-2 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <SButton @click="command('reload')">刷新</SButton>
      <SButton @click="command('copy')">复制链接</SButton>
      <SButton @click="theater = !theater">{{ theater ? "网页浏览模式" : "MV 剧场模式" }}</SButton>
      <SButton @click="command('fullscreen')">全屏</SButton>
    </div>
    <p v-if="error || state?.error" role="alert">
      {{ error || state?.error }}
      <SButton @click="command('recreate')">重新初始化</SButton>
    </p>
    <div
      ref="surface"
      class="flex-1 min-h-0 rounded-lg bg-surface-panel"
      aria-label="B 站独立浏览区域"
    />
  </div>
</template>
