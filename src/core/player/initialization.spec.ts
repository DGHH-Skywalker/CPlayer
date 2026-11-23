import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  streaming: vi.fn(),
  school: vi.fn(),
  restore: vi.fn(),
  plugins: vi.fn(),
  preload: vi.fn(),
  deviceVolume: vi.fn(() => 0.2),
  mode: false,
  settings: {
    syncSystem: vi.fn(),
    system: {
      player: {
        fadeEnabled: true,
        fadeDuration: 200,
        loudnessNormalization: true,
        equalizer: { enabled: true, bands: [1, 2], preamp: -2 },
      },
    },
    player: {
      outputDevice: "Legacy device",
      pauseOnDeviceSwitch: true,
      rememberDeviceVolume: true,
    },
  },
  status: {
    volume: 0.7,
    repeatMode: "list",
    currentIndex: 0,
    currentTrack: null,
    outputDevices: [] as { id: string; name: string }[],
    lyricOffsetMs: 0,
  },
}));
vi.mock("./events", () => ({ handleEvent: vi.fn() }));
vi.mock("./fm", () => ({}));
vi.mock("./stats", () => ({ installPlayStats: vi.fn() }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => mocks.settings }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/stores/media", () => ({
  useMediaStore: () => ({ track: null, updateLyricIndex: vi.fn() }),
}));
vi.mock("@/stores/streaming", () => ({ useStreamingStore: () => ({ init: mocks.streaming }) }));
vi.mock("@/stores/plugins", () => ({ usePluginsStore: () => ({ load: mocks.plugins }) }));
vi.mock("@/stores/history", () => ({ useHistoryStore: vi.fn() }));
vi.mock("@/stores/library", () => ({ useLibraryStore: vi.fn() }));
vi.mock("@/stores/school", () => ({ isSchoolMode: () => mocks.mode, canRequestNow: () => true }));
vi.mock("@/services/schoolScheduleBridge", () => ({ initSchoolBridge: mocks.school }));
vi.mock("@/services/requestPlayback", () => ({ requestSongs: vi.fn() }));
vi.mock("@/services/bilibiliSong", () => ({}));
vi.mock("@/stores/queue", () => ({ restoreQueue: mocks.restore }));
vi.mock("@/services/lyric/loader", () => ({}));
vi.mock("@/services/coverLoader", () => ({}));
vi.mock("@/services/deviceVolume", () => ({
  getDeviceVolume: mocks.deviceVolume,
  setDeviceVolume: vi.fn(),
}));
vi.mock("@/services/nextTrackPreloader", () => ({
  installNextTrackPreloadWatchers: vi.fn(),
  scheduleNextTrackPreload: mocks.preload,
}));
vi.mock("@/composables/useFavorite", () => ({ useFavorite: () => ({ isLiked: () => false }) }));
vi.mock("@/utils/color", () => ({ extractColorFromUrl: vi.fn() }));
vi.mock("@/i18n", () => ({ default: { global: { t: (key: string) => key } } }));

let api: {
  setVolume: ReturnType<typeof vi.fn>;
  setFadeDuration: ReturnType<typeof vi.fn>;
  setNormalizationEnabled: ReturnType<typeof vi.fn>;
  setEqualizerBands: ReturnType<typeof vi.fn>;
  setPreampGain: ReturnType<typeof vi.fn>;
  setEqualizerEnabled: ReturnType<typeof vi.fn>;
  getOutputDevices: ReturnType<typeof vi.fn>;
  setPauseOnDeviceSwitch: ReturnType<typeof vi.fn>;
  setOutputDevice: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  syncQueueIndex: ReturnType<typeof vi.fn>;
  syncPlayMode: ReturnType<typeof vi.fn>;
  syncLikeState: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.mode = false;
  mocks.settings.player.outputDevice = "Legacy device";
  mocks.status.outputDevices = [];
  mocks.status.volume = 0.7;
  mocks.config.mockResolvedValue(undefined);
  mocks.settings.syncSystem = mocks.config;
  for (const fn of [mocks.streaming, mocks.school, mocks.restore, mocks.plugins])
    fn.mockResolvedValue(undefined);
  api = Object.fromEntries(
    [
      "setVolume",
      "setFadeDuration",
      "setNormalizationEnabled",
      "setEqualizerBands",
      "setPreampGain",
      "setEqualizerEnabled",
      "setPauseOnDeviceSwitch",
      "setOutputDevice",
      "syncQueueIndex",
      "syncPlayMode",
      "syncLikeState",
    ].map((name) => [name, vi.fn().mockResolvedValue({ success: true })]),
  ) as typeof api;
  api.onEvent = vi.fn(() => vi.fn());
  api.getOutputDevices = vi
    .fn()
    .mockResolvedValue({ success: true, data: [{ id: "stable-device", name: "Legacy device" }] });
  Object.assign(window, {
    api: {
      school: {},
      player: api,
      nowPlaying: {
        onLyricOffsetChange: vi.fn(),
        requestSnapshot: vi.fn().mockResolvedValue({ lyricOffsetMs: 42 }),
      },
    },
  });
});

