import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import Bilibili from "./Bilibili.vue";

const mocks = vi.hoisted(() => ({
  route: { path: "/bilibili" },
  status: { isPlayerExpanded: false },
  command: vi.fn(),
}));
vi.mock("vue-router", () => ({ useRoute: () => mocks.route }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/stores/school", () => ({ canRequestNow: () => true, isSchoolMode: () => false }));
vi.mock("@/services/requestPlayback", () => ({ requestSong: vi.fn() }));
vi.mock("@/core/player", () => ({ insertManyToQueue: vi.fn() }));
vi.mock("@/stores/queue", async () => ({ queue: (await import("vue")).shallowRef([]) }));
vi.mock("@/composables/useToast", () => ({ toast: { info: vi.fn() } }));

let wrapper: VueWrapper | undefined;
let overlay: HTMLElement;

/** 等待布局动画帧及异步 IPC 完成 */
const settleLayout = async (): Promise<void> => {
  await nextTick();
  await vi.advanceTimersByTimeAsync(32);
  await flushPromises();
};

/** 模拟搜索、菜单或确认弹窗占据原生视图上层 */
const openOverlay = (): void => {
  overlay.setAttribute("role", "dialog");
  overlay.innerHTML = "<input aria-label='搜索'>";
  document.body.appendChild(overlay);
  overlay.querySelector("input")!.focus();
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.route = reactive({ path: "/bilibili" });
  mocks.status = reactive({ isPlayerExpanded: false });
  mocks.command.mockReset().mockResolvedValue({ visible: true });
  vi.stubGlobal("api", {
    bilibili: {
      command: mocks.command,
      onState: () => () => {},
      onRequest: () => () => {},
    },
  });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  overlay = document.createElement("div");
  const rect = new DOMRect(0, 0, 560, 400);
  vi.spyOn(overlay, "getClientRects").mockReturnValue(
    Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) }),
  );
  wrapper = mount(Bilibili, {
    attachTo: document.body,
    global: { stubs: { SButton: { template: "<button><slot/></button>" } } },
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  overlay.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("B 站搜索焦点与页面生命周期", () => {
  it("打开搜索弹窗只遮住画面，关闭只恢复画面，不发送暂停或隐藏", async () => {
    await settleLayout();
    mocks.command.mockClear();
    openOverlay();
    await settleLayout();
    expect(mocks.command).toHaveBeenCalledWith("occlude", undefined);
    expect(mocks.command).not.toHaveBeenCalledWith("hide", undefined);
    overlay.remove();
    await settleLayout();
    expect(mocks.command).toHaveBeenCalledWith("show", undefined);
    expect(
      mocks.command.mock.calls.every(([name]) => ["bounds", "occlude", "show"].includes(name)),
    ).toBe(true);
  });

  it("单纯把焦点交给主界面输入框不会隐藏网页", async () => {
    await settleLayout();
    mocks.command.mockClear();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new Event("blur"));
    await settleLayout();
    expect(mocks.command.mock.calls.every(([name]) => name === "bounds")).toBe(true);
  });

  it("弹窗打开时离开页面仍执行完整隐藏，不能继续后台播放", async () => {
    await settleLayout();
    openOverlay();
    await settleLayout();
    mocks.command.mockClear();
    mocks.route.path = "/search";
    window.dispatchEvent(new Event("resize"));
    await settleLayout();
    expect(mocks.command).toHaveBeenCalledWith("hide", undefined);
  });

  it("窗口隐藏或音乐全屏仍执行完整隐藏", async () => {
    await settleLayout();
    mocks.command.mockClear();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await settleLayout();
    expect(mocks.command).toHaveBeenCalledWith("hide", undefined);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await settleLayout();
    mocks.command.mockClear();
    mocks.status.isPlayerExpanded = true;
    await settleLayout();
    expect(mocks.command).toHaveBeenCalledWith("hide", undefined);
  });

  it("迟到的边界 IPC 不能在弹窗出现后重新显示网页", async () => {
    await settleLayout();
    let complete: (() => void) | undefined;
    mocks.command.mockImplementationOnce(() => new Promise<void>((done) => (complete = done)));
    window.dispatchEvent(new Event("resize"));
    await settleLayout();
    openOverlay();
    await settleLayout();
    mocks.command.mockClear();
    complete?.();
    await settleLayout();
    expect(mocks.command).not.toHaveBeenCalledWith("show", undefined);
  });
});
