/* SPDX-License-Identifier: MPL-2.0 */
class CarbonVDynamics extends AudioWorkletProcessor {
  /** 初始化固定大小的双声道处理器与参数通道 */
  constructor(options) {
    super();
    this.config = options.processorOptions.config;
    this.released = false;
    this.gain = 1;
    this.lastReport = 0;
    this.lastPeak = 0;
    this.wasm = null;
    try {
      this.wasm = new WebAssembly.Instance(options.processorOptions.module, {}).exports;
      this.handle = this.wasm.noise_new(sampleRate, 2);
      this.samples = new Float32Array(
        this.wasm.memory.buffer,
        this.wasm.noise_input(this.handle),
        256,
      );
      this.configure();
    } catch {
      this.wasm = null;
    }
    this.port.onmessage = ({ data }) => {
      if (data.dispose) {
        if (this.wasm) this.wasm.noise_free(this.handle);
        this.wasm = null;
        this.released = true;
        return;
      }
      if (data.config) {
        this.config = data.config;
        this.configure();
      }
    };
  }
  /** 参数只在音频块之间切换 */
  configure() {
    if (this.wasm) {
      const c = this.config;
      this.wasm.noise_configure(
        this.handle,
        Number(c.enabled),
        Number(c.config.mode === "dynamic"),
        c.config.strength,
        c.config.ceilingDb,
      );
    }
  }
  /** 同一块在 WASM 故障时退到声道联动的限幅，不放出未限制原声 */
  process(inputs, outputs) {
    if (this.released) return false;
    const output = outputs[0],
      input = inputs[0];
    if (!output?.length) return true;
    const count = output[0].length;
    if (this.wasm) {
      try {
        for (let i = 0; i < count; i++)
          for (let ch = 0; ch < 2; ch++)
            this.samples[i * 2 + ch] = input[ch]?.[i] ?? input[0]?.[i] ?? 0;
        this.wasm.noise_process(this.handle, count);
        for (let ch = 0; ch < output.length; ch++)
          for (let i = 0; i < count; i++) output[ch][i] = this.samples[i * 2 + Math.min(ch, 1)];
      } catch {
        this.wasm = null;
      }
    }
    if (!this.wasm) {
      const ceiling = 10 ** (this.config.config.ceilingDb / 20);
      for (let i = 0; i < count; i++) {
        let peak = 0;
        for (let ch = 0; ch < output.length; ch++)
          peak = Math.max(peak, Math.abs(input[ch]?.[i] ?? input[0]?.[i] ?? 0));
        const wanted = peak > ceiling ? ceiling / peak : 1;
        this.gain = wanted < this.gain ? wanted : this.gain + (1 - this.gain) * 0.0001;
        for (let ch = 0; ch < output.length; ch++) {
          const value = input[ch]?.[i] ?? input[0]?.[i] ?? 0;
          output[ch][i] = Number.isFinite(value)
            ? this.config.enabled
              ? Math.max(-ceiling, Math.min(ceiling, value * this.gain))
              : value
            : 0;
        }
      }
    }
    for (let ch = 0; ch < output.length; ch++)
      for (let i = 0; i < count; i++)
        this.lastPeak = Math.max(this.lastPeak, Math.abs(output[ch][i]));
    if (currentFrame - this.lastReport >= sampleRate / 5) {
      this.lastReport = currentFrame;
      this.port.postMessage({
        peak: this.lastPeak,
        state: this.wasm ? "active" : "fallback",
        reductionDb: this.wasm
          ? this.wasm.noise_reduction(this.handle)
          : -20 * Math.log10(Math.max(this.gain, 1e-6)),
      });
      this.lastPeak = 0;
    }
    return true;
  }
}
registerProcessor("carbonv-dynamics", CarbonVDynamics);
