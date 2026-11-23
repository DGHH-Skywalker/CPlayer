<script setup lang="ts">
import { consumePluginCenterKey, syncPluginCenter } from "@/settings/pluginCenter";
import { settingsSchema } from "@/settings/schema";
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { useSettingsStore } from "@/stores/settings";
import { openExternal } from "@/utils/url";
import { REPO_URL, REPO_NAME, APP_VERSION, IS_APPX } from "@/utils/config";

const { initialCategory, initialHighlight, initialParentKeys, rememberCategory } =
  useSettingsDialog();

// 同步后端配置
useSettingsStore().syncSystem();
const { t } = useI18n();

const activeId = ref(initialCategory.value);
const highlightKey = ref(initialHighlight.value);
const scrollRef = ref<HTMLElement>();
const isSearchActive = ref(false);

const activeCategory = computed(() =>
  settingsSchema.find((c) => c.id === activeId.value && (!c.visible || c.visible())),
);
/** 设置容器接收隐藏入口快捷键 */
const onCenterKey = async (event: KeyboardEvent): Promise<void> => {
  if (await consumePluginCenterKey(event)) onCategorySelect("plugins");
};

/** 计算每个 section 的全局起始索引 */
const sectionStartIndices = computed(() => {
  const indices: number[] = [];
  let idx = 0;
  for (const sec of activeCategory.value?.sections ?? []) {
    indices.push(idx);
    idx += 1 + sec.items.length;
  }
  return indices;
});

let pendingHighlight: { categoryId: string; keys: string[] } | undefined;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 选中分类并取消上一次定位，异步内容就绪后由占位层移交显示
 * @param id - 设置分类标识
 */
const onCategorySelect = (id: string): void => {
  activeId.value = id;
  highlightKey.value = undefined;
  pendingHighlight = undefined;
  clearTimeout(highlightTimer);
  rememberCategory(id);
  nextTick(() => scrollRef.value?.scrollTo({ top: 0 }));
};

/** 在异步设置内容实际挂载后定位，避免慢磁盘上固定延时失效 */
const locateHighlight = async (): Promise<void> => {
  await nextTick();
  const target = pendingHighlight;
  if (!target || target.categoryId !== activeId.value) return;
  const el = target.keys.map((key) => document.getElementById(`setting-${key}`)).find(Boolean);
  if (!el) return;
  pendingHighlight = undefined;
  highlightKey.value = el.id.slice("setting-".length);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightKey.value = undefined;
  }, 2500);
};

/**
 * 定位设置项，子项收起时定位最近的父项
 * @param categoryId - 设置分类
 * @param itemKey - 设置项键名
 * @param parentKeys - 从外到内的父项键名
 */
const onSearchSelect = (categoryId: string, itemKey: string, parentKeys: string[] = []): void => {
  clearTimeout(highlightTimer);
  highlightKey.value = itemKey;
  pendingHighlight = { categoryId, keys: [itemKey, ...parentKeys.toReversed()] };
  activeId.value = categoryId;
  void locateHighlight();
};

onMounted(async () => {
  await syncPluginCenter();
  if (!activeCategory.value) activeId.value = "general";
  document.querySelector<HTMLElement>("[data-settings-content]")?.focus();
  if (initialHighlight.value) {
    onSearchSelect(initialCategory.value, initialHighlight.value, initialParentKeys.value);
  }
});
onBeforeUnmount(() => {
  pendingHighlight = undefined;
  clearTimeout(highlightTimer);
  void window.api.plugins.centerReset();
});
</script>

<template>
  <div
    data-settings-content
    tabindex="-1"
    class="flex h-full overflow-hidden outline-none"
    @keydown.capture="onCenterKey"
  >
    <!-- 左侧 -->
    <div class="w-70 shrink-0 flex flex-col bg-surface-panel p-5">
      <h2 class="text-2xl font-bold mb-1 px-1">{{ t("settings.title") }}</h2>
      <p class="text-sm text-on-surface-variant/80 mb-5 px-1">{{ t("settings.subtitle") }}</p>

      <!-- 搜索 -->
      <SettingsSearch
        class="mb-4"
        @select="onSearchSelect"
        @active-change="isSearchActive = $event"
      />

      <!-- 菜单 -->
      <Transition name="fade">
        <div
          v-show="!isSearchActive"
          class="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] -mr-5 pr-5"
        >
          <SettingsMenu
            :categories="settingsSchema"
            :active-id="activeId"
            @select="onCategorySelect"
          />
        </div>
      </Transition>

      <!-- 底部 -->
      <div class="shrink-0 mt-auto pt-4 px-1 flex items-center gap-1">
        <SButton variant="text" size="tiny" @click="openExternal(REPO_URL)">
          <template #icon><IconLucideGithub /></template>
          {{ REPO_NAME }}
        </SButton>
        <STag size="tiny">v{{ APP_VERSION }}</STag>
        <STag v-if="IS_APPX" size="tiny">{{ t("settings.storeVersion") }}</STag>
      </div>
    </div>

    <!-- 右侧 -->
    <div
      ref="scrollRef"
      class="flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-surface py-6 px-8"
    >
      <Suspense v-if="activeCategory" :key="activeCategory.id" @resolve="locateHighlight">
        <div class="animate-fade-in">
          <component
            :is="activeCategory.component"
            v-if="activeCategory.component"
            :highlight-key="highlightKey"
          />
          <template v-else>
            <SettingsSection
              v-for="(sec, si) in activeCategory.sections"
              :key="sec.id"
              :section="sec"
              :highlight-key="highlightKey"
              :start-index="sectionStartIndices[si] ?? 0"
            />
          </template>
        </div>
        <template #fallback>
          <div
            role="status"
            class="flex items-center justify-center min-h-32 gap-2 text-on-surface-variant"
          >
            <SLoading class="size-5 text-primary" />
            {{ t("common.loading") }}
          </div>
        </template>
      </Suspense>
    </div>
  </div>
</template>
