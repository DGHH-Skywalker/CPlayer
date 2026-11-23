<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { bilibiliTimeline } from "@/services/bilibiliSeek";
import { controlBilibiliSong } from "@/services/bilibiliSong";
import { formatTime } from "@/utils/time";
import { toast } from "@/composables/useToast";
const status = useStatusStore();
const preview = ref<number | null>(null);
const displayed = computed(
  () => preview.value ?? bilibiliTimeline.value.pendingTarget ?? status.position,
);
const disabled = computed(() => !Number.isFinite(status.duration) || status.duration <= 0);
/** 松手只提交一次精确定位，暂停状态交给网页保持 */
const commit = async (value: number): Promise<void> => {
  preview.value = null;
  try {
    await controlBilibiliSong("seek", value);
  } catch {
    toast.error("视频定位失败");
  }
};
watch(
  () => useMediaStore().track?.id,
  () => {
    preview.value = null;
  },
);
</script>
<template>
  <div
    data-bilibili-progress
    class="flex items-center gap-2 h-7 min-w-0"
    aria-label="哔哩Song 进度"
  >
    <span class="text-xs tabular-nums w-12 shrink-0">{{ formatTime(displayed) }}</span>
    <div class="relative flex-1 min-w-0">
      <div
        class="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 pointer-events-none overflow-hidden rounded-full"
      >
        <span
          v-for="(range, index) in bilibiliTimeline.buffered"
          :key="index"
          class="absolute h-full bg-on-surface/25"
          :style="{
            left: `${(range[0] / Math.max(status.duration, 1)) * 100}%`,
            width: `${((range[1] - range[0]) / Math.max(status.duration, 1)) * 100}%`,
          }"
        />
      </div>
      <SSlider
        :model-value="displayed"
        :min="0"
        :max="Math.max(1, status.duration)"
        :step="100"
        :disabled="disabled"
        :show-popover="false"
        :thumb-size="14"
        :track-height="3"
        @change="preview = $event"
        @drag-end="commit"
        @drag-cancel="preview = null"
      />
    </div>
    <IconLucideLoaderCircle
      v-if="bilibiliTimeline.buffering"
      class="size-3 animate-spin shrink-0"
      aria-label="缓冲中"
    />
    <span class="text-xs tabular-nums w-12 shrink-0 text-right">
      {{ formatTime(status.duration) }}
    </span>
  </div>
</template>
