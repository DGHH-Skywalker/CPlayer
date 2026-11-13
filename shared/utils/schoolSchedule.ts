import type {
  SchoolBreakPeriod,
  SchoolConfig,
  SchoolPhase,
  SchoolScheduleDocument,
} from "../types/school";

export const SCHOOL_TIME_ZONE = "Asia/Shanghai";
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface SchoolEvaluation {
  phase: Exclude<SchoolPhase, "TRANSITIONING">;
  activePeriod: SchoolBreakPeriod | null;
  nextTransitionAt: number | null;
}

interface AbsolutePeriod {
  period: SchoolBreakPeriod;
  startAt: number;
  endAt: number;
}

const zonedParts = (timestamp: number): ZonedParts => {
  const values: Record<string, number> = {};
  for (const part of dateFormatter.formatToParts(timestamp)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values as unknown as ZonedParts;
};

export const schoolDateKey = (timestamp: number): string => {
  const parts = zonedParts(timestamp);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
};

export const shiftSchoolDate = (date: string, days: number): string => {
  const shifted = new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
};

export const schoolTimeToUtc = (date: string, time: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const actual = zonedParts(guess);
  const represented = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
    0,
  );
  return guess - (represented - guess);
};

const validDate = (date: string): boolean => {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const validatePeriod = (period: SchoolBreakPeriod): string | null => {
  if (!period.id || typeof period.id !== "string") return "课间缺少稳定 ID";
  if (!TIME_PATTERN.test(period.start) || !TIME_PATTERN.test(period.end)) {
    return `${period.name || period.id} 的时间必须使用 HH:mm`;
  }
  if (period.start === period.end) return `${period.name || period.id} 不能是零时长或全天`;
  if (
    !Array.isArray(period.days) ||
    period.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(period.days).size !== period.days.length
  ) {
    return `${period.name || period.id} 的星期设置无效`;
  }
  return null;
};

const absoluteLength = (period: SchoolBreakPeriod): number => {
  const start = Number(period.start.slice(0, 2)) * 60 + Number(period.start.slice(3));
  let end = Number(period.end.slice(0, 2)) * 60 + Number(period.end.slice(3));
  if (end <= start) end += 1440;
  return end - start;
};

const assertNoOverlap = (
  entries: Array<{ id: string; name: string; start: number; end: number }>,
): void => {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  for (let index = 0; index < sorted.length; index += 1) {
    for (let other = index + 1; other < sorted.length; other += 1) {
      const left = sorted[index];
      const right = sorted[other];
      if (right.start >= left.end) break;
      if (left.id !== right.id && right.start < left.end && left.start < right.end) {
        throw new Error(`课间时间重叠：${left.name || left.id}、${right.name || right.id}`);
      }
    }
  }
};

/** 校验配置；跨午夜时间段会与次日时间段一起检查。 */
export const validateSchoolConfig = (config: SchoolConfig): void => {
  if (!config || !Array.isArray(config.periods)) throw new Error("校园配置格式无效");
  const ids = new Set<string>();
  const weekly: Array<{ id: string; name: string; start: number; end: number }> = [];
  for (const period of config.periods) {
    const error = validatePeriod(period);
    if (error) throw new Error(error);
    if (ids.has(period.id)) throw new Error(`课间 ID 重复：${period.id}`);
    ids.add(period.id);
    if (period.days.length === 0) throw new Error(`${period.name || period.id} 未选择星期`);
    const minute = Number(period.start.slice(0, 2)) * 60 + Number(period.start.slice(3));
    for (const day of period.days) {
      const start = day * 1440 + minute;
      weekly.push({ ...period, start, end: start + absoluteLength(period) });
    }
  }
  assertNoOverlap(weekly);

  const specialDates = new Set<string>();
  for (const special of config.specialDates) {
    if (!validDate(special.date)) throw new Error(`特殊日期无效：${special.date}`);
    if (specialDates.has(special.date)) throw new Error(`特殊日期重复：${special.date}`);
    specialDates.add(special.date);
    const entries: Array<{ id: string; name: string; start: number; end: number }> = [];
    for (const period of special.periods) {
      const error = validatePeriod(period);
      if (error) throw new Error(error);
      if (ids.has(period.id)) throw new Error(`课间 ID 重复：${period.id}`);
      ids.add(period.id);
      const start = Number(period.start.slice(0, 2)) * 60 + Number(period.start.slice(3));
      entries.push({ ...period, start, end: start + absoluteLength(period) });
      const nextStart = start + 1440;
      entries.push({ ...period, start: nextStart, end: nextStart + absoluteLength(period) });
    }
    assertNoOverlap(entries);
  }
  const disabledDates = new Set<string>();
  for (const date of config.disabledDates) {
    if (!validDate(date)) throw new Error(`停用日期无效：${date}`);
    if (disabledDates.has(date)) throw new Error(`停用日期重复：${date}`);
    disabledDates.add(date);
  }
};

const periodsForDate = (config: SchoolConfig, date: string): SchoolBreakPeriod[] => {
  if (config.disabledDates.includes(date)) return [];
  const special = config.specialDates.find((item) => item.date === date);
  if (special) return special.periods;
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return config.periods.filter((period) => period.days.includes(day));
};

const absolutePeriod = (date: string, period: SchoolBreakPeriod): AbsolutePeriod => {
  const startAt = schoolTimeToUtc(date, period.start);
  let endAt = schoolTimeToUtc(date, period.end);
  if (endAt <= startAt) endAt += DAY_MS;
  return { period, startAt, endAt };
};

/** 按绝对时间计算课间，支持跨午夜、特殊日期和停用日期。 */
export const evaluateSchoolSchedule = (config: SchoolConfig, now: number): SchoolEvaluation => {
  if (!config.enabled) return { phase: "DISABLED", activePeriod: null, nextTransitionAt: null };
  validateSchoolConfig(config);
  const date = schoolDateKey(now);
  const candidates: AbsolutePeriod[] = [];
  for (let offset = -1; offset <= 8; offset += 1) {
    const currentDate = shiftSchoolDate(date, offset);
    for (const period of periodsForDate(config, currentDate)) {
      candidates.push(absolutePeriod(currentDate, period));
    }
  }
  const active = candidates.find((item) => now >= item.startAt && now < item.endAt);
  const boundaries = candidates
    .flatMap((item) => [item.startAt, item.endAt])
    .filter((timestamp) => timestamp > now);
  return {
    phase: active ? "BREAK" : "CLASS",
    activePeriod: active?.period ?? null,
    nextTransitionAt: boundaries.length ? Math.min(...boundaries) : null,
  };
};

export const createSchoolScheduleDocument = (config: SchoolConfig): SchoolScheduleDocument => {
  validateSchoolConfig(config);
  return { version: 1, timeZone: SCHOOL_TIME_ZONE, config };
};

export const parseSchoolScheduleDocument = (source: string): SchoolConfig => {
  const document = JSON.parse(source) as SchoolScheduleDocument;
  if (document.version !== 1 || document.timeZone !== SCHOOL_TIME_ZONE || !document.config) {
    throw new Error("不支持的校园时间表文件");
  }
  validateSchoolConfig(document.config);
  return document.config;
};
