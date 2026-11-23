import { initSchool } from "@main/services/school";
import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import {
  createMainWindow,
  createDesktopLyricWindow,
  createDynamicIslandWindow,
  createTaskbarLyricWindow,
  getMainWindow,
  focusMainWindow,
  getDesktopLyricWindow,
  getDynamicIslandWindow,
  getTaskbarLyricWindow,
} from "@main/window";
import { store } from "@main/store";
import { isMac, isWin } from "@main/utils/config";
import { registerIpcHandlers } from "@main/ipc";
import { init as initMedia } from "@main/services/media";
import { runStartupTasks } from "./startupTasks";
import { init as initLastfm, loadSession as loadLastfmSession } from "@main/services/lastfm";
import { initGlobalHotkey } from "@main/services/globalHotkey";
import { initDatabase } from "@main/database";
import {
  init as initSongCache,
  cleanupStartupFiles as cleanupSongCache,
} from "@main/services/songCache";
import {
  init as initDownload,
  cleanupStartupFiles as cleanupDownloads,
} from "@main/services/downloadManager";
import { pluginRegistry } from "@main/plugins/registry";
import { init as initPlaybackBridge } from "@main/plugins/playbackBridge";
import {
  registerCacheScheme,
  handleCacheProtocol,
  handleCacheProtocolOnPartition,
  MAIN_PARTITION,
} from "@main/utils/protocol";
import { startServer } from "@main/server";
import { startMcpServer } from "@main/services/mcp/http";
import { coreLog, initLogger } from "@main/utils/logger";
import { initNetworkProxy } from "@main/utils/proxy";
import { isAppQuitting } from "@main/utils/lifecycle";
import { initAppLifecycle } from "./lifecycle";
import {
  initOrpheusRegistration,
  extractOrpheusUrl,
  captureOrpheusUrl,
} from "@main/services/orpheus";
import { extractAudioFiles, captureAudioFiles } from "@main/services/externalFile";

/**
 * 配置 Chromium 启动参数以优化内存占用
 */
const configureMemoryOptimizations = (): void => {
  // 禁止预热备用渲染进程
  app.commandLine.appendSwitch("disable-features", "SpareRendererForSitePerProcess");
};

/** 内存指标采样间隔 */
const MEMORY_LOG_INTERVAL_MS = 10 * 60 * 1000;
/** 启动后首次采样延迟，避开启动期波动 */
const MEMORY_LOG_FIRST_DELAY_MS = 60 * 1000;

/** 记录各进程内存工作集，用于量化内存表现与防劣化对比 */
const logProcessMemory = (): void => {
  // pid → 窗口名，让 Tab 进程能区分主窗口与各歌词窗口
  const windowPids = new Map<number, string>();
  const namedWindows: Array<[string, Electron.BrowserWindow | null]> = [
    ["main", getMainWindow()],
    ["desktop-lyric", getDesktopLyricWindow()],
    ["dynamic-island", getDynamicIslandWindow()],
    ["taskbar-lyric", getTaskbarLyricWindow()],
  ];
  for (const [name, win] of namedWindows) {
    if (win && !win.isDestroyed()) windowPids.set(win.webContents.getOSProcessId(), name);
  }
  const parts = app.getAppMetrics().map((metric) => {
    const mb = Math.round(metric.memory.workingSetSize / 1024);
    const detail = windowPids.get(metric.pid) ?? metric.name ?? metric.serviceName;
    const label = detail ? `${metric.type}(${detail})` : metric.type;
    return `${label} ${mb}MB`;
  });
  coreLog.info(`内存占用: ${parts.join(" | ")}`);
};

/**
 * 初始化应用
 */
