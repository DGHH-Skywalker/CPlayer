<script setup lang="ts">
import { schoolState, canRequestNow } from "@/stores/school";
import { queue } from "@/stores/queue";
import { useStatusStore } from "@/stores/status";
import { stopAndClearForClass } from "@/services/requestPlayback";
const query = ref("");
const router = useRouter();
const status = useStatusStore();
/** 使用原有搜索页面和歌曲列表 */
const search = (): void => {
  if (query.value.trim()) void router.push({ path: "/search", query: { q: query.value.trim() } });
};
</script>
<template>
  <div class="flex flex-col items-center justify-center min-h-[65vh] gap-6 p-6">
    <h1 class="text-3xl font-semibold">Cplayer 校园点歌</h1>
    <BreakStatus />
    <form class="flex gap-3 w-full max-w-xl" @submit.prevent="search">
      <SInput v-model="query" placeholder="搜索歌曲、歌手" class="flex-1" size="large" />
      <SButton>搜索</SButton>
    </form>
    <p v-if="!canRequestNow()" role="status">上课中，点歌暂不可用</p>
    <SCard class="w-full max-w-xl" title="本次点歌">
      <p>当前：{{ status.currentTrack?.title ?? "暂无" }}</p>
      <p>下一首：{{ queue[status.playIndex + 1]?.title ?? "暂无" }}</p>
      <p>待播 {{ Math.max(0, queue.length - status.playIndex - 1) }} 首</p>
      <SButton @click="stopAndClearForClass()">停止并清空</SButton>
    </SCard>
    <p
      v-if="schoolState.config.scheduleEnabled && !schoolState.config.breaks.length"
      class="text-on-surface-variant"
    >
      请在设置 → 校园点歌中配置学校作息
    </p>
  </div>
</template>
