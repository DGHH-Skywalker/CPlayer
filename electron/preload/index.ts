import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type { ConfigApi, PluginKeybindings, SystemConfig } from "@shared/types/settings";
import type { PluginManifest, PluginState } from "@shared/types/plugin";
import type { LibraryScanPreview } from "@shared/types/library";
import type { OrpheusCommandPayload } from "@shared/utils/orpheus";
import type { AppSettings } from "@shared/types/appSettings";
import { schoolApi } from "./school";

/** 通用事件订阅。 */
const subscribe = <T>(channel: string, callback: (data: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const config: ConfigApi = {
  get: (keyPath) => ipcRenderer.invoke("config:get", keyPath),
  set: (keyPath, value) => ipcRenderer.invoke("config:set", keyPath, value),
  getAll: () => ipcRenderer.invoke("config:getAll"),
  reset: () => ipcRenderer.invoke("config:reset"),
  replaceAll: (config) => ipcRenderer.invoke("config:replaceAll", config),
  export: (options) => ipcRenderer.invoke("config:export", options),
  exportToFile: (options) => ipcRenderer.invoke("config:exportToFile", options),
  import: (options) => ipcRenderer.invoke("config:import", options),
  importFromFile: (options) => ipcRenderer.invoke("config:importFromFile", options),
};

const api = {
  // 应用控制
  app: {
    quit: () => ipcRenderer.send("app:quit"),
    relaunch: () => ipcRenderer.send("app:relaunch"),
  },
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    fullscreen: () => ipcRenderer.send("window:fullscreen"),
    leaveFullscreen: () => ipcRenderer.send("window:leave-fullscreen"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    isFullscreen: () => ipcRenderer.invoke("window:is-fullscreen"),
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.removeAllListeners("window:maximized-change");
      return subscribe("window:maximized-change", callback);
    },
    onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
      ipcRenderer.removeAllListeners("window:fullscreen-change");
      return subscribe("window:fullscreen-change", callback);
    },
  },
  config,
  school: schoolApi,
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: Partial<AppSettings>) => ipcRenderer.invoke("settings:update", settings),
    onChange: (callback: (settings: AppSettings) => void) => {
      ipcRenderer.removeAllListeners("settings:change");
      return subscribe("settings:change", callback);
    },
  },
  // 系统配置事件
  onConfigChange: (callback: (data: { keyPath: string; value: unknown }) => void) => {
    ipcRenderer.removeAllListeners("config:change");
    return subscribe("config:change", callback);
  },
  // 插件
  plugin: {
    list: () => ipcRenderer.invoke("plugin:list"),
    getState: (id: string) => ipcRenderer.invoke("plugin:get-state", id),
    install: (url: string, autoEnable?: boolean) =>
      ipcRenderer.invoke("plugin:install", url, autoEnable),
    remove: (id: string) => ipcRenderer.invoke("plugin:remove", id),
    enable: (id: string) => ipcRenderer.invoke("plugin:enable", id),
    disable: (id: string) => ipcRenderer.invoke("plugin:disable", id),
    reload: (id: string) => ipcRenderer.invoke("plugin:reload", id),
    loadRenderer: (id: string) => ipcRenderer.invoke("plugin:load-renderer", id),
    loadStyle: (id: string) => ipcRenderer.invoke("plugin:load-style", id),
    getAllKeybindings: (): Promise<Record<string, PluginKeybindings>> =>
      ipcRenderer.invoke("plugin:get-all-keybindings"),
    checkUpdate: (id: string) => ipcRenderer.invoke("plugin:check-update", id),
    checkAllUpdates: () => ipcRenderer.invoke("plugin:checkAllUpdates"),
    update: (id: string) => ipcRenderer.invoke("plugin:update", id),
    getWebviewPreload: () => ipcRenderer.invoke("plugin:get-webview-preload"),
    ipcInvoke: (id: string, method: string, ...args: unknown[]) =>
      ipcRenderer.invoke("plugin:ipc-invoke", id, method, ...args),
    onChange: (callback: (plugins: PluginState[]) => void) => {
      ipcRenderer.removeAllListeners("plugin:change");
      return subscribe("plugin:change", callback);
    },
    onInstallSuccess: (callback: (manifest: PluginManifest) => void) => {
      ipcRenderer.removeAllListeners("plugin:install-success");
      return subscribe("plugin:install-success", callback);
    },
    onUpdatesAvailable: (
      callback: (updates: Array<{ id: string; currentVersion: string; latestVersion: string }>) => void,
    ) => {
      ipcRenderer.removeAllListeners("plugin:updates-available");
      return subscribe("plugin:updates-available", callback);
    },
    // 插件 IPC 桥接（插件间通信，通过 PluginIpcBridge 路由）
    ipcRegister: (pluginId: string, methods: string[]): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("plugin:ipc-register", pluginId, methods),
    ipcUnregister: (pluginId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("plugin:ipc-unregister", pluginId),
    ipcSendTo: (targetId: string, channel: string, data: unknown): void =>
      ipcRenderer.send("plugin:ipc-send-to", targetId, channel, data),
    onIpcFrom: (
      callback: (payload: { sourceId: string; channel: string; data: unknown }) => void,
    ): (() => void) => {
      ipcRenderer.removeAllListeners("plugin:ipc-from");
      return subscribe("plugin:ipc-from", callback);
    },
  },
  // 缓存
  cache: {
    get: (key: string) => ipcRenderer.invoke("cache:get", key),
    set: (key: string, value: unknown, ttl?: number) =>
      ipcRenderer.invoke("cache:set", key, value, ttl),
    delete: (key: string) => ipcRenderer.invoke("cache:delete", key),
    clear: () => ipcRenderer.invoke("cache:clear"),
    readSong: (id: number, quality?: string, type?: string) =>
      ipcRenderer.invoke("cache:read-song", id, quality, type),
    writeSong: (
      id: number,
      quality: string,
      type: string,
      data: ArrayBuffer,
      meta?: { duration?: number },
    ) => ipcRenderer.invoke("cache:write-song", id, quality, type, data, meta),
    hasSong: (id: number, quality?: string) =>
      ipcRenderer.invoke("cache:has-song", id, quality),
    deleteSong: (id: number) => ipcRenderer.invoke("cache:delete-song", id),
    readStreamSong: (fileId: string) => ipcRenderer.invoke("cache:read-stream-song", fileId),
    writeStreamSong: (fileId: string, data: ArrayBuffer) =>
      ipcRenderer.invoke("cache:write-stream-song", fileId, data),
    hasStreamSong: (fileId: string) => ipcRenderer.invoke("cache:has-stream-song", fileId),
    deleteStreamSong: (fileId: string) =>
      ipcRenderer.invoke("cache:delete-stream-song", fileId),
    writeImage: (data: ArrayBuffer, contentType: string) =>
      ipcRenderer.invoke("cache:write-image", data, contentType),
  },
  // 音频播放（原生 NAPI 引擎）
  player: {
    getAudioFingerprint: (path: string, maxDuration?: number) =>
      ipcRenderer.invoke("player:get-audio-fingerprint", path, maxDuration),
    analyzeAudioFingerprint: (samples: ArrayBuffer) =>
      ipcRenderer.invoke("player:analyze-audio-fingerprint", samples),
    getPlaybackState: () => ipcRenderer.invoke("player:get-playback-state"),
    load: (
      source:
        | string
        | {
            samples: ArrayBuffer;
            channels: number;
            sampleRate: number;
            trackId?: number;
            quality?: string;
            fileType?: string;
            duration?: number;
          },
      options?: { startSeconds?: number; trackId?: string; streamId?: string },
    ) => ipcRenderer.invoke("player:load", source, options),
    play: () => ipcRenderer.invoke("player:play"),
    pause: () => ipcRenderer.invoke("player:pause"),
    resume: () => ipcRenderer.invoke("player:resume"),
    stop: () => ipcRenderer.invoke("player:stop"),
    seek: (seconds: number) => ipcRenderer.invoke("player:seek", seconds),
    setVolume: (volume: number) => ipcRenderer.invoke("player:set-volume", volume),
    setSpeed: (speed: number) => ipcRenderer.invoke("player:set-speed", speed),
    setEq: (enabled: boolean, gains: number[]) =>
      ipcRenderer.invoke("player:set-eq", enabled, gains),
    getAudioDevices: () => ipcRenderer.invoke("player:get-audio-devices"),
    getCurrentAudioDevice: () => ipcRenderer.invoke("player:get-current-audio-device"),
    setAudioDevice: (deviceId: string | null) =>
      ipcRenderer.invoke("player:set-audio-device", deviceId),
    getLastPlaybackError: () => ipcRenderer.invoke("player:get-last-playback-error"),
    prepareNext: (options: {
      trackId?: string;
      durationMs?: number;
      source:
        | string
        | {
            samples: ArrayBuffer;
            channels: number;
            sampleRate: number;
            trackId?: number;
            quality?: string;
            fileType?: string;
            duration?: number;
          };
      startSeconds?: number;
      crossfadeDurationMs?: number;
      eqEnabled?: boolean;
      eqGains?: number[];
      transitionRange?: { startSec: number; endSec: number } | null;
      cueRange?: { startSec: number; endSec: number } | null;
    }) => ipcRenderer.invoke("player:prepareNext", options),
    cancelPrepareNext: () => ipcRenderer.invoke("player:cancel-prepare-next"),
    transitionPrepared: (durationMs: number) =>
      ipcRenderer.invoke("player:transitionPrepared", durationMs),
    cancelCrossfade: () => ipcRenderer.invoke("player:cancel-crossfade"),
    getTransitionState: () => ipcRenderer.invoke("player:get-transition-state"),
    setTransitionSettings: (config: {
      equalPower: boolean;
      autoAdvance: boolean;
      overlapEnabled?: boolean;
    }) => ipcRenderer.invoke("player:set-transition-settings", config),
    updateTransitionSettings: (config: { overlapEnabled?: boolean }) =>
      ipcRenderer.invoke("player:update-transition-settings", config),
    setTransitionRanges: (config: {
      currentStart?: number;
      currentEnd?: number;
      nextStart?: number;
      nextEnd?: number;
    }) => ipcRenderer.invoke("player:set-transition-ranges", config),
    getTransitionRanges: () => ipcRenderer.invoke("player:get-transition-ranges"),
    setCueRange: (range: { startSec: number; endSec: number } | null) =>
      ipcRenderer.invoke("player:set-cue-range", range),
    onEvent: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("player:event");
      return subscribe("player:event", callback);
    },
    onMemorySample: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("player:memory-sample");
      return subscribe("player:memory-sample", callback);
    },
  },
  // 流媒体播放
  streaming: {
    probeUrl: (url: string) => ipcRenderer.invoke("streaming:probe-url", url),
    start: (options: {
      trackId: number;
      url: string;
      startSeconds?: number;
      volume?: number;
      speed?: number;
      autoGain?: number;
      autoMixPeakOffset?: number;
      channels?: number;
      sampleRate?: number;
      quality?: string;
      fileType?: string;
      duration?: number;
    }) => ipcRenderer.invoke("streaming:start", options),
    stop: () => ipcRenderer.invoke("streaming:stop"),
    seek: (seconds: number) => ipcRenderer.invoke("streaming:seek", seconds),
    setVolume: (volume: number) => ipcRenderer.invoke("streaming:set-volume", volume),
    setSpeed: (speed: number) => ipcRenderer.invoke("streaming:set-speed", speed),
    setEq: (enabled: boolean, gains: number[]) =>
      ipcRenderer.invoke("streaming:set-eq", enabled, gains),
    onEvent: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("streaming:event");
      return subscribe("streaming:event", callback);
    },
    onMediaNotification: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("streaming:media-notification");
      return subscribe("streaming:media-notification", callback);
    },
  },
  // 协议调用
  onProtocolCommand: (callback: (command: OrpheusCommandPayload) => void) => {
    ipcRenderer.removeAllListeners("protocol:command");
    return subscribe("protocol:command", callback);
  },
  // 下载管理
  download: {
    start: (song: unknown) => ipcRenderer.invoke("download:start", song),
    cancel: (songId: number) => ipcRenderer.invoke("download:cancel", songId),
    retry: (songId: number) => ipcRenderer.invoke("download:retry", songId),
    delete: (songId: number) => ipcRenderer.invoke("download:delete", songId),
    getList: () => ipcRenderer.invoke("download:get-list"),
    clearCompleted: () => ipcRenderer.invoke("download:clear-completed"),
    setLimit: (limit: number) => ipcRenderer.invoke("download:set-limit", limit),
    openFolder: () => ipcRenderer.invoke("download:open-folder"),
    setPath: (path: string) => ipcRenderer.invoke("download:set-path", path),
    selectPath: () => ipcRenderer.invoke("download:select-path"),
    onProgress: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("download:progress");
      return subscribe("download:progress", callback);
    },
    onChange: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("download:change");
      return subscribe("download:change", callback);
    },
  },
  // 本地音乐库
  library: {
    selectFolders: () => ipcRenderer.invoke("library:select-folders"),
    previewScan: (folders: string[]): Promise<LibraryScanPreview> =>
      ipcRenderer.invoke("library:preview-scan", folders),
    getTree: () => ipcRenderer.invoke("library:get-tree"),
    getFiles: (directoryPath: string) => ipcRenderer.invoke("library:get-files", directoryPath),
    openFolder: (folderPath: string) => ipcRenderer.invoke("library:open-folder", folderPath),
    revealFile: (filePath: string) => ipcRenderer.invoke("library:reveal-file", filePath),
    importFiles: () => ipcRenderer.invoke("library:import-files"),
    readFile: (filePath: string) => ipcRenderer.invoke("library:read-file", filePath),
    analyzeFolder: (folderPath: string) => ipcRenderer.invoke("library:analyze-folder", folderPath),
    readImage: (filePath: string) => ipcRenderer.invoke("library:read-image", filePath),
    getMetadata: (filePath: string) => ipcRenderer.invoke("library:get-metadata", filePath),
    deleteFiles: (filePaths: string[]) => ipcRenderer.invoke("library:delete-files", filePaths),
    renameFile: (filePath: string, newName: string) =>
      ipcRenderer.invoke("library:rename-file", filePath, newName),
    editMetadata: (filePath: string, metadata: unknown, overwrite: boolean) =>
      ipcRenderer.invoke("library:edit-metadata", filePath, metadata, overwrite),
    batchEditMetadata: (
      filePaths: string[],
      metadata: unknown,
      options: { overwrite: boolean; skipSameName: boolean },
    ) => ipcRenderer.invoke("library:batch-edit-metadata", filePaths, metadata, options),
    readAudioData: (filePath: string) => ipcRenderer.invoke("library:read-audio-data", filePath),
  },
  // 歌词
  lyrics: {
    openTTMLDb: () => ipcRenderer.invoke("lyrics:open-ttml-db"),
    getTTMLStats: () => ipcRenderer.invoke("lyrics:get-ttml-stats"),
    getTTMLQuality: () => ipcRenderer.invoke("lyrics:get-ttml-quality"),
    setTTMLQuality: (score: number) => ipcRenderer.invoke("lyrics:set-ttml-quality", score),
    searchTTML: (track: { id?: number; name: string; artists: string; album?: string }) =>
      ipcRenderer.invoke("lyrics:search-ttml", track),
    onTTMLDbChange: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("lyrics:ttml-db-change");
      return subscribe("lyrics:ttml-db-change", callback);
    },
  },
  // 统计
  stats: {
    getOverview: () => ipcRenderer.invoke("stats:get-overview"),
    getRecent: (limit?: number) => ipcRenderer.invoke("stats:get-recent", limit),
    getTopSongs: (limit?: number) => ipcRenderer.invoke("stats:get-top-songs", limit),
    getTopArtists: (limit?: number) => ipcRenderer.invoke("stats:get-top-artists", limit),
    clear: () => ipcRenderer.invoke("stats:clear"),
    onChange: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("stats:change");
      return subscribe("stats:change", callback);
    },
  },
  // 任务栏歌词
  taskbar: {
    setMode: (mode: "single" | "double") => ipcRenderer.send("taskbar:set-mode", mode),
    update: (config: {
      song?: string;
      artists?: string;
      lyrics?: { yrc: unknown[]; lrc: unknown[]; ttml?: unknown[] };
      currentTime?: number;
      songId?: number;
      fontSize?: number;
      color?: string;
      playedColor?: string;
      align?: string;
      fontFamily?: string;
      bold?: boolean;
      offset?: number;
    }) => ipcRenderer.send("taskbar:update", config),
    unlock: () => ipcRenderer.send("taskbar:unlock"),
    lock: () => ipcRenderer.send("taskbar:lock"),
    toggleVisible: (visible?: boolean) => ipcRenderer.send("taskbar:toggle-visible", visible),
    onConfigChange: (callback: (config: { x?: number; y?: number }) => void) => {
      ipcRenderer.removeAllListeners("taskbar:config-change");
      return subscribe("taskbar:config-change", callback);
    },
  },
  // 系统对话框和外壳
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
    showItemInFolder: (path: string) => ipcRenderer.invoke("shell:show-item-in-folder", path),
    showMessage: (options: {
      type?: "none" | "info" | "error" | "question" | "warning";
      title?: string;
      message: string;
      detail?: string;
      buttons?: string[];
    }) => ipcRenderer.invoke("shell:show-message", options),
    showConfirm: (options: {
      title?: string;
      message: string;
      detail?: string;
      confirmText?: string;
      cancelText?: string;
    }) => ipcRenderer.invoke("shell:show-confirm", options),
    showOpenDialog: (options: {
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
      properties?: ("openFile" | "openDirectory" | "multiSelections")[];
    }) => ipcRenderer.invoke("shell:show-open-dialog", options),
    showSaveDialog: (options: {
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => ipcRenderer.invoke("shell:show-save-dialog", options),
    selectDirectory: (title?: string) => ipcRenderer.invoke("shell:select-directory", title),
    checkOnline: (url?: string) => ipcRenderer.invoke("shell:check-online", url),
  },
  // 更新
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    onStatus: (callback: (data: unknown) => void) => {
      ipcRenderer.removeAllListeners("updater:status");
      return subscribe("updater:status", callback);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error 非隔离模式回退
  window.electron = electronAPI;
  // @ts-expect-error 非隔离模式回退
  window.api = api;
}
