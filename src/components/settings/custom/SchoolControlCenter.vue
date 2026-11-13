<script setup lang="ts">
import { schoolState } from "@/stores/school";
import { validateSchoolConfig } from "@shared/school/schedule";
import { stopAndClearForClass } from "@/services/requestPlayback";
const draft = ref(structuredClone(toRaw(schoolState.value.config)));
const error = ref("");
const busy = ref(false);
const browserInfo = ref("");
const clearOpen = ref(false);
const validation = computed(() => {
  try {
    validateSchoolConfig(draft.value);
    return "";
  } catch (e) {
    return String(e);
  }
});
/** 校验后保存主进程唯一配置并立即重算调度 */
const save = async (): Promise<void> => {
  busy.value = true;
  error.value = "";
  try {
    const snapshot = await window.api.school.configure(structuredClone(toRaw(draft.value)));
    if (snapshot.generation >= schoolState.value.generation) schoolState.value = snapshot;
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
};
/** 导出完整校园配置 */
const exportConfig = (): void => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(draft.value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "carbonv_player-school.json";
  link.click();
  URL.revokeObjectURL(url);
};
/** 校验并应用用户选择的配置文件 */
const importConfig = async (event: Event): Promise<void> => {
  try {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) draft.value = validateSchoolConfig(JSON.parse(await file.text()));
  } catch (e) {
    error.value = String(e);
  }
};
/** 执行浏览器命令并显示成功或失败状态 */
const browserCommand = async (command: string): Promise<void> => {
  try {
    error.value = "";
    const info = await window.api.bilibili.command(command);
    browserInfo.value = `Core ${info.coreVersion} · ${info.coreLoaded ? "已加载" : "未加载"} · ${info.temporaryDisabled ? "临时禁用" : "遵循永久配置"} · 独立浏览会话 · ${info.url}`;
  } catch (e) {
    error.value = String(e);
  }
};
/** 手动结束课间并显示失败原因 */
const endBreak = async (): Promise<void> => {
  try {
    await window.api.school.endBreak();
  } catch (e) {
    error.value = String(e);
  }
};
/** 确认后清除专用会话 */
const clearBrowser = async (): Promise<void> => {
  clearOpen.value = false;
  await browserCommand("clear");
};
watchDebounced(
  draft,
  () => {
    if (!validation.value) void save();
  },
  { deep: true, debounce: 250 },
);
</script>
<template>
  <div class="flex flex-col gap-5">
    <BreakStatus />
    <SCard title="点歌管理" variant="settings">
      <div class="flex flex-col gap-3">
        <label class="flex justify-between">
          启用校园点歌模式
          <SSwitch v-model="draft.enabled" />
        </label>
        <label class="flex justify-between">
          使用搜索框首页
          <SSwitch v-model="draft.searchHome" />
        </label>
        <label class="flex justify-between">
          自动播放课间第一首点歌
          <SSwitch v-model="draft.autoPlayFirstRequest" />
        </label>
        <p>按添加顺序播放，重复点歌保留原位置并提示，支持队列拖拽排序</p>
        <SButton @click="stopAndClearForClass()">停止并清空音乐队列</SButton>
      </div>
    </SCard>
    <SCard title="课间时间表" variant="settings">
      <div class="flex flex-col gap-3">
        <label class="flex justify-between">
          启用自动调度
          <SSwitch v-model="draft.scheduleEnabled" />
        </label>
        <BreakScheduleEditor v-model="draft" />
        <SButton @click="endBreak">立即结束本次课间</SButton>
        <div class="flex gap-3">
          <SButton @click="exportConfig">导出 JSON</SButton>
          <label>
            导入 JSON
            <input type="file" accept="application/json,.json" @change="importConfig" />
          </label>
        </div>
      </div>
    </SCard>
    <SCard title="B 站与 MV" variant="settings">
      <div class="flex flex-col gap-3">
        <label class="flex justify-between">
          启用内置 B 站浏览器
          <SSwitch v-model="draft.bilibili.enabled" />
        </label>
        <label class="flex justify-between">
          BiliKit-Web Core
          <SSwitch v-model="draft.bilibili.coreEnabled" />
        </label>
        <label class="flex justify-between">
          免登录播放增强
          <SSwitch v-model="draft.bilibili.noLogin" />
        </label>
        <p>官方试看接口按实际可用画质提供增强，不保证所有视频或会员画质</p>
        <label>
          MV 音频策略
          <select v-model="draft.bilibili.audioPolicy">
            <option value="pause-music">播放 MV 暂停音乐，结束后按条件恢复</option>
            <option value="parallel">允许同时播放</option>
            <option value="muted">MV 默认静音</option>
          </select>
        </label>
        <label class="flex justify-between">
          上课时同时暂停 B 站视频
          <SSwitch v-model="draft.bilibili.pauseOnClass" />
        </label>
        <div class="flex flex-wrap gap-2">
          <SButton @click="browserCommand('disable-core')">临时禁用 Core</SButton>
          <SButton @click="browserCommand('restore-core')">恢复 Core</SButton>
          <SButton @click="browserCommand('reload')">重新加载网页</SButton>
          <SButton @click="browserCommand('status')">版本与加载状态</SButton>
        </div>
      </div>
    </SCard>
    <SCard title="隐私与浏览数据" variant="settings">
      <div class="flex flex-col gap-3">
        <label class="flex justify-between">
          重启后保留 B 站登录状态
          <SSwitch v-model="draft.bilibili.retainLogin" />
        </label>
        <p>仅使用独立分区 persist:splayer-bilibili，不读取系统浏览器登录数据</p>
        <div class="flex flex-wrap gap-2">
          <SButton @click="clearOpen = true">清除全部 B 站浏览数据</SButton>
          <SButton @click="browserCommand('recreate')">重新初始化浏览器</SButton>
          <SButton @click="browserCommand('status')">查看会话状态</SButton>
        </div>
        <p class="break-all text-xs">{{ browserInfo }}</p>
      </div>
    </SCard>
    <p v-if="validation || error" role="alert" class="text-error">{{ validation || error }}</p>
    <SButton :disabled="busy || !!validation" @click="save">保存并立即应用</SButton>
    <SDialog
      v-model:open="clearOpen"
      title="清除全部 B 站浏览数据"
      description="将退出 B 站登录并清除其 Cookie、缓存与网站存储，音乐库、音乐队列和校园时间表保留"
    >
      <SButton @click="clearBrowser">确认清除</SButton>
    </SDialog>
  </div>
</template>
