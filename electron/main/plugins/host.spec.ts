import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendHostResult: vi.fn(),
  callNetease: vi.fn(),
  configGet: vi.fn(),
  configSet: vi.fn(),
  applyConfig: vi.fn(),
}));
vi.mock("@main/store", () => ({ store: { get: mocks.configGet, set: mocks.configSet } }));
vi.mock("@main/ipc/config", () => ({ applyConfigChange: mocks.applyConfig }));
vi.mock("electron", () => ({ Notification: vi.fn() }));
vi.mock("./host-process", () => ({ pluginHost: mocks }));
vi.mock("./net", () => ({ hostRequest: vi.fn() }));
vi.mock("./storage", () => ({
  pluginStorageGet: vi.fn(),
  pluginStorageKeys: vi.fn(),
  pluginStorageRemove: vi.fn(),
  pluginStorageSet: vi.fn(),
}));
vi.mock("@main/services/playerControl", () => ({ playerControl: {} }));
vi.mock("@main/services/nowPlaying", () => ({ lightSnapshot: vi.fn() }));
vi.mock("@main/apis/netease", () => ({ callNetease: mocks.callNetease }));
vi.mock("@main/apis/qqmusic", () => ({ callQQMusic: vi.fn() }));
vi.mock("@main/apis/kugou", () => ({ callKugou: vi.fn() }));
vi.mock("@main/services/music", () => ({}));
vi.mock("@main/utils/logger", () => ({ coreLog: { warn: vi.fn() } }));

import { dispatchHostCall } from "./host";

describe("插件调用现有平台接口", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["song_detail", { ids: "1" }],
    ["playlist_tracks", { op: "add", pid: "1", tracks: "2" }],
  ])("api.call 转发 %s 的参数并返回结果", async (name, params) => {
    const result = { status: 200, body: { code: 200 } };
    mocks.callNetease.mockResolvedValue(result);
    await dispatchHostCall("plugin", () => ["api"], "call", "api.call", ["netease", name, params]);
    expect(mocks.callNetease).toHaveBeenCalledWith(name, params);
    expect(mocks.sendHostResult).toHaveBeenCalledWith("plugin", "call", true, {
      ok: true,
      ...result,
    });
  });
});

describe("API 6 配置权限", () => {
  it("通过既有配置副作用立即应用有效参数", async () => {
    await dispatchHostCall("plugin", () => ["settings"], "fade", "settings.set", [
      "player.fadeDuration",
      250,
    ]);
    expect(mocks.configSet).toHaveBeenCalledWith("player.fadeDuration", 250);
    expect(mocks.applyConfig).toHaveBeenCalledWith("player.fadeDuration", 250);
  });
  it("配置权限不能改校园闸门，也不能被其他权限替代", async () => {
    mocks.configSet.mockClear();
    await dispatchHostCall("plugin", () => ["settings"], "school", "settings.set", [
      "school.scheduleEnabled",
      false,
    ]);
    await dispatchHostCall("plugin", () => ["control"], "denied", "settings.set", [
      "player.autoPlay",
      true,
    ]);
    expect(mocks.configSet).not.toHaveBeenCalled();
    expect(mocks.sendHostResult).toHaveBeenCalledWith(
      "plugin",
      "denied",
      false,
      undefined,
      expect.objectContaining({ code: expect.any(String) }),
    );
  });
});
