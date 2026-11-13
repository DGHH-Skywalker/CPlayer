import { describe, expect, it, vi } from "vitest";
import { MvAudioCoordinator } from "./mvAudioCoordinator";

/** 创建可控音乐和课间状态 */
const setup = () => {
  const state = { playing: true, paused: false, version: 0, generation: 1, allowed: true };
  const resume = vi.fn(async () => {
    state.playing = true;
  });
  const mute = vi.fn();
  const coordinator = new MvAudioCoordinator({
    isPlaying: () => state.playing,
    isPaused: () => state.paused,
    pause: () => {
      state.playing = false;
      state.paused = true;
      state.version++;
    },
    resume,
    mute,
    version: () => state.version,
    generation: () => state.generation,
    allowed: () => state.allowed,
  });
  return { state, coordinator, resume, mute };
};
describe("MV 自动恢复所有权", () => {
  it("本次 MV 暂停的音乐可以恢复", async () => {
    const s = setup();
    await s.coordinator.update(true, "pause-music");
    await s.coordinator.update(false, "pause-music");
    expect(s.resume).toHaveBeenCalledOnce();
  });
  it("手动暂停后不自动恢复", async () => {
    const s = setup();
    await s.coordinator.update(true, "pause-music");
    s.state.version++;
    await s.coordinator.update(false, "pause-music");
    expect(s.resume).not.toHaveBeenCalled();
  });
  it("上课锁定、代次变化和浏览器销毁均作废恢复", async () => {
    for (const mode of ["gate", "generation", "destroy"]) {
      const s = setup();
      await s.coordinator.update(true, "pause-music");
      if (mode === "gate") s.state.allowed = false;
      if (mode === "generation") s.state.generation++;
      if (mode === "destroy") s.coordinator.invalidate();
      await s.coordinator.update(false, "pause-music");
      expect(s.resume).not.toHaveBeenCalled();
    }
  });
  it("用户原本暂停的音乐不归 MV 恢复", async () => {
    const s = setup();
    s.state.playing = false;
    s.state.paused = true;
    await s.coordinator.update(true, "pause-music");
    await s.coordinator.update(false, "pause-music");
    expect(s.resume).not.toHaveBeenCalled();
  });
  it("并行与静音策略不暂停或恢复音乐", async () => {
    for (const policy of ["parallel", "muted"] as const) {
      const s = setup();
      await s.coordinator.update(true, policy);
      await s.coordinator.update(false, policy);
      expect(s.state.playing).toBe(true);
      expect(s.resume).not.toHaveBeenCalled();
      expect(s.mute).toHaveBeenLastCalledWith(policy === "muted");
    }
  });
});
