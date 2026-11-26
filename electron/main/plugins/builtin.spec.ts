// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }));
import { builtinNoiseSource, upgradeBuiltinNoiseSource } from "./builtin";
const legacy = readFileSync("electron/main/plugins/fixtures/noiselimiter-1.0.0.txt", "utf8");
describe("固定内置脚本升级身份", () => {
  it("只识别已分发的原始脚本并兼容 Windows 换行", () => {
    expect(upgradeBuiltinNoiseSource(legacy)).toBe(builtinNoiseSource());
    expect(upgradeBuiltinNoiseSource(legacy.replace(/\n/g, "\r\n"))).toBe(builtinNoiseSource());
  });
  it("不替换用户改写、当前版本和第三方同名脚本", () => {
    expect(upgradeBuiltinNoiseSource(legacy + "\n// 用户修改")).toBeUndefined();
    expect(upgradeBuiltinNoiseSource(builtinNoiseSource())).toBeUndefined();
    expect(upgradeBuiltinNoiseSource("cplayer.register({})")).toBeUndefined();
  });
});
