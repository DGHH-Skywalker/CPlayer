import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolScheduler } from "./schoolScheduler";
import {
  defaultSchoolConfig,
  validateSchoolConfig,
  resolveSchedule,
} from "@shared/school/schedule";
import type { SchoolConfig } from "@shared/types/school";

/** 创建上海学校日期的可控测试时间 */
const at = (value: string): number => Date.parse(`${value}+08:00`);
/** 创建没有虚构默认作息的测试配置 */
const config = (): SchoolConfig => ({
  ...structuredClone(defaultSchoolConfig),
  enabled: true,
  scheduleEnabled: true,
  breaks: [
    {
      id: "a",
      name: "测试课间",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startTime: "09:40",
      endTime: "10:00",
      enabled: true,
      autoPlayFirstRequest: true,
    },
  ],
});
let scheduler: SchoolScheduler;
const stop = vi.fn();
/** 启动并确认启动清理，模拟可靠落盘确认 */
const start = (c = config()): SchoolScheduler => {
  scheduler = new SchoolScheduler(c, { now: Date.now, stop, persist: vi.fn(), publish: vi.fn() });
  const pending = scheduler.get().pendingClear;
  if (pending) scheduler.acknowledge(pending);
  scheduler.start();
  return scheduler;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-11-13T09:50:00"));
  stop.mockClear();
});
afterEach(() => {
  scheduler?.dispose();
  vi.useRealTimers();
});

