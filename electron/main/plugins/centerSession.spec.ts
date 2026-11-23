import { describe, it, expect } from "vitest";
import { PluginCenterSession } from "./centerSession";
describe("插件中心会话入口", () => {
  it("仅五次独立按键且在三秒内解锁", () => {
    const s = new PluginCenterSession();
    for (let i = 0; i < 4; i++) expect(s.enter(1000 + i * 100)).toBe(false);
    expect(s.enter(1400)).toBe(true);
    s.reset();
    expect(s.unlocked).toBe(true);
    expect(new PluginCenterSession().unlocked).toBe(false);
  });
  it("超时、时间回跳和编辑中断均重新计数", () => {
    const s = new PluginCenterSession();
    s.enter(1000);
    s.enter(1100);
    expect(s.enter(5000)).toBe(false);
    expect(s.enter(100)).toBe(false);
    s.reset();
    for (let i = 0; i < 4; i++) expect(s.enter(100 + i)).toBe(false);
  });
});
