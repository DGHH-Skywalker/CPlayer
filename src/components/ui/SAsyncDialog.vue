<script setup lang="ts">
import type { Component } from "vue";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  open: boolean;
  loader: () => Promise<{ default: Component }>;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const { t } = useI18n();
const component = shallowRef<Component>();
const loading = ref(false);
const error = ref("");
let disposed = false;

/** 首次打开才加载弹窗，关闭保留实例，失败可由用户重新尝试 */
const load = async (): Promise<void> => {
  if (component.value || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const module = await props.loader();
    if (!disposed) component.value = module.default;
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (!disposed) loading.value = false;
  }
};

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  disposed = true;
});
</script>

<template>
  <component
    :is="component"
    v-if="component"
    v-bind="$attrs"
    :open="open"
    @update:open="emit('update:open', $event)"
  />
  <SDialog v-else :open="open" @update:open="emit('update:open', $event)">
    <div
      role="status"
      class="flex min-h-20 flex-col items-center justify-center gap-3 text-on-surface-variant"
    >
      <template v-if="loading">
        <SLoading class="size-5 text-primary" />
        <span>{{ t("common.loading") }}</span>
      </template>
      <template v-else-if="error">
        <span class="text-sm break-all">{{ error }}</span>
        <SButton @click="load">{{ t("common.retry") }}</SButton>
      </template>
    </div>
  </SDialog>
</template>
