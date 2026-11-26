import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@main/utils/logger", () => ({ coreLog: { error: vi.fn() } }));
import {
  registerDynamics,
  removeDynamics,
  effectiveDynamics,
  degradeDynamics,
  bindNativeDynamics,
  assertNativeDynamics,
} from "./audioEffects";
import { DEFAULT_DYNAMICS } from "@shared/types/audioEffects";
beforeEach(() => {
  for (const id of ["one", "two"]) removeDynamics(id);
  bindNativeDynamics(undefined);
});
describe("插件音效生命周期", () => {
  it("组合贡献时输出上限取更严格值，不能互相抬升", () => {
    registerDynamics("one", DEFAULT_DYNAMICS);
    registerDynamics("two", { ...DEFAULT_DYNAMICS, mode: "basic", ceilingDb: -6, strength: 80 });
    expect(effectiveDynamics()).toEqual({
      enabled: true,
      config: { ...DEFAULT_DYNAMICS, strength: 80 },
    });
    removeDynamics("one");
    expect(effectiveDynamics().config.ceilingDb).toBe(-6);
  });
  it("非法配置保留最后有效参数", () => {
    registerDynamics("one", DEFAULT_DYNAMICS);
    expect(() => registerDynamics("one", { ...DEFAULT_DYNAMICS, strength: NaN })).toThrow();
    expect(effectiveDynamics().config).toEqual(DEFAULT_DYNAMICS);
  });
  it("错误保留动态保护，显式卸载才取消效果", () => {
    registerDynamics("one", DEFAULT_DYNAMICS);
    degradeDynamics("one");
    expect(effectiveDynamics().config.mode).toBe("dynamic");
    expect(effectiveDynamics().config.ceilingDb).toBe(-12);
    removeDynamics("one");
    expect(effectiveDynamics().enabled).toBe(false);
  });
  it("无法保留原生保护时禁止播放，明确禁用才恢复", () => {
    registerDynamics("one", DEFAULT_DYNAMICS);
    bindNativeDynamics(() => {
      throw new Error("fault");
    });
    expect(() => assertNativeDynamics()).toThrow("保护不可用");
    removeDynamics("one");
    expect(() => assertNativeDynamics()).not.toThrow();
  });
  it("原生模块晚初始化仍得到完整配置", () => {
    registerDynamics("one", DEFAULT_DYNAMICS);
    const sink = vi.fn();
    bindNativeDynamics(sink);
    expect(sink).toHaveBeenCalledWith(true, DEFAULT_DYNAMICS);
  });
});
