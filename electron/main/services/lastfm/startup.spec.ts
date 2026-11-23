import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), updateNowPlaying: vi.fn(), scrobble: vi.fn() }));
vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));
vi.mock("@main/store", () => ({
  store: { get: () => ({ enabled: true, nowPlaying: true, scrobble: true }) },
}));
vi.mock("@main/utils/logger", () => ({
  lastfmLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("./credentials", () => ({ load: mocks.load, clear: vi.fn(), save: vi.fn() }));
vi.mock("./client", () => ({ updateNowPlaying: mocks.updateNowPlaying, scrobble: mocks.scrobble }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.updateNowPlaying.mockResolvedValue(undefined);
});

describe("Last.fm 分阶段启动", () => {
  it("初始化不解密凭证，首曲事件等待共享准备后仍会上报", async () => {
    let finish!: (value: { username: string; sessionKey: string }) => void;
    mocks.load.mockReturnValue(
      new Promise((done) => {
        finish = done;
      }),
    );
    const service = await import("./index");
    service.init();
    expect(mocks.load).not.toHaveBeenCalled();
    service.onTrackLoaded({
      title: "First",
      artist: "Artist",
      album: "",
      durationMs: 60000,
      autoPlay: true,
    });
    expect(mocks.load).toHaveBeenCalledOnce();
    const preparation = service.loadSession();
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.updateNowPlaying).not.toHaveBeenCalled();
    finish({ username: "user", sessionKey: "private" });
    await preparation;
    await Promise.resolve();
    expect(mocks.updateNowPlaying).toHaveBeenCalledWith(
      "private",
      "First",
      "Artist",
      undefined,
      60,
    );
  });

  it("断开后迟到的凭证读取不能重新恢复连接", async () => {
    let finish!: (value: { username: string; sessionKey: string }) => void;
    mocks.load.mockReturnValue(
      new Promise((done) => {
        finish = done;
      }),
    );
    const service = await import("./index");
    service.init();
    const preparation = service.loadSession();
    service.disconnect();
    finish({ username: "old", sessionKey: "private" });
    await preparation;
    expect(service.getStatus().connected).toBe(false);
  });
});
