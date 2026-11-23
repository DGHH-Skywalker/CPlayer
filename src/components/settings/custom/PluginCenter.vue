<script setup lang="ts">
import { usePluginsStore } from "@/stores/plugins";
import { toast } from "@/composables/useToast";
const plugins = usePluginsStore();
const urlOpen = ref(false);
const url = ref("");
/** 导入本地脚本或插件包 */
const install = async (): Promise<void> => {
  const result = await plugins.pickAndInstall();
  if (!result.cancelled && !result.ok) toast.error(result.error ?? "导入失败");
};
/** 手动导入指定地址的脚本 */
const installUrl = async (): Promise<void> => {
  const result = await plugins.installFromUrl(url.value);
  if (!result.ok) toast.error(result.error ?? "导入失败");
  else urlOpen.value = false;
};
/** 用户主动恢复内置插件，不覆盖已保存参数 */
const restore = async (): Promise<void> => {
  await window.api.plugins.restoreBuiltin();
  await plugins.load();
};
</script>
<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2 items-center">
      <h2 class="text-xl font-semibold mr-auto">插件中心</h2>
      <SButton @click="install">导入</SButton>
      <SButton @click="urlOpen = true">URL</SButton>
      <SButton @click="restore">恢复 NoiseLimiter</SButton>
    </div>
    <NoiseLimiterStatus />
    <PluginList compact />
    <SDialog v-model:open="urlOpen" title="URL">
      <SInput v-model="url" @keydown.enter="installUrl" />
      <template #footer><SButton @click="installUrl">导入</SButton></template>
    </SDialog>
  </div>
</template>
