import "virtual:uno.css";
import "@/styles/global.css";

import piniaPersistedstate from "pinia-plugin-persistedstate";
import App from "./App.vue";
import router from "./router";
import i18n from "./i18n";

import { useThemeStore } from "./stores/theme";
import { useSettingsStore } from "./stores/settings";
import { initPlayer, playFiles, restoreLastTrack } from "./core/player";
import { handleOrpheus } from "./services/orpheus";
import { vRipple } from "./directives/ripple";

const pinia = createPinia();
pinia.use(piniaPersistedstate);

const app = createApp(App);
app.directive("ripple", vRipple);
app.use(pinia);
app.use(router);
app.use(i18n);

// 初始化主题
useThemeStore().init();

// 同步语言设置
watch(
  () => useSettingsStore().locale,
  (v) => {
    i18n.global.locale.value = v;
    window.api.system.setLocale(v);
  },
  { immediate: true },
);

/**
 * 消费本地冷启动任务并派发播放，不等待音源、协议请求或歌词网络
 */
const bootstrapPlayback = async (): Promise<void> => {
  const [pendingAudioFiles, pendingOrpheusUrl] = await Promise.all([
    window.api.system.consumePendingAudioFiles(),
    window.api.system.consumePendingProtocolUrl(),
  ]);

  if (pendingAudioFiles && pendingAudioFiles.length > 0) {
    void playFiles(pendingAudioFiles).catch(console.error);
  } else if (pendingOrpheusUrl) {
    void handleOrpheus(pendingOrpheusUrl).catch(console.error);
  } else {
    void restoreLastTrack().catch(console.error);
  }
};

/** 挂载首屏并准备播放操作 */
export const mountApplication = async (): Promise<void> => {
  // 路由下载与播放核心并行，首页挂载后的推荐、歌单不抢占播放准备
  await Promise.all([router.isReady(), initPlayer()]);
  // 只等待本地任务取出并派发，主页挂载后才会启动推荐和歌单请求
  await startPlayback();
  app.mount("#app");
  await nextTick();
  performance.mark("carbonv:app-mounted");
};

let playbackDispatch: Promise<void> | undefined;
/**
 * 核心就绪后优先派发恢复任务，同一启动只派发一次
 * @returns 本地任务已消费并派发，不代表音频或网络加载完成
 */
export const startPlayback = (): Promise<void> => {
  playbackDispatch ??= bootstrapPlayback().catch(console.error);
  return playbackDispatch;
};

/** 启动层退出后再加载快捷键，不参与首个音频与歌词的关键路径 */
export const startApplication = (): void => {
  void startPlayback();
  void Promise.all([import("./stores/hotkey"), import("./core/hotkey/manager")])
    .then(async ([{ useHotkeyStore }, { installHotkeyManager }]) => {
      await useHotkeyStore().init();
      installHotkeyManager();
    })
    .catch((err) => console.error("[hotkey] init failed", err));
};
