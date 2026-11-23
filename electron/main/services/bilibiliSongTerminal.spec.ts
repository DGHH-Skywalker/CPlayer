import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BilibiliSongEvent } from "@shared/types/bilibili";
import { createBilibiliSong } from "@shared/bilibiliSong";

const mocks = vi.hoisted(() => ({
  protected: true,
  dynamicsEnabled: true,
  protectionChanged: undefined as ((value: boolean) => void) | undefined,
  allowed: true,
  generation: 1,
  execute: vi.fn(),
  send: vi.fn(),
  mute: vi.fn(),
  report: undefined as ((event: unknown) => void) | undefined,
  contents: undefined as { emit(name: string, ...args: unknown[]): boolean } | undefined,
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Contents extends EventEmitter {
    url = "about:blank";
    navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    getURL = () => this.url;
    getTitle = () => "Fixture";
    getUserAgent = () => "Chromium";
    setUserAgent = vi.fn();
    setBackgroundThrottling = vi.fn();
    setWindowOpenHandler = vi.fn();
    isLoading = () => false;
    isDestroyed = () => false;
    executeJavaScript = mocks.execute;
    mainFrame = { framesInSubtree: [{ executeJavaScript: mocks.execute }] };
    setAudioMuted = mocks.mute;
    /** 只记录导航，不创建远程页面 */
    async loadURL(url: string): Promise<void> {
      this.url = url;
    }
  }
  return {
    app: { once: vi.fn() },
    clipboard: { writeText: vi.fn() },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        clearData: vi.fn(),
      }),
    },
    WebContentsView: class {
      webContents = new Contents();
      /** 让测试通过进程退出事件触发真实管理器的错误路径 */
      constructor() {
        mocks.contents = this.webContents;
      }
      setVisible = vi.fn();
      setBounds = vi.fn();
      getBounds = () => ({ x: 0, y: 0, width: 800, height: 500 });
    },
  };
});
vi.mock("@main/window", async () => {
  const { EventEmitter } = await import("node:events");
  const main = Object.assign(new EventEmitter(), {
    isVisible: () => false,
    isMinimized: () => false,
    getContentSize: () => [1000, 800],
    webContents: { getZoomFactor: () => 1 },
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  });
  return { getMainWindow: () => main };
});
vi.mock("@main/utils/broadcast", () => ({ sendToMain: mocks.send }));
vi.mock("@main/utils/logger", () => ({ coreLog: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("@main/store", async () => {
  const { defaultSchoolConfig } = await import("@shared/school/schedule");
  const config = structuredClone(defaultSchoolConfig);
  config.bilibili.enabled = true;
  config.bilibili.biliSongEnabled = true;
  return {
    store: {
      get: (path: string) =>
        path
          .split(".")
          .slice(1)
          .reduce((value, key) => value?.[key], config as any),
    },
  };
});
vi.mock("./engine", () => ({ getPlayer: vi.fn() }));
vi.mock("./audioEffects", async () => ({
  audioEffectEvents: new (await import("node:events")).EventEmitter(),
  effectiveDynamics: () => ({ enabled: mocks.dynamicsEnabled }),
}));
vi.mock("./school", async () => ({
  getSchoolScheduler: () => ({ get: () => ({ generation: mocks.generation }) }),
  schoolEvents: new (await import("node:events")).EventEmitter(),
}));
vi.mock("./schoolPlaybackGate", () => ({ schoolAllowsPlayback: () => mocks.allowed }));
vi.mock("./bilikitLoader", () => ({
  BilikitLoader: class {
    loaded = false;
    version = "fixture";
    /** 注入真实主进程门控所读的文档保护状态 */
    get audioProtected(): boolean {
      return mocks.protected;
    }
    /** 保存管理器的媒体与保护回调 */
    constructor(
      _contents: unknown,
      _media: unknown,
      report: (event: unknown) => void,
      protectionChanged: (value: boolean) => void,
    ) {
      mocks.report = report;
      mocks.protectionChanged = protectionChanged;
    }
    install = vi.fn(async () => {
      mocks.protectionChanged?.(mocks.protected);
    });
  },
}));
vi.mock("./mvAudioCoordinator", () => ({
  MvAudioCoordinator: class {
    invalidate = vi.fn();
  },
}));
vi.mock("./bilibiliSongButton", () => ({ BilibiliSongButton: class {} }));
vi.mock("@main/ipc/player", () => ({ stopPlaybackCompletely: vi.fn() }));
vi.mock("./nowPlaying", () => ({ onPlayStateChange: vi.fn(), onPosition: vi.fn() }));
vi.mock("./media", () => ({ setMetadata: vi.fn(), setPlayState: vi.fn(), setTimeline: vi.fn() }));

/** 只读取真正发给前端的曲目事件，不混入浏览器状态 */
const events = (): BilibiliSongEvent[] =>
  mocks.send.mock.calls
    .filter(([channel]) => channel === "bilibili:song")
    .map(([, value]) => value);
const track = createBilibiliSong("https://www.bilibili.com/video/BV1wHWe68Eh3/", "Fixture");
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.protected = true;
  mocks.dynamicsEnabled = true;
  mocks.allowed = true;
  mocks.generation = 1;
  mocks.execute.mockResolvedValue(undefined);
});

describe("网页曲目终态与定位竞争", () => {
  it.each(["ended", "error", "stopped"] as const)(
    "在途定位前的 %s 不能被旧定位标识丢弃",
    async (state) => {
      const browser = await import("./bilibiliBrowser");
      await browser.playBilibiliSong(track, "owner", false);
      const execution = Promise.withResolvers<void>();
      mocks.execute.mockReturnValueOnce(execution.promise);
      const seeking = browser.controlBilibiliSong("seek", "owner", 200, "new-seek");
      mocks.report!({ token: "owner", state, position: 1000, duration: 1000, seekId: "" });
      expect(events().at(-1)).toMatchObject({
        state,
        token: "owner",
        seekId: "new-seek",
        seekOrder: 1,
      });
      expect(mocks.mute).toHaveBeenLastCalledWith(true);
      const transport = (await import("./bilibiliSongTransport")).biliSongTransport;
      if (state === "stopped") expect(transport.current).toBe(null);
      else expect(transport.current?.state).toBe(state);
      const count = events().length;
      mocks.report!({
        token: "owner",
        state: "playing",
        position: 200,
        duration: 1000,
        seekId: "new-seek",
      });
      expect(events()).toHaveLength(count);
      execution.resolve();
      await seeking;
    },
  );
  it("定位尚未确认时网页进程崩溃仍报告错误", async () => {
    const browser = await import("./bilibiliBrowser");
    await browser.playBilibiliSong(track, "owner", false);
    const execution = Promise.withResolvers<void>();
    mocks.execute.mockReturnValueOnce(execution.promise);
    const seeking = browser.controlBilibiliSong("seek", "owner", 200, "new-seek");
    mocks.contents!.emit("render-process-gone", {}, { reason: "crashed" });
    expect(events().at(-1)).toMatchObject({ state: "error", seekId: "new-seek" });
    execution.resolve();
    await seeking;
  });
  it("旧曲目终态无效，上课后当前曲目只能停止而不能推进", async () => {
    const browser = await import("./bilibiliBrowser");
    await browser.playBilibiliSong(track, "owner", false);
    mocks.report!({ token: "old-owner", state: "ended", position: 1000, duration: 1000 });
    expect(events()).toHaveLength(0);
    mocks.allowed = false;
    mocks.report!({ token: "owner", state: "ended", position: 1000, duration: 1000 });
    expect(events()).toHaveLength(1);
    expect(events()[0].state).toBe("stopped");
  });
});

describe("CDP 失效时主进程保持音频保护", () => {
  it("未注册保护时新网页和自动播放始终静音并暂停", async () => {
    mocks.protected = false;
    const browser = await import("./bilibiliBrowser");
    await browser.playBilibiliSong(track, "owner", true);
    expect(mocks.mute.mock.calls[0]).toEqual([true]);
    expect(mocks.mute.mock.calls.every(([muted]) => muted === true)).toBe(true);
    mocks.contents!.emit("media-started-playing");
    await vi.waitFor(() =>
      expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("v.pause()")),
    );
    expect(mocks.mute).toHaveBeenLastCalledWith(true);
  });
  it("调试器失去连接立即静音，Core 关闭但保护已注册时仍允许音频", async () => {
    const browser = await import("./bilibiliBrowser");
    await browser.playBilibiliSong(track, "owner", false);
    expect(mocks.mute).toHaveBeenLastCalledWith(false);
    mocks.protected = false;
    mocks.protectionChanged!(false);
    expect(mocks.mute).toHaveBeenLastCalledWith(true);
    mocks.protected = true;
    mocks.protectionChanged!(true);
    expect(mocks.mute).toHaveBeenLastCalledWith(false);
  });
  it("片尾主动静音不能被迟到的保护注册成功回调解除", async () => {
    const browser = await import("./bilibiliBrowser");
    await browser.playBilibiliSong(track, "owner", false);
    mocks.report!({ token: "owner", state: "ended", position: 1000, duration: 1000 });
    expect(mocks.mute).toHaveBeenLastCalledWith(true);
    mocks.protectionChanged!(true);
    expect(mocks.mute).toHaveBeenLastCalledWith(true);
  });
  it("用户关闭NoiseLimiter后没有CDP保护仍可使用普通网页音频", async () => {
    mocks.protected = false;
    mocks.dynamicsEnabled = false;
    const browser = await import("./bilibiliBrowser");
    await browser.playBilibiliSong(track, "owner", false);
    expect(mocks.mute).toHaveBeenLastCalledWith(false);
  });
});
