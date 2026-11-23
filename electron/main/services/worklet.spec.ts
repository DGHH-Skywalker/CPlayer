import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DEFAULT_DYNAMICS } from "@shared/types/audioEffects";
/** 使用真正的 WASM 和处理器，只替换浏览器调度外壳 */
const instance = (broken = false, enabled = true) => {
  let Constructor: any;
  const context = {
    sampleRate: 48000,
    currentFrame: 0,
    WebAssembly,
    Float32Array,
    Math,
    Number,
    AudioWorkletProcessor: class {
      port = { onmessage: undefined, postMessage: () => {} };
    },
    registerProcessor: (_name: string, value: unknown) => (Constructor = value),
  };
  vm.runInNewContext(readFileSync("vendor/noiselimiter/processor.js", "utf8"), context);
  const module = broken
    ? null
    : new WebAssembly.Module(readFileSync("vendor/noiselimiter/dynamics.wasm"));
  return new Constructor({
    processorOptions: { module, config: { enabled, config: DEFAULT_DYNAMICS } },
  });
};
describe("共享浏览器动态处理", () => {
  it.each([false, true])("WASM 故障=%s 时输出均受同一上限保护", (broken) => {
    const node = instance(broken);
    const input = [new Float32Array(128), new Float32Array(128)];
    const output = [new Float32Array(128), new Float32Array(128)];
    let peak = 0;
    for (let block = 0; block < 200; block++) {
      for (let i = 0; i < 128; i++)
        input[0][i] = input[1][i] = 0.9 * Math.sin((block * 128 + i) * 0.1);
      expect(node.process([input], [output])).toBe(true);
      for (const channel of output)
        for (const value of channel) {
          expect(Number.isFinite(value)).toBe(true);
          peak = Math.max(peak, Math.abs(value));
        }
    }
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThanOrEqual(10 ** (-12 / 20) + 1e-6);
  });
  it("显式关闭保持原始采样，释放后停止运行", () => {
    const node = instance(false, false);
    const input = [new Float32Array(128).fill(0.8), new Float32Array(128).fill(-0.7)];
    const output = [new Float32Array(128), new Float32Array(128)];
    node.process([input], [output]);
    expect(output[0][100]).toBeCloseTo(0.8);
    node.port.onmessage({ data: { dispose: true } });
    expect(node.process([input], [output])).toBe(false);
  });
});
