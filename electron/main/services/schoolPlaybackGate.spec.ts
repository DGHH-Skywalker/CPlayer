import { beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
  load: vi.fn(async () => ({})),
  prepareNext: vi.fn(async () => true),
  transitionToPrepared: vi.fn(async () => ({})),
  reinitOutput: vi.fn(async () => {}),
  seek: vi.fn(async () => {}),
  stop: vi.fn(),
  pause: vi.fn(),
  setCoverCacheDir: vi.fn(),
}));
vi.mock("@main/utils/nativeLoader", () => ({
  loadNativeModule: () => ({
    AudioPlayer: class {
      constructor() {
        return native;
      }
    },
    initLogger: vi.fn(),
    setHttpProxy: vi.fn(),
  }),
}));
vi.mock("@main/utils/config", () => ({ getCoverCacheDir: () => "covers", isDev: true }));
vi.mock("@main/utils/proxy", () => ({ getNetworkProxyUrl: () => "" }));
vi.mock("@main/utils/logger", () => ({ playerLog: { info: vi.fn() }, nativeLogsDir: "logs" }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
describe("原生音频最终播放闸门", () => {
  it("调度初始化前禁止播放，普通模式检查后放行", async () => {
    const gate = await import("./schoolPlaybackGate");
    const { getPlayer } = await import("./engine");
    await expect(getPlayer().play()).rejects.toThrow("上课中");
    expect(native.play).not.toHaveBeenCalled();
    gate.installSchoolGate(() => true);
    await getPlayer().play();
    expect(native.play).toHaveBeenCalledOnce();
  });
  it("上课时所有加载、恢复、预载、交接、设备恢复都被拒绝，停止仍可执行", async () => {
    const gate = await import("./schoolPlaybackGate");
    const { getPlayer } = await import("./engine");
    let allowed = true;
    gate.installSchoolGate(() => allowed);
    const player = getPlayer();
    const cachedPlay = player.play;
    allowed = false;
    await expect(cachedPlay()).rejects.toThrow("上课中");
    await expect(player.load("late.wav", true)).rejects.toThrow();
    await expect(player.prepareNext("old", "late.wav")).rejects.toThrow();
    await expect(player.transitionToPrepared("old", "late.wav", 1, "standard")).rejects.toThrow();
    await expect(player.reinitOutput()).rejects.toThrow();
    await expect(player.seek(0)).rejects.toThrow();
    player.stop();
    expect(native.stop).toHaveBeenCalledOnce();
    for (const name of [
      "play",
      "load",
      "prepareNext",
      "transitionToPrepared",
      "reinitOutput",
      "seek",
    ] as const)
      expect(native[name]).not.toHaveBeenCalled();
  });
});