describe("校园绝对时间调度与停止屏障", () => {
  it("课间中途启动先清理再允许点歌", () => {
    scheduler = new SchoolScheduler(config(), {
      now: Date.now,
      stop,
      publish: vi.fn(),
      persist: vi.fn(),
    });
    expect(scheduler.allowsPlayback()).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
    scheduler.acknowledge(scheduler.get().pendingClear!);
    expect(scheduler.get().phase).toBe("BREAK");
  });
  it("精确上课边界先锁定并硬停止，不等待前端", () => {
    start();
    stop.mockClear();
    vi.advanceTimersByTime(10 * 60_000);
    expect(scheduler.get().phase).toBe("CLASS");
    expect(scheduler.allowsPlayback()).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
    const id = scheduler.get().pendingClear!;
    scheduler.acknowledge(id);
    scheduler.acknowledge(id);
    scheduler.tick();
    expect(stop).toHaveBeenCalledOnce();
    expect(scheduler.get().lastCleared).toBe(id);
  });
  it("睡眠越过课间并进入下一课间仍先清理旧任务", () => {
    const c = config();
    c.breaks.push({ ...c.breaks[0], id: "b", startTime: "10:40", endTime: "11:00" });
    start(c);
    stop.mockClear();
    vi.setSystemTime(at("2026-11-13T10:50:00"));
    scheduler.tick();
    expect(stop).toHaveBeenCalledOnce();
    expect(scheduler.allowsPlayback()).toBe(false);
    scheduler.acknowledge(scheduler.get().pendingClear!);
    expect(scheduler.get().phase).toBe("BREAK");
  });
  it("上课启动、空表、停用日期均锁定", () => {
    vi.setSystemTime(at("2026-11-13T10:00:00"));
    start();
    expect(scheduler.allowsPlayback()).toBe(false);
    const c = config();
    c.breaks = [];
    scheduler.configure(c);
    expect(scheduler.allowsPlayback()).toBe(false);
    c.breaks = config().breaks;
    c.disabledDates = ["2026-11-13"];
    vi.setSystemTime(at("2026-11-13T09:50:00"));
    scheduler.configure(c);
    expect(scheduler.allowsPlayback()).toBe(false);
  });
  it("关闭调度恢复普通播放，手动结束不可在同课间重新开启", () => {
    start();
    scheduler.endBreak();
    const pending = scheduler.get().pendingClear!;
    scheduler.acknowledge(pending);
    expect(scheduler.allowsPlayback()).toBe(false);
    const c = config();
    c.scheduleEnabled = false;
    scheduler.configure(c);
    expect(scheduler.allowsPlayback()).toBe(true);
  });
  it("修改时间立即生效且旧确认无法解除新的清理锁", () => {
    start();
    const c = config();
    c.breaks[0].endTime = "09:49";
    scheduler.configure(c);
    const first = scheduler.get().pendingClear!;
    scheduler.endBreak();
    const second = scheduler.get().pendingClear!;
    expect(first).not.toBe(second);
    scheduler.acknowledge(first);
    expect(scheduler.get().pendingClear).toBe(second);
  });
  it("时钟前跳无需等补偿定时器，播放闸门立即重新计算", () => {
    start();
    vi.setSystemTime(at("2026-11-13T10:01:00"));
    expect(scheduler.allowsPlayback()).toBe(false);
    expect(scheduler.get().pendingClear).not.toBeNull();
  });
  it("启用调度时立即清理正在普通播放的旧会话", () => {
    const c = config();
    c.scheduleEnabled = false;
    start(c);
    stop.mockClear();
    vi.setSystemTime(at("2026-11-13T10:01:00"));
    c.scheduleEnabled = true;
    scheduler.configure(c);
    expect(stop).toHaveBeenCalledOnce();
    expect(scheduler.allowsPlayback()).toBe(false);
    expect(scheduler.get().pendingClear).not.toBeNull();
  });
  it("清理未确认时低频重投同一事件，不重复停止或丢失命令", () => {
    const publish = vi.fn();
    scheduler = new SchoolScheduler(config(), { now: Date.now, stop, publish, persist: vi.fn() });
    scheduler.start();
    const id = scheduler.get().pendingClear;
    publish.mockClear();
    stop.mockClear();
    vi.advanceTimersByTime(15000);
    expect(publish).toHaveBeenCalledOnce();
    expect(scheduler.get().pendingClear).toBe(id);
    expect(stop).not.toHaveBeenCalled();
  });
  it("释放所有计时器", () => {
    start();
    scheduler.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
describe("上海每周、跨午夜和特殊日期", () => {
  it("跨午夜按开始日期星期识别，结束点排除", () => {
    const c = config();
    c.breaks[0] = { ...c.breaks[0], weekdays: [5], startTime: "23:50", endTime: "00:10" };
    expect(resolveSchedule(c, at("2026-11-14T00:05:00")).active?.key).toBe("2026-11-13/a");
    expect(resolveSchedule(c, at("2026-11-14T00:10:00")).active).toBeNull();
  });
  it("特殊日期替换每周表，空特殊表禁用当天", () => {
    const c = config();
    c.specialDates["2026-11-13"] = [];
    expect(resolveSchedule(c, at("2026-11-13T09:50:00")).active).toBeNull();
  });
  it("检测周日跨午夜到周一重叠，允许首尾相接", () => {
    const c = config();
    c.breaks = [
      { ...c.breaks[0], weekdays: [7], startTime: "23:50", endTime: "00:20" },
      { ...c.breaks[0], id: "b", weekdays: [1], startTime: "00:10", endTime: "00:30" },
    ];
    expect(() => validateSchoolConfig(c)).toThrow("重叠");
    c.breaks[1].startTime = "00:20";
    expect(() => validateSchoolConfig(c)).not.toThrow();
  });
  it("临时停用和特殊日期不能掩盖每周作息本身的重叠", () => {
    const c = config();
    c.breaks.push({ ...c.breaks[0], id: "overlap", startTime: "09:50", endTime: "10:10" });
    c.disabledDates = Array.from(
      { length: 10 },
      (_, i) => `2026-01-${String(i + 3).padStart(2, "0")}`,
    );
    expect(() => validateSchoolConfig(c)).toThrow("重叠");
  });
  it("拒绝非法时间、重复 ID、无效日期和未受信 JSON", () => {
    const c = config();
    c.breaks[0].startTime = "24:00";
    expect(() => validateSchoolConfig(c)).toThrow();
    expect(() => validateSchoolConfig({} as SchoolConfig)).toThrow();
    c.breaks = config().breaks;
    c.disabledDates = ["2026-02-30"];
    expect(() => validateSchoolConfig(c)).toThrow();
  });
});
