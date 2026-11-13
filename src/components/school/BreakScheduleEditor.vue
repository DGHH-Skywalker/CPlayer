<script setup lang="ts">
import type { SchoolConfig, SchoolBreak } from "@shared/types/school";
const model = defineModel<SchoolConfig>({ required: true });
const day = ref(1);
const specialDate = ref("");
const copyTargets = ref<number[]>([]);
const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const rows = computed(() =>
  specialDate.value
    ? (model.value.specialDates[specialDate.value] ?? [])
    : model.value.breaks.filter((b) => b.weekdays.includes(day.value)),
);
/** 新增空时间段，由用户输入实际作息 */
const add = (): void => {
  const b: SchoolBreak = {
    id: crypto.randomUUID(),
    name: "课间",
    weekdays: [day.value],
    startTime: "",
    endTime: "",
    enabled: true,
    autoPlayFirstRequest: true,
  };
  if (specialDate.value) (model.value.specialDates[specialDate.value] ??= []).push(b);
  else model.value.breaks.push(b);
};
/** 删除当前选定日期或星期的课间 */
const remove = (id: string): void => {
  if (specialDate.value)
    model.value.specialDates[specialDate.value] = rows.value.filter((b) => b.id !== id);
  else
    model.value.breaks = model.value.breaks.flatMap((b) =>
      b.id !== id
        ? [b]
        : b.weekdays.length > 1
          ? [{ ...b, weekdays: b.weekdays.filter((d) => d !== day.value) }]
          : [],
    );
};
/** 复制一条课间供用户调整 */
const duplicate = (b: SchoolBreak): void => {
  const copy = { ...b, weekdays: [...b.weekdays], id: crypto.randomUUID() };
  if (specialDate.value) model.value.specialDates[specialDate.value].push(copy);
  else model.value.breaks.push(copy);
};
/** 将当天作息替换复制到选定星期 */
const copyDay = (): void => {
  const source = rows.value.map((b) => ({ ...b }));
  model.value.breaks = model.value.breaks
    .map((b) => ({ ...b, weekdays: b.weekdays.filter((d) => !copyTargets.value.includes(d)) }))
    .filter((b) => b.weekdays.length);
  for (const target of copyTargets.value)
    for (const b of source)
      model.value.breaks.push({ ...b, id: crypto.randomUUID(), weekdays: [target] });
};
/** 按开始时间排序课间列表 */
const sort = (): void => {
  if (specialDate.value)
    model.value.specialDates[specialDate.value]?.sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
  else model.value.breaks.sort((a, b) => a.startTime.localeCompare(b.startTime));
};
/** 取消特殊日期覆盖，恢复每周作息 */
const removeSpecial = (): void => {
  delete model.value.specialDates[specialDate.value];
  specialDate.value = "";
};
</script>
<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2">
      <SButton
        v-for="(label, i) in days"
        :key="label"
        @click="
          day = i + 1;
          specialDate = '';
        "
      >
        {{ day === i + 1 && !specialDate ? "✓ " : "" }}{{ label }}
      </SButton>
    </div>
    <label>
      特殊日期
      <input v-model="specialDate" type="date" aria-label="特殊日期" />
    </label>
    <div v-if="specialDate" class="flex gap-2">
      <SButton @click="model.specialDates[specialDate] ??= []">
        启用当天独立作息（空表表示停用）
      </SButton>
      <SButton @click="removeSpecial">删除特殊日期</SButton>
    </div>
    <div
      v-for="b in rows"
      :key="b.id"
      class="flex flex-wrap gap-2 items-center border border-primary/20 rounded-lg p-3"
    >
      <SSwitch v-model="b.enabled" />
      <SInput v-model="b.name" placeholder="课间名称" class="w-32" />
      <input v-model="b.startTime" type="time" aria-label="开始时间" />
      至
      <input v-model="b.endTime" type="time" aria-label="结束时间" />
      <label>
        <input v-model="b.autoPlayFirstRequest" type="checkbox" />
        首首点歌自动播放
      </label>
      <SButton @click="duplicate(b)">复制</SButton>
      <SButton @click="remove(b.id)">删除</SButton>
    </div>
    <p v-if="!rows.length" class="text-on-surface-variant">尚无课间，请输入实际学校作息</p>
    <div class="flex gap-2">
      <SButton @click="add">添加课间</SButton>
      <SButton @click="sort">按时间排序</SButton>
    </div>
    <div v-if="!specialDate" class="flex flex-wrap items-center gap-2">
      <label v-for="(label, i) in days" :key="label">
        <input v-model="copyTargets" type="checkbox" :value="i + 1" :disabled="day === i + 1" />
        {{ label }}
      </label>
      <SButton @click="copyDay">覆盖复制到所选星期</SButton>
    </div>
    <p>跨午夜课间归开始日期；上课时硬停止、清空，不保留旧任务</p>
    <label>
      临时停用日期（逗号分隔）
      <SInput
        :model-value="model.disabledDates.join(',')"
        placeholder="YYYY-MM-DD,YYYY-MM-DD"
        @update:model-value="
          model.disabledDates = $event
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        "
      />
    </label>
    <p>已有特殊日期：{{ Object.keys(model.specialDates).join("、") || "无" }}</p>
  </div>
</template>
