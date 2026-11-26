// SPDX-License-Identifier: MPL-2.0
// 动态包络与增益曲线改写自 CamillaDSP，Copyright (C) 2026 Henrik Enquist
// 修改：CarbonVPlayer；来源及原始源码位于 vendor/noiselimiter/camilladsp

const MAX_CHANNELS: usize = 32;
#[cfg(target_arch = "wasm32")]
const BLOCK: usize = 128;

#[derive(Clone, Copy, Debug)]
pub struct Config {
    pub enabled: bool,
    pub dynamic: bool,
    pub strength: f32,
    pub ceiling_db: f32,
}
impl Default for Config {
    /// 默认采用中等动态抑制，不增加信号增益
    fn default() -> Self {
        Self {
            enabled: true,
            dynamic: true,
            strength: 50.0,
            ceiling_db: -12.0,
        }
    }
}
impl Config {
    /// 校验所有参数，非法值不能进入实时线程
    pub fn valid(self) -> bool {
        self.strength.is_finite()
            && (0.0..=100.0).contains(&self.strength)
            && self.ceiling_db.is_finite()
            && (-30.0..=-3.0).contains(&self.ceiling_db)
    }
}
#[derive(Clone, Copy)]
struct Envelope {
    level: f32,
}
impl Envelope {
    /// 峰值立即进入检测、缓慢释放，预读帧在鼓点起音前获得衰减
    fn gain(&mut self, peak: f32, release: f32, threshold: f32, ratio: f32) -> f32 {
        self.level = peak.max(self.level * release);
        let db = 20.0 * (self.level + 1.0e-9).log10();
        let over = db - threshold;
        let reduction = if over <= -3.0 {
            0.0
        } else if over >= 3.0 {
            over * (1.0 - 1.0 / ratio)
        } else {
            (over + 3.0).powi(2) / 12.0 * (1.0 - 1.0 / ratio)
        };
        10.0_f32.powf(-reduction / 20.0)
    }
}
#[derive(Clone, Copy, Default)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}
impl Biquad {
    /// 构建互补 Butterworth 滤波，级联形成同相位四阶分频
    fn filter(rate: f32, frequency: f32, highpass: bool) -> Self {
        let w = 2.0 * std::f32::consts::PI * frequency.min(rate * 0.4) / rate;
        let alpha = w.sin() / std::f32::consts::SQRT_2;
        let a0 = 1.0 + alpha;
        let sign = if highpass { -1.0 } else { 1.0 };
        let b0 = (1.0 - sign * w.cos()) / 2.0 / a0;
        Self {
            b0,
            b1: 2.0 * sign * b0,
            b2: b0,
            a1: -2.0 * w.cos() / a0,
            a2: (1.0 - alpha) / a0,
            ..Self::default()
        }
    }
    /// 直接型二阶滤波，不分配缓冲或获取锁
    fn sample(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}
#[derive(Clone, Copy)]
struct Crossover {
    filters: [Biquad; 4],
}
impl Crossover {
    /// 初始化 Linkwitz–Riley 四阶分频，减少低频从中频残差泄漏
    fn new(rate: f32, frequency: f32) -> Self {
        let lp = Biquad::filter(rate, frequency, false);
        let hp = Biquad::filter(rate, frequency, true);
        Self {
            filters: [lp, lp, hp, hp],
        }
    }
    /// 返回同相位的低频与高频分量
    fn split(&mut self, sample: f32) -> (f32, f32) {
        let low = self.filters[0].sample(sample);
        let low = self.filters[1].sample(low);
        let high = self.filters[2].sample(sample);
        let high = self.filters[3].sample(high);
        (low, high)
    }
}
struct Splitter {
    bass: Crossover,
    presence: Crossover,
    phase: Crossover,
}
impl Splitter {
    /// 低频支路补偿第二级分频的相位，三频段重组不产生低频残差
    fn new(rate: f32) -> Self {
        Self {
            bass: Crossover::new(rate, 300.0),
            presence: Crossover::new(rate, 2500.0),
            phase: Crossover::new(rate, 2500.0),
        }
    }
    /// 分离鼓点主体、人声主体和高频瞬态
    fn split(&mut self, sample: f32) -> [f32; 3] {
        let (low, upper) = self.bass.split(sample);
        let (mid, high) = self.presence.split(upper);
        let (phase_low, phase_high) = self.phase.split(low);
        [phase_low + phase_high, mid, high]
    }
}
/// 同一核心供原生输出与浏览器 AudioWorklet 使用，旧模式参数只保留 ABI 兼容
pub struct Dynamics {
    config: Config,
    configured: bool,
    channels: usize,
    split: Vec<Splitter>,
    bands: [Envelope; 3],
    frame: [[f32; MAX_CHANNELS]; 4],
    delay: Vec<f32>,
    delay_at: usize,
    gains: [f32; 3],
    thresholds: [f32; 3],
    ratios: [f32; 3],
    weights: [f32; 3],
    release: [f32; 3],
    detector_release: [f32; 3],
    attack: f32,
    wet_step: f32,
    transient_energy: f32,
    energy_release: f32,
    transient_gain: f32,
    transient_strength: f32,
    limiter_gain: f32,
    wet: f32,
    ceiling: f32,
    target_ceiling: f32,
    reduction: f32,
}
impl Dynamics {
    /// 控制线程预分配干声与三频段预读状态，实时回调不分配内存
    pub fn new(rate: f32, channels: usize) -> Self {
        let rate = if rate.is_finite() {
            rate.clamp(8000.0, 384000.0)
        } else {
            48000.0
        };
        let channels = channels.clamp(1, MAX_CHANNELS);
        let mut result = Self {
            config: Config::default(),
            configured: false,
            channels,
            split: (0..channels).map(|_| Splitter::new(rate)).collect(),
            bands: [Envelope { level: 0.0 }; 3],
            frame: [[0.0; MAX_CHANNELS]; 4],
            delay: vec![0.0; ((rate * 0.005).ceil() as usize).max(1) * channels * 4],
            delay_at: 0,
            gains: [1.0; 3],
            thresholds: [0.0; 3],
            ratios: [1.0; 3],
            weights: [1.0; 3],
            release: [
                (-1.0 / (rate * 0.24)).exp(),
                (-1.0 / (rate * 0.12)).exp(),
                (-1.0 / (rate * 0.18)).exp(),
            ],
            detector_release: [
                (-1.0 / (rate * 0.12)).exp(),
                (-1.0 / (rate * 0.06)).exp(),
                (-1.0 / (rate * 0.08)).exp(),
            ],
            attack: (-1.0 / (rate * 0.00015)).exp(),
            wet_step: 1.0 - (-1.0 / (rate * 0.005)).exp(),
            transient_energy: 0.0,
            energy_release: (-1.0 / (rate * 0.035)).exp(),
            transient_gain: 1.0,
            transient_strength: 0.0,
            limiter_gain: 1.0,
            wet: 1.0,
            ceiling: 1.0,
            target_ceiling: 1.0,
            reduction: 0.0,
        };
        result.configure(Config::default());
        // 首次外部配置仍可直接选择旁路，不让独立引擎启动产生渐变
        result.configured = false;
        result
    }
    /// 只保留动态曲线，最高强度增加低频衰减、瞬态压制与独立安全上限
    pub fn configure(&mut self, mut config: Config) -> bool {
        if !config.valid() {
            return false;
        }
        config.dynamic = true;
        let s = config.strength / 100.0;
        let aggressive = s.powi(3);
        self.thresholds = [-16.0 - 22.0 * s, -12.0 - 18.0 * s, -16.0 - 24.0 * s];
        self.ratios = [1.0 + 23.0 * s * s, 1.0 + 5.0 * s * s, 1.0 + 17.0 * s * s];
        self.weights = [
            10.0_f32.powf(-24.0 * aggressive / 20.0),
            1.0,
            10.0_f32.powf(-10.0 * aggressive / 20.0),
        ];
        self.transient_strength = s * s;
        self.target_ceiling = 10.0_f32.powf(config.ceiling_db.min(-36.0 * aggressive) / 20.0);
        if !self.configured {
            self.wet = if config.enabled { 1.0 } else { 0.0 };
            self.ceiling = self.target_ceiling;
            self.configured = true;
        }
        self.config = config;
        true
    }
    /// 对预读的原始频段施加当前增益，避免鼓点起音在检测跟上前漏出
    pub fn process_frame(&mut self, frame: &mut [f32]) {
        if frame.len() != self.channels {
            frame.fill(0.0);
            return;
        }
        let desired = if self.config.enabled { 1.0 } else { 0.0 };
        self.wet += (desired - self.wet) * self.wet_step;
        self.ceiling = if self.target_ceiling < self.ceiling {
            self.target_ceiling
        } else {
            self.ceiling + (self.target_ceiling - self.ceiling) * self.wet_step
        };
        let mut peaks = [0.0_f32; 3];
        let mut full_peak = 0.0_f32;
        for (ch, sample) in frame.iter_mut().enumerate() {
            if !sample.is_finite() {
                *sample = 0.0;
            }
            *sample = sample.clamp(-32.0, 32.0);
            self.frame[0][ch] = *sample;
            full_peak = full_peak.max(sample.abs());
            let bands = self.split[ch].split(*sample);
            for band in 0..3 {
                self.frame[band + 1][ch] = bands[band];
                peaks[band] = peaks[band].max(bands[band].abs());
            }
        }
        self.transient_energy = self.energy_release * self.transient_energy
            + (1.0 - self.energy_release) * full_peak * full_peak;
        let crest = 20.0 * ((full_peak + 1.0e-9) / (self.transient_energy.sqrt() + 1.0e-9)).log10();
        let transient =
            10.0_f32.powf(-((crest - 6.0).clamp(0.0, 18.0) * self.transient_strength) / 20.0);
        let coefficient = if transient < self.transient_gain {
            self.attack
        } else {
            self.release[0]
        };
        self.transient_gain = transient + coefficient * (self.transient_gain - transient);
        for band in 0..3 {
            let wanted = self.bands[band].gain(
                peaks[band],
                self.detector_release[band],
                self.thresholds[band],
                self.ratios[band],
            ) * self.weights[band];
            let coefficient = if wanted < self.gains[band] {
                self.attack
            } else {
                self.release[band]
            };
            self.gains[band] = wanted + coefficient * (self.gains[band] - wanted);
        }
        let width = self.channels * 4;
        let mut output_peak = 0.0_f32;
        for (ch, sample) in frame.iter_mut().enumerate() {
            let dry = self.delay[self.delay_at + ch];
            let mut processed = 0.0;
            for band in 0..3 {
                processed +=
                    self.delay[self.delay_at + (band + 1) * self.channels + ch] * self.gains[band];
            }
            processed *= self.transient_gain;
            *sample = dry + (processed - dry) * self.wet;
            output_peak = output_peak.max(sample.abs());
            for band in 0..4 {
                self.delay[self.delay_at + band * self.channels + ch] = self.frame[band][ch];
            }
        }
        let limited = if output_peak > self.ceiling {
            self.ceiling / output_peak
        } else {
            1.0
        };
        self.limiter_gain = if limited < self.limiter_gain {
            limited
        } else {
            (1.0 - (1.0 - self.limiter_gain) * self.release[0]).min(limited)
        };
        let gain = 1.0 - self.wet + self.limiter_gain * self.wet;
        for (ch, sample) in frame.iter_mut().enumerate() {
            if self.bypassed() {
                *sample = self.frame[0][ch];
                continue;
            }
            let ceiling = self.ceiling + (1.0 - self.wet) * (1.0 - self.ceiling);
            *sample = (*sample * gain).clamp(-ceiling, ceiling);
            if !sample.is_finite() {
                *sample = 0.0;
            }
        }
        self.delay_at += width;
        if self.delay_at == self.delay.len() {
            self.delay_at = 0;
        }
        let band_gain = self.gains.into_iter().fold(1.0_f32, f32::min) * self.transient_gain;
        let combined = gain * (1.0 - self.wet + self.wet * band_gain);
        self.reduction = (-20.0 * combined.max(1.0e-6).log10()).clamp(0.0, 60.0);
    }
    /// 显式禁用并完成渐变后使用原始直通
    pub fn bypassed(&self) -> bool {
        !self.config.enabled && self.wet < 0.0001
    }
    /// 当前输出保护衰减，仅供低频诊断读取
    pub fn reduction_db(&self) -> f32 {
        self.reduction
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    pub struct Instance {
        dsp: Dynamics,
        input: [f32; BLOCK * MAX_CHANNELS],
    }
    /// 创建独立工作节点状态，返回不透明句柄
    #[no_mangle]
    pub extern "C" fn noise_new(rate: f32, channels: u32) -> *mut Instance {
        Box::into_raw(Box::new(Instance {
            dsp: Dynamics::new(rate, channels as usize),
            input: [0.0; BLOCK * MAX_CHANNELS],
        }))
    }
    /// 取得固定大小交错缓冲指针
    #[no_mangle]
    pub unsafe extern "C" fn noise_input(p: *mut Instance) -> *mut f32 {
        (*p).input.as_mut_ptr()
    }
    /// 在块边界应用参数
    #[no_mangle]
    pub unsafe extern "C" fn noise_configure(
        p: *mut Instance,
        enabled: u32,
        dynamic: u32,
        strength: f32,
        ceiling: f32,
    ) -> u32 {
        (*p).dsp.configure(Config {
            enabled: enabled != 0,
            dynamic: dynamic != 0,
            strength,
            ceiling_db: ceiling,
        }) as u32
    }
    /// 原地处理不超过一个 AudioWorklet 块的帧
    #[no_mangle]
    pub unsafe extern "C" fn noise_process(p: *mut Instance, frames: u32) {
        let instance = &mut *p;
        let channels = instance.dsp.channels;
        for frame in
            instance.input[..(frames as usize).min(BLOCK) * channels].chunks_exact_mut(channels)
        {
            instance.dsp.process_frame(frame);
        }
    }
    /// 读取最近衰减
    #[no_mangle]
    pub unsafe extern "C" fn noise_reduction(p: *mut Instance) -> f32 {
        (*p).dsp.reduction_db()
    }
    /// 释放文档对应实例
    #[no_mangle]
    pub unsafe extern "C" fn noise_free(p: *mut Instance) {
        drop(Box::from_raw(p));
    }
}
#[cfg(test)]
mod tests;
