// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const ID = "carbonv.noise-limiter";
const state = vi.hoisted(() => ({
  directory: "",
  config: new Map<string, unknown>(),
  source: "",
  loadPlugin: vi.fn(),
  native: vi.fn(),
}));
vi.mock("electron", () => ({ app: { getVersion: () => "1.4.0" } }));
vi.mock("@main/utils/paths", () => ({
  get pluginsDir() {
    return state.directory;
  },
}));
vi.mock("@main/store", () => ({
  store: {
    get: (key: string) => state.config.get(key),
    set: (key: string, value: unknown) => state.config.set(key, value),
  },
}));
vi.mock("@main/utils/i18n", () => ({ getLocale: () => "zh-CN" }));
vi.mock("@main/utils/logger", () => ({
  coreLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./fileAccess", () => ({ releasePluginFiles: vi.fn() }));
vi.mock("./builtin", () => ({
  NOISE_LIMITER_ID: "carbonv.noise-limiter",
  builtinNoiseSource: () => state.source,
}));
vi.mock("./bundle", () => ({ readPluginBundle: vi.fn(), installBundleAssets: vi.fn() }));
vi.mock("./host", () => ({ dispatchHostCall: vi.fn() }));
vi.mock("./net", () => ({ fetchScript: vi.fn() }));
vi.mock("./storage", () => ({
  pluginStorageDrop: vi.fn(async () => {}),
  pluginStorageRelease: vi.fn(async () => {}),
  shutdownPluginStorage: vi.fn(async () => {}),
}));
vi.mock("./host-process", () => ({
  pluginHost: {
    loadPlugin: state.loadPlugin,
    isReady: () => false,
    unloadPlugin: vi.fn(),
    shutdown: vi.fn(),
  },
}));

/** 生成使用同一插件身份的真实元数据，脚本执行由可控宿主代替 */
const source = (grant = "ui,dsp"): string =>
  `/**\n * @id ${ID}\n * @name NoiseLimiter\n * @version 1.0.0\n * @apiLevel 6\n * @grant ${grant}\n */\ncplayer.register({});`;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "carbonv-registry-dsp-"));
  state.config = new Map([
    ["plugins.enabled", {}],
    ["plugins.permissions", {}],
    ["plugins.perPlugin", {}],
  ]);
  state.source = source();
  state.loadPlugin.mockImplementation(async (_spec, callbacks) => {
    callbacks.onReady({});
  });
});
afterEach(async () => {
  await (await import("./registry")).pluginRegistry.shutdown();
  await fs.rm(state.directory, { recursive: true, force: true });
});

/** 安装旧版本并接入实际效果仲裁，以原生下发记录观察保护是否中断 */
const prepare = async () => {
  const { pluginRegistry } = await import("./registry");
  const effects = await import("@main/services/audioEffects");
  effects.bindNativeDynamics(state.native);
  await pluginRegistry.installFromSource(source());
  effects.registerDynamics(ID, { kind: "dynamics", mode: "dynamic", strength: 35, ceilingDb: -18 });
  state.native.mockClear();
  return { pluginRegistry, effects };
};

describe("插件重载期间持续保留音频保护", () => {
  it.each(["replace", "update", "restore"] as const)(
    "%s 的异步启动窗口不下发关闭音效",
    async (kind) => {
      const { pluginRegistry, effects } = await prepare();
      let finish!: () => void;
      state.loadPlugin.mockImplementationOnce(async (_spec, callbacks) => {
        await new Promise<void>((done) => {
          finish = done;
        });
        callbacks.onReady({});
      });
      const operation =
        kind === "replace"
          ? pluginRegistry.installFromSource(source())
          : kind === "update"
            ? pluginRegistry.applyUpdateFromSource(ID, source())
            : pluginRegistry.restoreBuiltin();
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      expect(effects.effectiveDynamics()).toEqual({
        enabled: true,
        config: { kind: "dynamics", mode: "dynamic", strength: 35, ceilingDb: -18 },
      });
      expect(state.native.mock.calls.every(([enabled]) => enabled === true)).toBe(true);
      finish();
      await operation;
      expect(effects.effectiveDynamics().enabled).toBe(true);
      effects.registerDynamics(ID, {
        kind: "dynamics",
        mode: "dynamic",
        strength: 70,
        ceilingDb: -20,
      });
      expect(effects.effectiveDynamics().config.ceilingDb).toBe(-20);
      expect(state.native.mock.calls.every(([enabled]) => enabled === true)).toBe(true);
    },
  );

  it("重载失败降为基础保护，保留最后有效上限", async () => {
    const { pluginRegistry, effects } = await prepare();
    state.loadPlugin.mockRejectedValueOnce(new Error("new plugin failed"));
    await pluginRegistry.applyUpdateFromSource(ID, source());
    expect(pluginRegistry.getRuntime(ID)?.status.state).toBe("error");
    expect(effects.effectiveDynamics()).toEqual({
      enabled: true,
      config: { kind: "dynamics", mode: "basic", strength: 50, ceilingDb: -18 },
    });
    expect(state.native.mock.calls.every(([enabled]) => enabled === true)).toBe(true);
  });

  it("新版本不再声明 DSP 时删除旧贡献", async () => {
    const { pluginRegistry, effects } = await prepare();
    await pluginRegistry.applyUpdateFromSource(ID, source("ui"));
    expect(effects.effectiveDynamics().enabled).toBe(false);
  });

  it.each(["disable", "uninstall", "revoke"] as const)("用户明确 %s 时才移除音效", async (kind) => {
    const { pluginRegistry, effects } = await prepare();
    if (kind === "disable") await pluginRegistry.setEnabled(ID, false);
    else if (kind === "uninstall") await pluginRegistry.uninstall(ID);
    else await pluginRegistry.setPermission(ID, "dsp", false);
    expect(effects.effectiveDynamics().enabled).toBe(false);
    expect(state.native.mock.calls.some(([enabled]) => enabled === false)).toBe(true);
  });
});
