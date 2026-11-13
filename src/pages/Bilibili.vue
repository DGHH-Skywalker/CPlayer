<script setup lang="ts">
import type { BilibiliState } from "@shared/types/bilibili";
import { useStatusStore } from "@/stores/status";
const state = shallowRef<BilibiliState | null>(null);
const surface = useTemplateRef<HTMLElement>("surface");
const address = ref("https://www.bilibili.com/");
const theater = ref(false);
const error = ref("");
const route = useRoute();
let unsubscribe: (() => void) | undefined;
let observer: MutationObserver | undefined;
let frame = 0;
let disposed = false;
let currentlyVisible = false;
/** 发送管理命令并显示被阻止的导航或加载错误 */
const command = async (name: string, value?: unknown): Promise<void> => {
  try {
    state.value = await window.api.bilibili.command(name, value);
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
};
/** 原生视图使用真实布局边界，弹窗和全屏音乐播放器出现时隐藏 */
const syncBounds = async (): Promise<void> => {
  if (disposed || !surface.value) return;
  const overlay = [
    ...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]'),
  ].some((el) => el.getClientRects().length > 0);
  const show =
    route.path === "/bilibili" &&
    !document.hidden &&
    !overlay &&
    !useStatusStore().isPlayerExpanded;
  if (show !== currentlyVisible) {
    currentlyVisible = show;
    await command(show ? "show" : "hide");
  }
  if (disposed || !show) return;
  const b = surface.value.getBoundingClientRect();
  await command("bounds", { x: b.x, y: b.y, width: b.width, height: b.height });
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
  unsubscribe = window.api.bilibili.onState((value) => {
    state.value = value;
    if (!value.visible && currentlyVisible) {
      currentlyVisible = false;
      scheduleBounds();
    }
    if (!value.loading) address.value = value.url;
  });
  observer = new MutationObserver(scheduleBounds);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "hidden", "aria-hidden"],
  });
  document.addEventListener("visibilitychange", scheduleBounds);
  window.addEventListener("resize", scheduleBounds);
  await syncBounds();
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  unsubscribe?.();
  cancelAnimationFrame(frame);
  document.removeEventListener("visibilitychange", scheduleBounds);
  window.removeEventListener("resize", scheduleBounds);
  void window.api.bilibili.command("hide");
});
</script>
<template>
  <div class="flex flex-col h-full min-h-[70vh] gap-3 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <SButton @click="$router.push('/')">返回点歌</SButton>
      <SButton :disabled="!state?.canGoBack" @click="command('back')">后退</SButton>
      <SButton :disabled="!state?.canGoForward" @click="command('forward')">前进</SButton>
      <SButton @click="command('reload')">刷新</SButton>
      <SButton @click="command('copy')">复制链接</SButton>
      <SButton @click="theater = !theater">{{ theater ? "网页浏览模式" : "MV 剧场模式" }}</SButton>
      <SButton @click="command('fullscreen')">全屏</SButton>
    </div>
    <form class="flex gap-2" @submit.prevent="command('navigate', address)">
      <SInput v-model="address" class="flex-1" aria-label="B 站网址" />
      <SButton @click="command('navigate', address)">打开</SButton>
    </form>
    <p>{{ state?.title ?? "哔哩哔哩" }} {{ state?.loading ? "· 加载中" : "" }}</p>
    <p v-if="error || state?.error" role="alert">
      {{ error || state?.error }}
      <SButton @click="command('recreate')">重新初始化</SButton>
    </p>
    <div
      ref="surface"
      class="flex-1 min-h-[45vh] rounded-lg bg-surface-panel"
      aria-label="B 站独立浏览区域"
    />
  </div>
</template>
