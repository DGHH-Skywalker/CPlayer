use super::*;
/// 用相同输入比较不同抑制强度，忽略启动延迟
fn render(config: Config, frequency: f32) -> Vec<f32> {
    let mut dsp = Dynamics::new(48000.0, 2);
    assert!(dsp.configure(config));
    let mut out = Vec::new();
    for i in 0..48000 {
        let sample = (i as f32 * 2.0 * std::f32::consts::PI * frequency / 48000.0).sin() * 0.9;
        let mut frame = [sample, sample * 0.5];
        dsp.process_frame(&mut frame);
        out.extend_from_slice(&frame);
    }
    out
}
#[test]
fn silence_and_invalid_samples_stay_finite() {
    let mut d = Dynamics::new(48000.0, 2);
    for _ in 0..1000 {
        let mut f = [f32::NAN, f32::INFINITY];
        d.process_frame(&mut f);
        assert_eq!(f, [0.0, 0.0]);
    }
}
#[test]
fn ceiling_holds_for_impulses_and_mixed_peaks() {
    let mut d = Dynamics::new(44100.0, 2);
    let max = 10.0_f32.powf(-12.0 / 20.0);
    for i in 0..10000 {
        let mut f = [if i % 173 == 0 { 10.0 } else { 0.4 }, -0.7];
        d.process_frame(&mut f);
        assert!(f.iter().all(|v| v.is_finite() && v.abs() <= max + 1e-6));
    }
}
#[test]
fn stronger_reduces_low_and_high_bursts() {
    for hz in [80.0, 6000.0] {
        let weak = render(
            Config {
                strength: 0.0,
                ..Config::default()
            },
            hz,
        );
        let strong = render(
            Config {
                strength: 100.0,
                ..Config::default()
            },
            hz,
        );
        let energy = |a: &Vec<f32>| a[10000..].iter().map(|v| v * v).sum::<f32>();
        assert!(energy(&strong) < energy(&weak));
    }
}
#[test]
fn explicit_bypass_preserves_signal_after_ramp() {
    let a = render(
        Config {
            enabled: false,
            ..Config::default()
        },
        1000.0,
    );
    let i = 40000;
    let original = ((i / 2) as f32 * 2.0 * std::f32::consts::PI * 1000.0 / 48000.0).sin() * 0.9;
    assert!((a[i] - original).abs() < 1e-4);
}
#[test]
fn rejects_bad_config_and_preserves_last_valid() {
    let mut d = Dynamics::new(48000.0, 2);
    assert!(!d.configure(Config {
        strength: f32::NAN,
        ..Config::default()
    }));
    assert!(!d.configure(Config {
        ceiling_db: 0.0,
        ..Config::default()
    }));
    assert_eq!(d.config.ceiling_db, -12.0);
}
#[test]
fn supports_sample_rates_channels_and_mode_switch() {
    for rate in [8000.0, 44100.0, 48000.0, 96000.0, 192000.0] {
        for channels in [1, 2, 6, 8, 32] {
            let mut d = Dynamics::new(rate, channels);
            let mut f = vec![0.9; channels];
            for i in 0..2000 {
                if i == 500 {
                    d.configure(Config {
                        dynamic: false,
                        strength: 80.0,
                        ..Config::default()
                    });
                }
                f.fill(0.9);
                d.process_frame(&mut f);
                assert!(f.iter().all(|v| v.is_finite() && v.abs() <= 0.25119));
            }
        }
    }
}

/// 在短暂静音后制造鼓点或尖锐突发，保留完整预读尾部用于能量测量
fn burst(strength: f32, frequency: f32, duration: f32) -> Vec<f32> {
    let mut dsp = Dynamics::new(48000.0, 2);
    dsp.configure(Config {
        strength,
        ..Config::default()
    });
    (0..24000)
        .map(|i| {
            let t = (i as f32 - 4800.0) / 48000.0;
            let sample = if t >= 0.0 && t < duration {
                let envelope = (1.0 - t / duration).powi(2);
                0.9 * envelope * (t * 2.0 * std::f32::consts::PI * frequency).sin()
            } else {
                0.0
            };
            let mut frame = [sample, sample * 0.5];
            dsp.process_frame(&mut frame);
            assert!((frame[0] * 0.5 - frame[1]).abs() < 1.0e-6, "声道联动失效");
            frame[0]
        })
        .collect()
}

/// 输出峰值与总能量用于衡量起音和整段鼓点，不以波形被削顶代替抑制效果
fn metrics(samples: &[f32]) -> (f32, f32) {
    (
        samples.iter().fold(0.0_f32, |peak, v| peak.max(v.abs())),
        (samples.iter().map(|v| v * v).sum::<f32>() / samples.len() as f32).sqrt(),
    )
}

#[test]
fn maximum_strength_reduces_entire_kick_and_initial_attack() {
    for hz in [50.0, 80.0, 120.0] {
        let weak = metrics(&burst(0.0, hz, 0.12));
        let medium = metrics(&burst(50.0, hz, 0.12));
        let maximum = metrics(&burst(100.0, hz, 0.12));
        println!("kick {hz}Hz weak={weak:?} medium={medium:?} maximum={maximum:?}");
        assert!(maximum.0 < 0.012, "鼓点起音过强：{maximum:?}");
        assert!(
            maximum.1 < medium.1 * 0.2,
            "鼓点整段能量压制不足：{medium:?} -> {maximum:?}"
        );
        assert!(maximum.1 < weak.1 * 0.03, "最大强度低频残留过大");
    }
}

#[test]
fn burst_energy_decreases_across_slider_and_keeps_nonzero_output() {
    for hz in [80.0, 900.0, 6000.0] {
        let mut previous = f32::MAX;
        for strength in [0.0, 25.0, 50.0, 75.0, 100.0] {
            let (peak, rms) = metrics(&burst(strength, hz, 0.08));
            assert!(
                rms > 1.0e-6 && rms < previous,
                "{hz}Hz 强度 {strength} 未递减：{previous} -> {rms}"
            );
            assert!(
                peak <= 10.0_f32.powf((-12.0_f32).min(-36.0 * (strength / 100.0).powi(3)) / 20.0)
                    + 1.0e-6
            );
            previous = rms;
        }
    }
}

#[test]
fn legacy_mode_cannot_bypass_aggressive_dynamics() {
    let dynamic = render(
        Config {
            strength: 100.0,
            ..Config::default()
        },
        80.0,
    );
    let legacy = render(
        Config {
            dynamic: false,
            strength: 100.0,
            ..Config::default()
        },
        80.0,
    );
    assert_eq!(dynamic, legacy);
}

#[test]
fn maximum_strength_is_safe_immediately_after_live_change() {
    let mut d = Dynamics::new(48000.0, 2);
    d.configure(Config {
        strength: 0.0,
        ..Config::default()
    });
    for _ in 0..4800 {
        d.process_frame(&mut [0.9, -0.9]);
    }
    d.configure(Config {
        strength: 100.0,
        ..Config::default()
    });
    for _ in 0..24000 {
        let mut frame = [0.9, -0.9];
        d.process_frame(&mut frame);
        assert!(frame
            .iter()
            .all(|v| v.is_finite() && v.abs() <= 10.0_f32.powf(-36.0 / 20.0) + 1.0e-6));
    }
}
