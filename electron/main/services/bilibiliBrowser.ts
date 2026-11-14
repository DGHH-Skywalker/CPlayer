import { app, session, WebContentsView, clipboard } from "electron";
import { getMainWindow } from "@main/window";
import { sendToMain } from "@main/utils/broadcast";
import { coreLog } from "@main/utils/logger";
import { store } from "@main/store";
import { getPlayer } from "./engine";
import { getPlaybackActivity } from "./playbackActivity";
import { getSchoolScheduler, schoolEvents } from "./school";
import { schoolAllowsPlayback } from "./schoolPlaybackGate";
import { isBilibiliUrl, bilibiliBounds } from "./bilibiliPolicy";
import { BilikitLoader } from "./bilikitLoader";
import { MvAudioCoordinator } from "./mvAudioCoordinator";
import type { BilibiliState } from "@shared/types/bilibili";
import type { BilibiliSongEvent } from "@shared/types/bilibili";
import type { Track } from "@shared/types/player";
import { createBilibiliSong } from "@shared/bilibiliSong";
import { biliSongTransport } from "./bilibiliSongTransport";
import { stopPlaybackCompletely } from "@main/ipc/player";
import * as nowPlaying from "./nowPlaying";
import * as mediaService from "./media";

export const BILIBILI_PARTITION = "persist:splayer-bilibili";
let view: WebContentsView | null = null;
let loader: BilikitLoader | null = null;
let temporaryDisabled = false;
let visible = false;
let locked = false;
let creating: Promise<void> | null = null;
let lastConfig = "";
let bounds = { x: 0, y: 0, width: 0, height: 0 };
let theater = false;
let htmlFullscreen = false;
let removeWindowListeners: (() => void) | null = null;
let visibilityGeneration = 0;
let error: string | null = null;
let mediaPlaying = false;
let songGeneration = -1;
let songRequest: string | null = null;
let songWantsPlay = false;

const coordinator = new MvAudioCoordinator({
  isPlaying: () => getPlayer().getStatus().state === "playing",
  isPaused: () => getPlayer().getStatus().state === "paused",
  pause: () => getPlayer().pause(),
  resume: () => getPlayer().play(),
  version: getPlaybackActivity,
  generation: () => getSchoolScheduler().get().generation,
  allowed: schoolAllowsPlayback,
  mute: (muted) => view?.webContents.setAudioMuted(muted),
});

/** 读取专用浏览器状态，绝不包含 Cookie 或账号凭据 */
export const getBilibiliState = (): BilibiliState => ({
  url: view?.webContents.getURL() ?? "https://www.bilibili.com/",
  title: view?.webContents.getTitle() ?? "哔哩哔哩",
  loading: view?.webContents.isLoading() ?? false,
  error,
  canGoBack: view?.webContents.navigationHistory.canGoBack() ?? false,
  canGoForward: view?.webContents.navigationHistory.canGoForward() ?? false,
  visible,
  mediaPlaying,
  temporaryDisabled,
  coreLoaded: loader?.loaded ?? false,
  coreVersion: loader?.version ?? "0.5.35",
  partition: BILIBILI_PARTITION,
});

/** 将非敏感浏览器状态发给主窗口 */
const publish = (): void => sendToMain("bilibili:state", getBilibiliState());

/**
 * 接收当前队列项的有限媒体状态，拒绝旧文档、重复结束和上课后的回调
 * @param input - 非特权页面报告
 */
const reportSong = (input: unknown): void => {
  const active = biliSongTransport.current;
  if (!active || !input || typeof input !== "object") return;
  const event = input as BilibiliSongEvent;
  if (
    event.token !== active.token ||
    active.state === "ended" ||
    active.state === "stopped" ||
    !["playing", "paused", "ended", "error"].includes(event.state) ||
    !Number.isFinite(event.position) ||
    !Number.isFinite(event.duration)
  )
    return;
  if (!schoolAllowsPlayback() || songGeneration !== getSchoolScheduler().get().generation) {
    void controlBilibiliSong("stop", active.token);
    return;
  }
  const next = {
    ...active,
    state: event.state,
    position: Math.max(0, event.position),
    duration: Math.max(0, event.duration),
  };
  biliSongTransport.current = next;
  if (event.state === "ended" || event.state === "error") {
    view?.webContents.setAudioMuted(true);
  }
  sendToMain("bilibili:song", next);
  nowPlaying.onPlayStateChange(event.state === "playing" ? "playing" : "paused");
  nowPlaying.onPosition(next.position, event.state === "playing");
  mediaService.setPlayState({ status: event.state === "playing" ? "Playing" : "Paused" });
  mediaService.setTimeline({ currentMs: next.position, totalMs: next.duration });
};

