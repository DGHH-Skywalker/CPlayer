import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SchoolBreakPeriod, SchoolConfig } from "../types/school";
import {
  createSchoolScheduleDocument,
  evaluateSchoolSchedule,
  parseSchoolScheduleDocument,
  schoolTimeToUtc,
  validateSchoolConfig,
} from "./schoolSchedule";

const period = (override: Partial<SchoolBreakPeriod> = {}): SchoolBreakPeriod => ({
  id: "break-1",
  name: "课间一",
  days: [1, 2, 3, 4, 5],
  start: "09:40",
  end: "09:50",
  ...override,
});

const config = (override: Partial<SchoolConfig> = {}): SchoolConfig => ({
  enabled: true,
  autoPlay: true,
  periods: [period()],
  specialDates: [],
  disabledDates: [],
  ...override,
});

const at = (date: string, time: string): number => schoolTimeToUtc(date, time);

describe("schoolSchedule", () => {
  it("上课开始和课间结束采用左闭右开边界", () => {
    const value = config();
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "09:39")).phase, "CLASS");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "09:40")).phase, "BREAK");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "09:49")).phase, "BREAK");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "09:50")).phase, "CLASS");
  });

  it("跨午夜课间延续到次日", () => {
    const value = config({
      periods: [period({ start: "22:00", end: "06:00", days: [1] })],
    });
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "23:00")).phase, "BREAK");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-17", "05:59")).phase, "BREAK");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-17", "06:00")).phase, "CLASS");
  });

  it("拒绝同日与跨午夜重叠", () => {
    assert.throws(
      () =>
        validateSchoolConfig(
          config({
            periods: [
              period(),
              period({ id: "break-2", name: "课间二", start: "09:45", end: "09:55" }),
            ],
          }),
        ),
      /重叠/,
    );
    assert.throws(
      () =>
        validateSchoolConfig(
          config({
            periods: [
              period({ start: "23:00", end: "01:00", days: [1] }),
              period({ id: "break-2", start: "00:30", end: "02:00", days: [2] }),
            ],
          }),
        ),
      /重叠/,
    );
  });

  it("特殊日期替代每周表，停用日期无课间", () => {
    const value = config({
      specialDates: [
        {
          date: "2026-11-16",
          periods: [period({ id: "special", days: [], start: "12:00", end: "12:20" })],
        },
      ],
      disabledDates: ["2026-11-17"],
    });
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "09:45")).phase, "CLASS");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-16", "12:10")).phase, "BREAK");
    assert.equal(evaluateSchoolSchedule(value, at("2026-11-17", "09:45")).phase, "CLASS");
  });

  it("停用模式不计算下一边界", () => {
    const evaluation = evaluateSchoolSchedule(config({ enabled: false }), at("2026-11-16", "09:45"));
    assert.equal(evaluation.phase, "DISABLED");
    assert.equal(evaluation.nextTransitionAt, null);
  });

  it("导入导出保留版本和固定时区", () => {
    const document = createSchoolScheduleDocument(config());
    const serialized = JSON.stringify(document);
    assert.deepEqual(parseSchoolScheduleDocument(serialized), document.config);
    assert.throws(() => parseSchoolScheduleDocument('{"version":2}'), /不支持/);
  });

  it("系统时间前后跳变均由绝对时间重算", () => {
    const value = config();
    const duringBreak = at("2026-11-16", "09:45");
    assert.equal(evaluateSchoolSchedule(value, duringBreak + 3 * 86_400_000).phase, "CLASS");
    assert.equal(evaluateSchoolSchedule(value, duringBreak - 3 * 86_400_000).phase, "CLASS");
  });
});
