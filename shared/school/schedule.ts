import type { SchoolConfig } from "../types/school";

export const defaultSchoolConfig: SchoolConfig = {
  enabled: false,
  searchHome: true,
  scheduleEnabled: false,
  autoPlayFirstRequest: true,
  breaks: [],
  disabledDates: [],
  specialDates: {},
  bilibili: {
    enabled: true,
    coreEnabled: true,
    noLogin: true,
    retainLogin: true,
    pauseOnClass: true,
    audioPolicy: "pause-music",
  },
};

const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 将上海本地日期转换为 UTC 毫秒
 * @param date - YYYY-MM-DD
 * @returns 当天上海零点
 */
export const dateStart = (date: string): number => Date.parse(`${date}T00:00:00+08:00`);

/**
 * 读取上海日期，不依赖运行机器时区
 * @param now - UTC 毫秒
 * @returns YYYY-MM-DD
 */
export const schoolDate = (now: number): string =>
  new Date(now + OFFSET).toISOString().slice(0, 10);

/**
 * 读取时间对应的分钟数
 * @param time - HH:mm
 * @returns 从零点起的分钟
 */
const minutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * 展开某天实际生效的课间，特殊日期替换每周配置
 * @param config - 学校配置
 * @param date - 开始日期
 * @returns 绝对时间段
 */
export const intervalsOn = (config: SchoolConfig, date: string) => {
  if (config.disabledDates.includes(date)) return [];
  const midnight = dateStart(date);
  const weekday = new Date(midnight + OFFSET).getUTCDay() || 7;
  const special = config.specialDates[date];
  return (special ?? config.breaks)
    .filter((b) => b.enabled && (special !== undefined || b.weekdays.includes(weekday)))
    .map((b) => {
      const start = midnight + minutes(b.startTime) * 60_000;
      let end = midnight + minutes(b.endTime) * 60_000;
      if (end <= start) end += DAY;
      return { ...b, key: `${date}/${b.id}`, start, end };
    });
};

/**
 * 校验导入及 IPC 配置，含相邻日期的跨午夜冲突
 * @param config - 未受信配置
 * @returns 通过校验的配置
 */
export const validateSchoolConfig = (config: SchoolConfig): SchoolConfig => {
  if (!config || typeof config !== "object") throw new Error("校园配置格式错误");
  for (const key of ["enabled", "searchHome", "scheduleEnabled", "autoPlayFirstRequest"] as const) {
    if (typeof config[key] !== "boolean") throw new Error(`无效开关: ${key}`);
  }
  if (
    !Array.isArray(config.breaks) ||
    !Array.isArray(config.disabledDates) ||
    !config.specialDates ||
    Array.isArray(config.specialDates)
  )
    throw new Error("时间表格式错误");
  if (config.breaks.length > 500 || Object.keys(config.specialDates).length > 1000)
    throw new Error("时间表过大");
  const groups = [config.breaks, ...Object.values(config.specialDates)];
  for (const group of groups) {
    if (!Array.isArray(group) || group.length > 500) throw new Error("课间列表无效");
    const ids = new Set<string>();
    for (const b of group) {
      if (!b || typeof b.id !== "string" || !b.id || ids.has(b.id))
        throw new Error("课间 ID 为空或重复");
      ids.add(b.id);
      if (
        typeof b.name !== "string" ||
        b.name.length > 100 ||
        !TIME.test(b.startTime) ||
        !TIME.test(b.endTime) ||
        b.startTime === b.endTime
      )
        throw new Error("请输入有效的课间名称和时间，起止时间不能相同");
      if (
        typeof b.enabled !== "boolean" ||
        typeof b.autoPlayFirstRequest !== "boolean" ||
        !Array.isArray(b.weekdays) ||
        b.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
      )
        throw new Error("课间星期或开关无效");
    }
  }
  const dates = [...config.disabledDates, ...Object.keys(config.specialDates)];
  if (
    dates.some(
      (d) => !DATE.test(d) || !Number.isFinite(dateStart(d)) || schoolDate(dateStart(d)) !== d,
    )
  )
    throw new Error("日期格式无效");
  if (
    !config.bilibili ||
    !["pause-music", "parallel", "muted"].includes(config.bilibili.audioPolicy)
  )
    throw new Error("MV 策略无效");
  for (const key of ["enabled", "coreEnabled", "noLogin", "retainLogin", "pauseOnClass"] as const) {
    if (typeof config.bilibili[key] !== "boolean") throw new Error("浏览器开关无效");
  }
  // 取完整周及特殊日期前后一天，检测周日到周一和例外覆盖后的冲突
  const starts = new Set(["2026-01-04", ...Object.keys(config.specialDates)]);
  for (const date of starts) {
    const origin = dateStart(date);
    const windows = Array.from({ length: 10 }, (_, i) => schoolDate(origin + (i - 1) * DAY))
      .flatMap((d) => intervalsOn(config, d))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].start < windows[i - 1].end)
        throw new Error(`课间重叠: ${windows[i - 1].name} / ${windows[i].name}`);
    }
  }
  return config;
};

/**
 * 按绝对时间查找当前课间和未来边界
 * @param config - 学校配置
 * @param now - UTC 毫秒
 * @returns 当前课间和最近边界
 */
export const resolveSchedule = (config: SchoolConfig, now: number) => {
  const midnight = dateStart(schoolDate(now));
  const all = Array.from({ length: 370 }, (_, i) => schoolDate(midnight + (i - 1) * DAY))
    .flatMap((d) => intervalsOn(config, d))
    .sort((a, b) => a.start - b.start);
  const active = all.find((b) => b.start <= now && now < b.end) ?? null;
  const future = all.find((b) => b.start > now) ?? null;
  return {
    active,
    nextStartAt: future?.start ?? null,
    nextEndAt: active?.end ?? future?.end ?? null,
  };
};
