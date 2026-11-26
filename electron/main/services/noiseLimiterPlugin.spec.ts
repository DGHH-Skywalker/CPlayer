// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DYNAMICS,
  dynamicsSafetyCeilingDb,
  validateDynamics,
} from "@shared/types/audioEffects";

describe("唯一动态压制控制", () => {
  it("旧基础模式只作为 API 兼容别名，不选择另一条算法", () => {
    expect(validateDynamics({ ...DEFAULT_DYNAMICS, mode: "basic" }).mode).toBe("dynamic");
  });
  it("最高强度采用更严格安全上限且不放宽用户设置", () => {
    expect(dynamicsSafetyCeilingDb(DEFAULT_DYNAMICS)).toBe(-12);
    expect(dynamicsSafetyCeilingDb({ ...DEFAULT_DYNAMICS, strength: 100 })).toBe(-36);
    expect(dynamicsSafetyCeilingDb({ ...DEFAULT_DYNAMICS, strength: 0, ceilingDb: -30 })).toBe(-30);
  });
  it("界面只注册动态强度和上限，忽略旧模式并实时下发最高强度", () => {
    const register = vi.fn(),
      effect = vi.fn(async () => {});
    const changes = new Map<string, () => void>();
    const values = new Map<string, unknown>([
      ["mode", "basic"],
      ["basicStrength", 15],
      ["dynamicStrength", 100],
      ["ceilingDb", -18],
    ]);
    runInNewContext(readFileSync("vendor/noiselimiter/plugin.js", "utf8"), {
      cplayer: {
        register,
        getSetting: (key: string) => values.get(key),
        onSettingChange: (key: string, callback: () => void) => changes.set(key, callback),
        audio: { registerEffect: effect },
        log: { error: vi.fn() },
      },
    });
    const schema = register.mock.calls[0][0].settings;
    expect(schema.map((setting: { key: string }) => setting.key)).toEqual([
      "dynamicStrength",
      "ceilingDb",
    ]);
    expect(
      schema.every(
        (setting: { type: string; when?: unknown }) => setting.type === "slider" && !setting.when,
      ),
    ).toBe(true);
    expect(effect).toHaveBeenLastCalledWith({
      kind: "dynamics",
      mode: "dynamic",
      strength: 100,
      ceilingDb: -18,
    });
    values.set("dynamicStrength", 75);
    changes.get("dynamicStrength")!();
    expect(effect).toHaveBeenLastCalledWith({
      kind: "dynamics",
      mode: "dynamic",
      strength: 75,
      ceilingDb: -18,
    });
  });
});
