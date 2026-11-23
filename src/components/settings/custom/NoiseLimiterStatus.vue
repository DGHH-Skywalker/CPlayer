<script setup lang="ts">
import type { AudioEffectsState } from "@shared/types/audioEffects";
const state = shallowRef<AudioEffectsState>();
let timer: ReturnType<typeof setInterval> | undefined;
/** 仅在插件中心显示期间读取低频诊断，不传输采样 */
const refresh = async (): Promise<void> => {
  state.value = await window.api.plugins.effectsState();
};
onMounted(() => {
  void refresh();
  timer = setInterval(() => {
    void refresh();
  }, 500);
});
onBeforeUnmount(() => clearInterval(timer));
const labels = {
  pending: "待播放",
  active: "就绪",
  fallback: "保护",
  error: "故障",
  idle: "待播放",
};
</script>
<template>
  <div
    v-if="state?.enabled"
    class="flex items-center gap-3 text-sm text-on-surface-variant"
    role="status"
  >
    <span>音乐 {{ labels[state.native] }}</span>
    <span>B 站 {{ labels[state.browser] }}</span>
    <span class="ml-auto">−{{ state.reductionDb.toFixed(1) }} dB</span>
  </div>
</template>
