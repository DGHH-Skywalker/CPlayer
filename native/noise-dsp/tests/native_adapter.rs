// SPDX-License-Identifier: MPL-2.0
// 直接编译实际原生适配器，避免需要音频设备或 FFmpeg 才能检查参数打包
#[path = "../../audio-engine/src/dsp/dynamics.rs"]
mod adapter;

#[test]
fn native_snapshot_preserves_ceiling_and_disabled_state() {
    for ceiling in [-30.0_f32, -12.0, -3.0] {
        adapter::configure(true, true, 50.0, ceiling).unwrap();
        let mut output = adapter::OutputDynamics::new(48_000, 2);
        assert!(!output.bypassed());
        for _ in 0..9600 {
            let mut frame = [0.95, -0.9];
            output.process(&mut frame);
            assert!(frame
                .iter()
                .all(|value| value.is_finite()
                    && value.abs() <= 10.0_f32.powf(ceiling / 20.0) + 1.0e-5));
        }
        assert!(adapter::reduction().is_finite());
        assert!(adapter::configure(true, true, f32::NAN, ceiling).is_err());
        output.synchronize();
        assert!(!output.bypassed());
    }
    adapter::configure(false, false, 50.0, -12.0).unwrap();
    assert!(adapter::OutputDynamics::new(48_000, 2).bypassed());
}
