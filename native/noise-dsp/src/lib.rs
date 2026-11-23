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
    /// 采用独立起音与释放包络，并用软拐点压缩曲线平滑增益
    fn gain(&mut self, peak: f32, attack: f32, release: f32, threshold: f32, ratio: f32) -> f32 {
        let db = 20.0 * (peak.abs() + 1.0e-9).log10();
        let coefficient = if db >= self.level { attack } else { release };
        self.level = coefficient * self.level + (1.0 - coefficient) * db;
        let over = self.level - threshold;
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
    /// 构建二阶 Butterworth 低通，级联检测与残差重组保持平坦旁路
    fn lowpass(rate: f32, frequency: f32) -> Self {
        let w = 2.0 * std::f32::consts::PI * frequency.min(rate * 0.4) / rate;
        let alpha = w.sin() / std::f32::consts::SQRT_2;
        let a0 = 1.0 + alpha;
        Self {
            b0: (1.0 - w.cos()) / 2.0 / a0,
            b1: (1.0 - w.cos()) / a0,
            b2: (1.0 - w.cos()) / 2.0 / a0,
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
/// 同一核心供原生输出与浏览器 AudioWorklet 使用
pub struct Dynamics {
    config: Config,
    configured: bool,
    rate: f32,
    channels: usize,
    split: Vec<[Biquad; 4]>,
    bands: [Envelope; 3],
    full: Envelope,
    frame: [f32; MAX_CHANNELS],
    low: [f32; MAX_CHANNELS],
    mid: [f32; MAX_CHANNELS],
    high: [f32; MAX_CHANNELS],
    delay: Vec<f32>,
    delay_at: usize,
    limiter_gain: f32,
    wet: f32,
    ceiling: f32,
    attack: [f32; 3],
    release: [f32; 3],
    gain_release: f32,
    reduction: f32,
}
impl Dynamics {
    /// 控制线程预分配全部状态，支持 1 至 32 声道
    pub fn new(rate: f32, channels: usize) -> Self {
        let rate = if rate.is_finite() {
            rate.clamp(8000.0, 384000.0)
        } else {
            48000.0
        };
        let channels = channels.clamp(1, MAX_CHANNELS);
        let split = (0..channels)
            .map(|_| {
                [
                    Biquad::lowpass(rate, 180.0),
                    Biquad::lowpass(rate, 180.0),
                    Biquad::lowpass(rate, 2500.0),
                    Biquad::lowpass(rate, 2500.0),
                ]
            })
            .collect();
        Self {
            config: Config::default(),
            configured: false,
            rate,
            channels,
            split,
            bands: [Envelope { level: -100.0 }; 3],
            full: Envelope { level: -100.0 },
            frame: [0.0; MAX_CHANNELS],
            low: [0.0; MAX_CHANNELS],
            mid: [0.0; MAX_CHANNELS],
            high: [0.0; MAX_CHANNELS],
            delay: vec![0.0; ((rate * 0.005).ceil() as usize).max(1) * channels],
            delay_at: 0,
            limiter_gain: 1.0,
            wet: 1.0,
            ceiling: 10.0_f32.powf(-12.0 / 20.0),
            attack: [
                (-1.0 / (rate * 0.005)).exp(),
                (-1.0 / (rate * 0.01)).exp(),
                (-1.0 / (rate * 0.001)).exp(),
            ],
            release: [
                (-1.0 / (rate * 0.15)).exp(),
                (-1.0 / (rate * 0.2)).exp(),
                (-1.0 / (rate * 0.1)).exp(),
            ],
            gain_release: (-1.0 / (rate * 0.2)).exp(),
            reduction: 0.0,
        }
    }
    /// 应用已校验配置，状态和延迟线保留以避免切换爆音
    pub fn configure(&mut self, config: Config) -> bool {
        if !config.valid() {
            return false;
        }
        if !self.configured {
            self.wet = if config.enabled { 1.0 } else { 0.0 };
            self.ceiling = 10.0_f32.powf(config.ceiling_db / 20.0);
            self.configured = true;
        }
        self.config = config;
        true
    }
    /// 处理完整交错帧，左右声道共享增益以保持声像
    pub fn process_frame(&mut self, frame: &mut [f32]) {
        if frame.len() != self.channels {
            frame.fill(0.0);
            return;
        }
        let s = self.config.strength / 100.0;
        let desired = if self.config.enabled { 1.0 } else { 0.0 };
        self.wet += (desired - self.wet) * (1.0 - (-1.0 / (self.rate * 0.005)).exp());
        let target = 10.0_f32.powf(self.config.ceiling_db / 20.0);
        self.ceiling = if target < self.ceiling {
            target
        } else {
            self.ceiling + (target - self.ceiling) * 0.001
        };
        let mut peaks = [0.0_f32; 3];
        let mut full_peak = 0.0_f32;
        for (ch, sample) in frame.iter_mut().enumerate() {
            if !sample.is_finite() {
                *sample = 0.0;
            }
            *sample = sample.clamp(-32.0, 32.0);
            self.frame[ch] = *sample;
            full_peak = full_peak.max(sample.abs());
            let f = &mut self.split[ch];
            let l = f[0].sample(*sample);
            let low = f[1].sample(l);
            let lower = f[2].sample(*sample);
            let lower = f[3].sample(lower);
            self.low[ch] = low;
            self.mid[ch] = lower - low;
            self.high[ch] = *sample - lower;
            peaks[0] = peaks[0].max(low.abs());
            peaks[1] = peaks[1].max((lower - low).abs());
            peaks[2] = peaks[2].max((*sample - lower).abs());
        }
        let threshold = -12.0 - 18.0 * s;
        let full_gain = self.full.gain(
            full_peak,
            self.attack[0],
            self.release[1],
            threshold,
            1.0 + 7.0 * s,
        );
        let gains = [
            self.bands[0].gain(
                peaks[0],
                self.attack[0],
                self.release[0],
                threshold - 3.0,
                1.0 + 7.0 * s,
            ),
            self.bands[1].gain(
                peaks[1],
                self.attack[1],
                self.release[1],
                threshold,
                1.0 + 2.0 * s,
            ),
            self.bands[2].gain(
                peaks[2],
                self.attack[2],
                self.release[2],
                threshold - 6.0,
                1.0 + 9.0 * s,
            ),
        ];
        let mut peak = 0.0_f32;
        for ch in 0..self.channels {
            let processed = if self.config.dynamic {
                self.low[ch] * gains[0] + self.mid[ch] * gains[1] + self.high[ch] * gains[2]
            } else {
                self.frame[ch] * full_gain
            };
            self.frame[ch] = self.frame[ch] + (processed - self.frame[ch]) * self.wet;
            peak = peak.max(self.frame[ch].abs());
        }
        let limited = if peak > self.ceiling {
            self.ceiling / peak
        } else {
            1.0
        };
        self.limiter_gain = if limited < self.limiter_gain {
            limited
        } else {
            1.0 - (1.0 - self.limiter_gain) * self.gain_release
        };
        let mut actual_gain = 1.0;
        for (ch, sample) in frame.iter_mut().enumerate() {
            let old = self.delay[self.delay_at + ch];
            self.delay[self.delay_at + ch] = self.frame[ch];
            // 完全关闭后使用原始直通；显式开关过渡期间仍保持有界输出
            if self.wet < 0.0001 && !self.config.enabled {
                *sample = self.frame[ch];
                continue;
            }
            let ceiling = if self.config.enabled {
                self.ceiling
            } else {
                self.ceiling + (1.0 - self.wet) * (1.0 - self.ceiling)
            };
            let gain = 1.0 - self.wet + self.limiter_gain * self.wet;
            actual_gain = gain;
            *sample = (old * gain).clamp(-ceiling, ceiling);
            if !sample.is_finite() {
                *sample = 0.0;
            }
        }
        self.delay_at += self.channels;
        if self.delay_at == self.delay.len() {
            self.delay_at = 0;
        }
        let band_gain = if self.config.dynamic {
            gains.into_iter().fold(1.0_f32, f32::min)
        } else {
            full_gain
        };
        let combined = actual_gain * (1.0 - self.wet + self.wet * band_gain);
        self.reduction = (-20.0 * combined.max(1.0e-6).log10()).clamp(0.0, 60.0);
    }
    /// 显式禁用并完成渐变后可使用原始直通
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
