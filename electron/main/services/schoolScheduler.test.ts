import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { schoolTimeToUtc } from "@shared/utils/schoolSchedule";
import type { SchoolConfig, SchoolState } from "@shared/types/school";
import { SchoolScheduler } from "./schoolScheduler";

const schedule = (): SchoolConfig => ({
  enabled: true,
  autoPlay: true,
  periods: [
    {
      id: "morning",
      name: "上午课间",
      days: [1],
      start: "09:40",
      end: "09:50",
    },
  ],
  specialDates: [],
  disabledDates: [],
});

describe("SchoolScheduler", () => {
  it("进入上课先锁定并等待有效清空", async () => {
    let now = schoolTimeToUtc("2026-11-16", "09:49");
    const states: SchoolState[] = [];
    const enforced: number[] = [];
    const scheduler = new SchoolScheduler({
      getConfig: schedule,
      now: () => now,
      timers: false,
      onState: (state) => states.push(state),
      enforceClass: async (generation) => {
        enforced.push(generation);
      },
    });
    await scheduler.init();
    assert.equal(scheduler.getState().phase, "BREAK");
    now = schoolTimeToUtc("2026-11-16", "09:50");
    await scheduler.reconcile();
    assert.equal(scheduler.getState().phase, "CLASS");
    assert.equal(enforced.length, 1);
    assert.ok(scheduler.getState().cleanupVerifiedAt);
    assert.ok(states.some((state) => state.phase === "CLASS" && state.cleanupVerifiedAt === null));
  });

  it("清理失败保持上课状态且不写验证时间", async () => {
    const scheduler = new SchoolScheduler({
      getConfig: schedule,
      now: () => schoolTimeToUtc("2026-11-16", "09:50"),
      timers: false,
      onState: () => {},
      enforceClass: async () => {
        throw new Error("storage failed");
      },
      onError: () => {},
    });
    await scheduler.init();
    assert.equal(scheduler.getState().phase, "CLASS");
    assert.equal(scheduler.getState().cleanupVerifiedAt, null);
  });

  it("提前结束课间后持续锁定到原定边界", async () => {
    let now = schoolTimeToUtc("2026-11-16", "09:45");
    const scheduler = new SchoolScheduler({
      getConfig: schedule,
      now: () => now,
      timers: false,
      onState: () => {},
      enforceClass: async () => {},
    });
    await scheduler.init();
    await scheduler.forceEndBreak();
    assert.equal(scheduler.getState().phase, "CLASS");
    now = schoolTimeToUtc("2026-11-16", "09:49");
    await scheduler.reconcile();
    assert.equal(scheduler.getState().phase, "CLASS");
    now = schoolTimeToUtc("2026-11-16", "09:50");
    await scheduler.reconcile();
    assert.equal(scheduler.getState().phase, "CLASS");
  });
});
