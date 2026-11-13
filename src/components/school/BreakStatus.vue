<script setup lang="ts">
import { schoolState } from "@/stores/school";
const now = useNow({ interval: 1000 });
const remaining = computed(() =>
  Math.max(0, Math.ceil(((schoolState.value.endAt ?? 0) - now.value.getTime()) / 1000)),
);
/** 格式化上海作息时间 */
const time = (value: number | null): string =>
  value == null
    ? "未配置"
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value);
</script>
<template>
  <SCard variant="primary" class="w-full" aria-live="polite">
    <strong>
      {{
        schoolState.pendingClear
          ? "正在停止并清空队列"
          : schoolState.phase === "BREAK"
            ? `课间 · ${schoolState.activeName}`
            : schoolState.phase === "CLASS"
              ? "上课中，点歌暂不可用"
              : "自动调度已关闭"
      }}
    </strong>
    <p v-if="schoolState.phase === 'BREAK'">
      剩余 {{ Math.floor(remaining / 60) }} 分 {{ remaining % 60 }} 秒 · 上课
      {{ time(schoolState.endAt) }}
    </p>
    <p>下次课间 {{ time(schoolState.nextStartAt) }} · 下次结束 {{ time(schoolState.nextEndAt) }}</p>
    <span class="text-xs text-on-surface-variant">学校时区 Asia/Shanghai</span>
  </SCard>
</template>
