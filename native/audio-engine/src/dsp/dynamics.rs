use carbonv_dsp::{Config, Dynamics};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
static REDUCTION: AtomicU32 = AtomicU32::new(0);
/// 控制线程只读取原子诊断，不访问实时处理器
pub(crate) fn reduction() -> f64 {
    f32::from_bits(REDUCTION.load(Ordering::Relaxed)) as f64
}
// 启动时由主进程恢复插件配置；原生库独立测试默认旁路
static CONFIG: AtomicU64 = AtomicU64::new((5000_u64 << 2) | (1200_u64 << 18));
/// 把完整校验后的参数作为一个原子快照交给输出线程
pub(crate) fn configure(
    enabled: bool,
    dynamic: bool,
    strength: f32,
    ceiling_db: f32,
) -> Result<(), String> {
    let config = Config {
        enabled,
        dynamic,
        strength,
        ceiling_db,
    };
    if !config.valid() {
        return Err("无效的动态处理配置".into());
    }
    let word = (enabled as u64)
        | ((dynamic as u64) << 1)
        | (((strength * 100.0).round() as u64) << 2)
        | (((-ceiling_db * 100.0).round() as u64) << 18);
    CONFIG.store(word, Ordering::Release);
    Ok(())
}
pub(crate) struct OutputDynamics {
    dsp: Dynamics,
    word: u64,
}
impl OutputDynamics {
    /// 在音频流创建线程分配状态，设备格式改变时重新创建
    pub(crate) fn new(rate: u32, channels: u16) -> Self {
        let mut result = Self {
            dsp: Dynamics::new(rate as f32, channels as usize),
            word: u64::MAX,
        };
        result.synchronize();
        result
    }
    /// 每个设备回调只读取一次原子配置
    pub(crate) fn synchronize(&mut self) {
        let word = CONFIG.load(Ordering::Acquire);
        if word != self.word {
            self.word = word;
            self.dsp.configure(Config {
                enabled: word & 1 != 0,
                dynamic: word & 2 != 0,
                strength: ((word >> 2) & 0xffff) as f32 / 100.0,
                ceiling_db: -(((word >> 18) & 0xffff) as f32) / 100.0,
            });
        }
    }
    /// 关闭时保持原有输出精度与时间行为
    pub(crate) fn bypassed(&self) -> bool {
        self.dsp.bypassed()
    }
    /// 处理一帧，不分配、阻塞或调用脚本
    pub(crate) fn process(&mut self, frame: &mut [f32]) {
        self.dsp.process_frame(frame);
        REDUCTION.store(self.dsp.reduction_db().to_bits(), Ordering::Relaxed);
    }
}