/** 读取当前页面作为特殊曲目，只接受规范视频页 */
export const currentBilibiliSong = (): Track => {
  if (!store.get("school.bilibili.biliSongEnabled")) throw new Error("请先启用实验性哔哩Song");
  if (!view) throw new Error("请先打开 B 站视频页");
  return createBilibiliSong(view.webContents.getURL(), view.webContents.getTitle());
};

/**
 * 以独立操作标识播放一个网页队列项
 * @param track - 轻量网页曲目
 * @param token - 前端播放代次
 * @param autoPlay - 是否自动开始
 */
export const playBilibiliSong = async (
  track: Track,
  token: string,
  autoPlay: boolean,
): Promise<void> => {
  if (
    locked ||
    !store.get("school.bilibili.enabled") ||
    !store.get("school.bilibili.biliSongEnabled") ||
    !schoolAllowsPlayback()
  )
    throw new Error("当前不允许播放哔哩Song");
  const song = createBilibiliSong(track.bilibili?.url ?? "", track.title);
  if (
    track.source !== "bilibili" ||
    track.id !== song.id ||
    typeof token !== "string" ||
    token.length > 100
  )
    throw new Error("哔哩Song 参数无效");
  songRequest = token;
  songWantsPlay = autoPlay;
  await create();
  if (songRequest !== token || !schoolAllowsPlayback()) return;
  stopPlaybackCompletely();
  coordinator.invalidate();
  songGeneration = getSchoolScheduler().get().generation;
  biliSongTransport.current = {
    token,
    trackId: song.id,
    state: "loading",
    position: 0,
    duration: 0,
  };
  mediaService.setMetadata({ title: song.title, artists: ["哔哩Song"], album: "", durationMs: 0 });
  const config = store.get("school.bilibili");
  await loader!.install(config.coreEnabled && !temporaryDisabled, config.noLogin, {
    token,
    url: song.bilibili!.url,
    autoPlay,
  });
  if (biliSongTransport.current?.token !== token || !schoolAllowsPlayback()) return;
  view!.webContents.setAudioMuted(false);
  await view!.webContents.loadURL(song.bilibili!.url);
  if (songWantsPlay && biliSongTransport.current?.token === token)
    await controlBilibiliSong("play", token);
};

/**
 * 控制当前网页队列项，停止先同步静音再暂停页面
 * @param command - 播放、暂停、停止或定位
 * @param token - 必须匹配当前操作
 * @param position - 毫秒进度
 */
export const controlBilibiliSong = async (
  command: "play" | "pause" | "stop" | "seek",
  token: string,
  position?: number,
): Promise<void> => {
  const active = biliSongTransport.current;
  if (command === "stop" && songRequest === token) songRequest = null;
  if (!active || active.token !== token) return;
  if (!["play", "pause", "stop", "seek"].includes(command)) throw new Error("无效网页播放操作");
  if (command === "play" || command === "pause" || command === "stop")
    songWantsPlay = command === "play";
  if (
    command !== "stop" &&
    (!schoolAllowsPlayback() || songGeneration !== getSchoolScheduler().get().generation)
  )
    throw new Error("校园播放已锁定");
  if (command === "seek" && (!Number.isFinite(position) || position! < 0))
    throw new Error("进度无效");
  if (command === "stop") {
    view?.webContents.setAudioMuted(true);
    biliSongTransport.current = null;
    sendToMain("bilibili:song", { ...active, state: "stopped" });
  }
  await view?.webContents
    .executeJavaScript(
      `window.__carbonvSongControl?.(${JSON.stringify(command)}, ${JSON.stringify(position ?? 0)}, ${JSON.stringify(token)})`,
      true,
    )
    .catch(() => {});
};

