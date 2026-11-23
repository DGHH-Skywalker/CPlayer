import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { consumePluginCenterKey, pluginCenterUnlocked, syncPluginCenter } from "./pluginCenter";
const api = { centerEnter: vi.fn(), centerReset: vi.fn(), centerState: vi.fn() };
beforeEach(() => {
  pluginCenterUnlocked.value = false;
  api.centerEnter.mockReset().mockResolvedValue(false);
  api.centerState.mockReset().mockResolvedValue(false);
  api.centerReset.mockClear();
  vi.stubGlobal("api", { plugins: api });
});
afterEach(() => vi.unstubAllGlobals());
describe("设置隐藏入口按键过滤", () => {
  it("忽略长按、输入法和输入控件", async () => {
    await consumePluginCenterKey(new KeyboardEvent("keydown", { key: "Enter", repeat: true }));
    await consumePluginCenterKey(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(event, "target", { value: input });
    await consumePluginCenterKey(event);
    expect(api.centerEnter).not.toHaveBeenCalled();
  });
  it("主进程确认解锁后才显示，其他键重置序列", async () => {
    await consumePluginCenterKey(new KeyboardEvent("keydown", { key: "a" }));
    expect(api.centerReset).toHaveBeenCalledOnce();
    api.centerEnter.mockResolvedValue(true);
    expect(await consumePluginCenterKey(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
    expect(pluginCenterUnlocked.value).toBe(true);
  });
  it("渲染重载后读取主进程已有状态", async () => {
    api.centerState.mockResolvedValue(true);
    await syncPluginCenter();
    expect(pluginCenterUnlocked.value).toBe(true);
  });
});