export const initApp = (): void => {
  configureMemoryOptimizations();
  // 初始化日志
  initLogger();
  // 单例锁
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", (_event, commandLine) => {
    focusMainWindow();
    const url = extractOrpheusUrl(commandLine);
    if (url) captureOrpheusUrl(url);
    const files = extractAudioFiles(commandLine);
    if (files.length > 0) captureAudioFiles(files);
  });
  // macOS 通过 open-url 接收协议唤起
  app.on("open-url", (event, url) => {
    event.preventDefault();
    captureOrpheusUrl(url);
  });
  // macOS 通过 open-file 接收外部文件打开
  app.on("open-file", (event, path) => {
    event.preventDefault();
    captureAudioFiles([path]);
  });
  // 应用代理设置
  initNetworkProxy();
  // 注册缓存协议方案
  registerCacheScheme();
  // 其他初始化
  app.whenReady().then(() => {
    const coreStartedAt = performance.now();
    electronApp.setAppUserModelId("app.carbonv.player");
    // 注册 cache:// 协议处理
    handleCacheProtocol();
    handleCacheProtocolOnPartition(MAIN_PARTITION);
    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });
    // 注册 IPC
    let startupComplete = false;
    registerIpcHandlers(() => {
      if (startupComplete) return;
      startupComplete = true;
      void runStartupTasks(
        [
          { name: "全局快捷键", run: initGlobalHotkey },
          { name: "Last.fm 凭证", run: loadLastfmSession },
          { name: "外部 API", run: startServer },
          { name: "MCP", run: startMcpServer },
          { name: "歌曲缓存维护", run: cleanupSongCache },
          { name: "下载临时文件维护", run: cleanupDownloads },
        ],
        isAppQuitting,
        (name, error) => coreLog.warn(`后台启动任务失败：${name}`, error),
        (name, durationMs) => coreLog.info("后台启动阶段", { name, durationMs }),
      );
    });
    // 初始化数据库
    initDatabase();
    initSchool();
    // 创建主窗口
    const mainWindow = createMainWindow();
    // 播放配置同步前准备系统媒体控件，对外服务等待启动层退出。
    mainWindow.once("show", () => {
      initMedia();
      // 歌词外窗只在主窗口可见后恢复，每项之间让出事件循环
      void runStartupTasks(
        [
          {
            name: "桌面歌词",
            run: () => {
              if (store.get("windowStates.desktopLyric.visible")) createDesktopLyricWindow();
            },
          },
          {
            name: "灵动岛歌词",
            run: () => {
              if (store.get("windowStates.dynamicIsland.visible")) createDynamicIslandWindow();
            },
          },
          {
            name: "任务栏歌词",
            run: () => {
              if (isWin && store.get("windowStates.taskbarLyric.visible"))
                createTaskbarLyricWindow();
            },
          },
        ],
        isAppQuitting,
        (name, error) => coreLog.warn(`歌词启动任务失败：${name}`, error),
        (name, durationMs) => coreLog.info("歌词启动阶段", { name, durationMs }),
      );
    });
    // 注册 orpheus 协议并处理冷启动唤起
    initOrpheusRegistration();
    const coldOrpheusUrl = extractOrpheusUrl(process.argv);
    if (coldOrpheusUrl) captureOrpheusUrl(coldOrpheusUrl);
    const coldAudioFiles = extractAudioFiles(process.argv);
    if (coldAudioFiles.length > 0) captureAudioFiles(coldAudioFiles);
    // 仅接线与修正旧任务状态，目录扫描和凭证解密等待首屏退出
    initSongCache();
    initDownload();
    initLastfm();
    // 初始化插件系统
    pluginRegistry.init();
    // 初始化播放事件桥
    initPlaybackBridge();
    // 周期记录各进程内存
    setTimeout(logProcessMemory, MEMORY_LOG_FIRST_DELAY_MS);
    setInterval(logProcessMemory, MEMORY_LOG_INTERVAL_MS);
    app.on("activate", () => {
      if (isAppQuitting()) return;
      if (isMac) {
        if (getMainWindow()) focusMainWindow();
        else createMainWindow();
        return;
      }
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
    coreLog.info("核心服务初始化完成", {
      durationMs: Math.round(performance.now() - coreStartedAt),
    });
  });
  initAppLifecycle();
};