biliSongTransport.control = async (command, position) => {
  if (biliSongTransport.current)
    await controlBilibiliSong(command, biliSongTransport.current.token, position);
};

/** 暂停当前文档所有媒体，只在隐藏、上课和销毁时执行 */
const pauseMedia = async (): Promise<void> => {
  if (!view || view.webContents.isDestroyed()) return;
  const frames = view.webContents.mainFrame.framesInSubtree;
  await Promise.allSettled(
    frames.map((frame) =>
      frame.executeJavaScript(
        `document.querySelectorAll('video,audio').forEach(v => v.pause()); if (document.fullscreenElement) document.exitFullscreen().catch(() => {});`,
      ),
    ),
  );
};

/** 更新剧场样式，使用原生网页播放器和弹幕 */
const applyTheater = async (): Promise<void> => {
  if (!view) return;
  await view.webContents
    .executeJavaScript(
      `(() => {
    let s = document.getElementById('carbonv-theater');
    if (!${theater}) { s?.remove(); return; }
    if (!s) { s = document.createElement('style'); s.id = 'carbonv-theater'; document.head.appendChild(s); }
    s.textContent = '.bili-header,.bili-header__bar,.right-container,.ad-report {display:none!important} .left-container {width:100%!important} .video-container-v1 {max-width:none!important;width:100%!important} #bilibili-player,.bpx-player-container {width:100%!important;min-height:70vh}';
  })();`,
    )
    .catch(() => {});
};

/**
 * 创建单个专用会话视图，新窗口请求复用当前视图并共享历史
 * @returns 首次导航任务
 */
