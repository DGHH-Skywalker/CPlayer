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