describe("播放核心并行就绪", () => {
  it("同一初始化共享任务，校园清理完成前不恢复队列、不允许提前就绪", async () => {
    const cleanup = Promise.withResolvers<void>();
    const config = Promise.withResolvers<void>();
    const streaming = Promise.withResolvers<void>();
    mocks.school.mockReturnValue(cleanup.promise);
    mocks.config.mockReturnValue(config.promise);
    mocks.streaming.mockReturnValue(streaming.promise);
    const { initPlayer } = await import("./index");
    const first = initPlayer();
    expect(initPlayer()).toBe(first);
    expect(mocks.config).toHaveBeenCalledOnce();
    expect(mocks.streaming).toHaveBeenCalledOnce();
    expect(mocks.school).toHaveBeenCalledOnce();
    config.resolve();
    streaming.resolve();
    await flushPromises();
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(api.setVolume).not.toHaveBeenCalled();
    cleanup.resolve();
    await first;
    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(api.onEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.preload.mock.invocationCallOrder[0]!,
    );
    expect(mocks.status.lyricOffsetMs).toBe(42);
  });
  it("独立配置不等待插件，均衡器和记忆设备仍保持依赖次序", async () => {
    const plugin = Promise.withResolvers<void>();
    const bands = Promise.withResolvers<void>();
    const device = Promise.withResolvers<void>();
    mocks.plugins.mockReturnValue(plugin.promise);
    api.setEqualizerBands.mockReturnValue(bands.promise);
    api.setOutputDevice.mockReturnValue(device.promise);
    const { initPlayer } = await import("./index");
    const ready = initPlayer();
    await flushPromises();
    expect(api.setNormalizationEnabled).toHaveBeenCalledWith(true);
    expect(api.setFadeDuration).toHaveBeenCalledWith(200);
    expect(api.setOutputDevice).toHaveBeenCalledWith("stable-device");
    expect(mocks.deviceVolume).not.toHaveBeenCalled();
    expect(api.setEqualizerEnabled).not.toHaveBeenCalled();
    expect(mocks.preload).not.toHaveBeenCalled();
    bands.resolve();
    device.resolve();
    await flushPromises();
    expect(api.setEqualizerEnabled).toHaveBeenCalledWith(true);
    expect(api.setVolume).toHaveBeenLastCalledWith(0.2);
    expect(mocks.preload).not.toHaveBeenCalled();
    plugin.resolve();
    await ready;
    expect(mocks.preload).toHaveBeenCalledOnce();
  });
  it("校园模式不恢复上次课间队列，安全清理失败不会标记核心就绪", async () => {
    mocks.mode = true;
    const { initPlayer } = await import("./index");
    await initPlayer();
    expect(mocks.restore).not.toHaveBeenCalled();
    vi.resetModules();
    mocks.school.mockRejectedValue(new Error("持久化清理失败"));
    mocks.preload.mockClear();
    await expect((await import("./index")).initPlayer()).rejects.toThrow("持久化清理失败");
    expect(mocks.preload).not.toHaveBeenCalled();
  });
});