const create = async (): Promise<void> => {
  if (view) return;
  if (creating) return creating;
  creating = (async () => {
    const main = getMainWindow();
    if (!main) throw new Error("主窗口尚未就绪");
    const dedicated = session.fromPartition(BILIBILI_PARTITION);
    dedicated.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(permission === "fullscreen"),
    );
    dedicated.setPermissionCheckHandler((_wc, permission) => permission === "fullscreen");
    view = new WebContentsView({
      webPreferences: {
        session: dedicated,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    const wc = view.webContents;
    // 使用标准桌面浏览器标识，保留 Chromium 版本以兼容站点播放器
    wc.setUserAgent(
      wc
        .getUserAgent()
        .replace(/\s(?:Electron|Cplayer|carbonv_player|CarbonVPlayer)\/[^\s]+/gi, ""),
    );
    main.contentView.addChildView(view);
    const onHidden = (): void => {
      void pauseMedia();
    };
    const onClosed = (): void => destroy();
    main.on("hide", onHidden);
    main.on("minimize", onHidden);
    main.once("closed", onClosed);
    removeWindowListeners = () => {
      main.removeListener("hide", onHidden);
      main.removeListener("minimize", onHidden);
      main.removeListener("closed", onClosed);
    };
    view.setVisible(false);
    wc.setWindowOpenHandler(({ url }) => {
      if (biliSongTransport.current) return { action: "deny" };
      if (isBilibiliUrl(url))
        void wc.loadURL(url).catch((e) => {
          error = String(e);
          publish();
        });
      else {
        error = "已阻止非 B 站链接";
        publish();
      }
      return { action: "deny" };
    });
    wc.on("will-navigate", (event, url) => {
      if (biliSongTransport.current) {
        event.preventDefault();
        error = "哔哩Song 播放中，请通过应用队列切歌";
        publish();
        return;
      }
      if (!isBilibiliUrl(url)) {
        event.preventDefault();
        error = "已阻止非 B 站导航";
        publish();
      }
    });
    wc.on("will-redirect", (event, url, _inPlace, isMainFrame) => {
      if (isMainFrame && !isBilibiliUrl(url)) {
        event.preventDefault();
        error = "已阻止外部重定向";
        publish();
      }
    });
    wc.on("will-attach-webview", (event) => event.preventDefault());
    wc.on("did-start-loading", publish);
    wc.on("did-stop-loading", () => {
      void applyTheater();
      publish();
    });
    wc.on("did-navigate-in-page", () => {
      void applyTheater();
      publish();
    });
    wc.on("page-title-updated", publish);
    wc.on("did-fail-load", (_event, code, message, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        error = message;
        coreLog.warn("B 站加载失败", code, message);
        publish();
      }
    });
    wc.on("render-process-gone", (_event, details) => {
      error = `网页进程退出: ${details.reason}，可重新初始化`;
      if (biliSongTransport.current) reportSong({ ...biliSongTransport.current, state: "error" });
      coordinator.invalidate();
      mediaPlaying = false;
      publish();
    });
    wc.on("enter-html-full-screen", () => {
      htmlFullscreen = true;
      if (!view) return;
      const [width, height] = main.getContentSize();
      view.setBounds({ x: 0, y: 0, width, height });
    });
    wc.on("leave-html-full-screen", () => {
      htmlFullscreen = false;
      view?.setBounds(bounds);
    });
    wc.on("media-started-playing", () => {
      void reportMedia(true);
    });
    wc.on("media-paused", () => {
      void reportMedia(loader?.isMediaPlaying() ?? false);
    });
    // 先建立空白文档的调试目标，远程文档必须等脚本注册完成后才加载
    await wc.loadURL("about:blank");
    loader = new BilikitLoader(
      wc,
      (playing) => {
        void reportMedia(playing);
      },
      reportSong,
    );
    const config = store.get("school.bilibili");
    if (!config.retainLogin) await dedicated.clearData();
    await loader.install(config.coreEnabled && !temporaryDisabled, config.noLogin);
    void wc.loadURL("https://www.bilibili.com/").catch((e) => {
      error = String(e);
    });
    publish();
  })().finally(() => {
    creating = null;
  });
  return creating;
};

/**
 * 聚合网页媒体状态，校园锁定优先于 MV 恢复
 * @param playing - 页面是否正在播放
 */
const reportMedia = async (playing: boolean): Promise<void> => {
  mediaPlaying = playing;
  if (biliSongTransport.current) {
    if (playing && (!visible || !getMainWindow()?.isVisible() || getMainWindow()?.isMinimized()))
      await controlBilibiliSong("pause", biliSongTransport.current.token);
    publish();
    return;
  }
  if (
    playing &&
    (!visible ||
      !getMainWindow()?.isVisible() ||
      getMainWindow()?.isMinimized() ||
      (store.get("school.bilibili.pauseOnClass") && !schoolAllowsPlayback()))
  ) {
    coordinator.invalidate();
    await pauseMedia();
    mediaPlaying = false;
  } else {
    await coordinator
      .update(playing, store.get("school.bilibili.audioPolicy"))
      .catch((e) => coreLog.warn("MV 协调失败", e));
  }
  publish();
};

/** 上课时作废所有 MV 自动恢复任务，按配置暂停网页 */
export const onSchoolCutoff = (): void => {
  songRequest = null;
  coordinator.invalidate();
  if (biliSongTransport.current) void controlBilibiliSong("stop", biliSongTransport.current.token);
  if (store.get("school.bilibili.pauseOnClass")) void pauseMedia();
};

/** 销毁视图与其注入资源，保留独立会话数据 */
const destroy = (): void => {
  if (biliSongTransport.current) void controlBilibiliSong("stop", biliSongTransport.current.token);
  visibilityGeneration++;
  htmlFullscreen = false;
  removeWindowListeners?.();
  removeWindowListeners = null;
  coordinator.invalidate();
  loader?.dispose();
  loader = null;
  if (view) {
    getMainWindow()?.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    view = null;
  }
  visible = false;
  mediaPlaying = false;
};

/** 核心配置变更后重新注册 document-start 脚本并重载 */
export const syncBilibiliConfig = async (): Promise<void> => {
  if (locked) return;
  const config = store.get("school.bilibili");
  const key = JSON.stringify(config);
  if (key === lastConfig) return;
  lastConfig = key;
  if (!config.enabled) {
    destroy();
    publish();
    return;
  }
  if (!view || !loader) return;
  if (biliSongTransport.current) await controlBilibiliSong("stop", biliSongTransport.current.token);
  coordinator.invalidate();
  view.webContents.setAudioMuted(config.audioPolicy === "muted");
  await loader.install(config.coreEnabled && !temporaryDisabled, config.noLogin);
  view.webContents.reload();
};

/**
 * 验证管理命令和边界，所有导航均留在专用视图
 * @param command - 允许的浏览器管理命令
 * @param value - URL、可见性、剧场开关或 CSS 像素边界
 * @returns 非敏感浏览器状态
 */
export const bilibiliCommand = async (command: string, value?: unknown): Promise<BilibiliState> => {
  if (locked) throw new Error("正在清理浏览器数据");
  if (command === "status") return getBilibiliState();
  if (command === "clear") {
    locked = true;
    try {
      await creating?.catch(() => {});
      await pauseMedia();
      destroy();
      const dedicated = session.fromPartition(BILIBILI_PARTITION);
      await dedicated.clearData();
      await dedicated.clearCache();
      await dedicated.clearStorageData();
      if ((await dedicated.cookies.get({})).some((c) => c.name === "SESSDATA"))
        throw new Error("B 站登录数据清理验证失败");
      error = null;
      if (store.get("school.bilibili.enabled")) await create();
      coreLog.info("独立 B 站会话数据清理完成");
    } finally {
      locked = false;
      publish();
    }
    return getBilibiliState();
  }
  if (command === "recreate") {
    locked = true;
    try {
      await creating?.catch(() => {});
      await pauseMedia();
      destroy();
      error = null;
      if (store.get("school.bilibili.enabled")) await create();
    } finally {
      locked = false;
      publish();
    }
    return getBilibiliState();
  }
  if (command === "hide") {
    visibilityGeneration++;
    visible = false;
    view?.setVisible(false);
    await pauseMedia();
    if (biliSongTransport.current)
      await controlBilibiliSong("pause", biliSongTransport.current.token);
    publish();
    return getBilibiliState();
  }
  if (!store.get("school.bilibili.enabled")) throw new Error("B 站浏览器已停用");
  if (command === "disable-core") temporaryDisabled = true;
  if (command === "restore-core") temporaryDisabled = false;
  const visibilityToken = visibilityGeneration;
  await create();
  const wc = view!.webContents;
  if (
    biliSongTransport.current &&
    ["navigate", "back", "forward", "reload", "disable-core", "restore-core"].includes(command)
  )
    await controlBilibiliSong("stop", biliSongTransport.current.token);
  switch (command) {
    case "show":
      if (visibilityToken !== visibilityGeneration) break;
      visible = true;
      view!.setVisible(true);
      break;
    case "bounds": {
      const b = value as typeof bounds;
      if (
        !b ||
        ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
        b.width < 0 ||
        b.height < 0
      )
        throw new Error("浏览器尺寸无效");
      const main = getMainWindow()!;
      const zoom = main.webContents.getZoomFactor();
      const [width, height] = main.getContentSize();
      bounds = bilibiliBounds(b, zoom, [width, height]);
      view!.setBounds(htmlFullscreen ? { x: 0, y: 0, width, height } : bounds);
      break;
    }
    case "navigate":
      if (typeof value !== "string" || !isBilibiliUrl(value))
        throw new Error("仅允许 HTTPS B 站域名");
      error = null;
      await wc.loadURL(value);
      break;
    case "back":
      if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      break;
    case "forward":
      if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
      break;
    case "reload":
      error = null;
      wc.reload();
      break;
    case "copy":
      clipboard.writeText(wc.getURL());
      break;
    case "theater":
      theater = value === true;
      await applyTheater();
      break;
    case "fullscreen":
      await wc.executeJavaScript(`document.querySelector('video')?.requestFullscreen()`, true);
      break;
    case "disable-core":
    case "restore-core":
      await loader!.install(
        store.get("school.bilibili.coreEnabled") && !temporaryDisabled,
        store.get("school.bilibili.noLogin"),
      );
      wc.reload();
      break;
    case "recreate":
      break;
    default:
      throw new Error("未知浏览器命令");
  }
  publish();
  return getBilibiliState();
};

schoolEvents.on("cutoff", onSchoolCutoff);
schoolEvents.on("configured", () => {
  void syncBilibiliConfig().catch((e) => coreLog.warn("浏览器配置同步失败", e));
});

app.once("before-quit", () => {
  destroy();
  if (!store.get("school.bilibili.retainLogin"))
    void session.fromPartition(BILIBILI_PARTITION).clearData();
});
