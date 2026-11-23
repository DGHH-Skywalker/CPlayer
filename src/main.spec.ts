import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  core: vi.fn(),
  route: vi.fn(),
  files: vi.fn(),
  protocol: vi.fn(),
  restore: vi.fn(),
  handleProtocol: vi.fn(),
  playFiles: vi.fn(),
  mounted: vi.fn(),
  order: [] as string[],
}));
vi.mock("virtual:uno.css", () => ({}));
vi.mock("./App.vue", async () => {
  const { defineComponent, onMounted, h } = await import("vue");
  return {
    default: defineComponent({
      /** 挂载记录用于验证播放派发早于页面副作用 */
      setup() {
        onMounted(() => {
          mocks.order.push("mounted");
          mocks.mounted();
        });
        return () => h("div");
      },
    }),
  };
});
vi.mock("./router", () => ({ default: { install: vi.fn(), isReady: mocks.route } }));
vi.mock("./i18n", () => ({
  default: { install: vi.fn(), global: { locale: { value: "zh-CN" } } },
}));
vi.mock("./stores/theme", () => ({ useThemeStore: () => ({ init: vi.fn() }) }));
vi.mock("./stores/settings", () => ({ useSettingsStore: () => ({ locale: "zh-CN" }) }));
vi.mock("./core/player", () => ({
  initPlayer: mocks.core,
  playFiles: mocks.playFiles,
  restoreLastTrack: mocks.restore,
}));
vi.mock("./services/orpheus", () => ({ handleOrpheus: mocks.handleProtocol }));
vi.mock("./directives/ripple", () => ({ vRipple: {} }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.order = [];
  document.body.innerHTML = '<div id="app"></div>';
  for (const fn of [mocks.core, mocks.route, mocks.restore, mocks.handleProtocol, mocks.playFiles])
    fn.mockResolvedValue(undefined);
  mocks.files.mockResolvedValue([]);
  mocks.protocol.mockResolvedValue(null);
  Object.assign(window, {
    api: {
      system: {
        setLocale: vi.fn(),
        consumePendingAudioFiles: mocks.files,
        consumePendingProtocolUrl: mocks.protocol,
      },
    },
  });
});
afterEach(() => {
  const root = document.getElementById("app") as
    (HTMLElement & { __vue_app__?: { unmount(): void } }) | null;
  root?.__vue_app__?.unmount();
  document.body.innerHTML = "";
});

describe("首屏前的冷启动派发", () => {
  it("核心与路由就绪后才消费任务，恢复先派发但慢音源不阻止首屏", async () => {
    const core = Promise.withResolvers<void>();
    const source = Promise.withResolvers<void>();
    mocks.core.mockReturnValue(core.promise);
    mocks.restore.mockImplementation(() => {
      mocks.order.push("restore");
      return source.promise;
    });
    const application = await import("./main");
    const mounted = application.mountApplication();
    await flushPromises();
    expect(mocks.files).not.toHaveBeenCalled();
    expect(mocks.route).toHaveBeenCalledOnce();
    core.resolve();
    await mounted;
    expect(mocks.order).toEqual(["restore", "mounted"]);
    await application.startPlayback();
    expect(mocks.restore).toHaveBeenCalledOnce();
    source.resolve();
  });
  it("本地消费完成前不挂载，文件优先于协议且只派发一次", async () => {
    const files = Promise.withResolvers<string[]>();
    const source = Promise.withResolvers<void>();
    mocks.files.mockReturnValue(files.promise);
    mocks.protocol.mockResolvedValue("orpheus://fixture");
    mocks.playFiles.mockImplementation(() => {
      mocks.order.push("files");
      return source.promise;
    });
    const application = await import("./main");
    const mounted = application.mountApplication();
    await flushPromises();
    expect(mocks.mounted).not.toHaveBeenCalled();
    files.resolve(["C:/music/song.flac"]);
    await mounted;
    expect(mocks.order).toEqual(["files", "mounted"]);
    expect(mocks.handleProtocol).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
    await application.startPlayback();
    expect(mocks.playFiles).toHaveBeenCalledOnce();
    source.resolve();
  });
  it("协议先派发，协议请求失败不阻塞首屏或产生未处理拒绝", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.protocol.mockResolvedValue("orpheus://fixture");
    mocks.handleProtocol.mockImplementation(() => {
      mocks.order.push("protocol");
      return Promise.reject(new Error("协议加载失败"));
    });
    const application = await import("./main");
    await application.mountApplication();
    expect(mocks.order).toEqual(["protocol", "mounted"]);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "协议加载失败" }),
    );
  });
  it("本地消费 IPC 失败仍挂载可用界面", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.files.mockRejectedValue(new Error("消费失败"));
    const application = await import("./main");
    await application.mountApplication();
    expect(mocks.mounted).toHaveBeenCalledOnce();
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ message: "消费失败" }));
  });
});
