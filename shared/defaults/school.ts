import type { BilibiliConfig, SchoolConfig } from "../types/school";

export const defaultSchoolConfig: SchoolConfig = {
  enabled: false,
  autoPlay: true,
  periods: [],
  specialDates: [],
  disabledDates: [],
};

export const defaultBilibiliConfig: BilibiliConfig = {
  enabled: true,
  coreEnabled: true,
  noLoginEnabled: false,
  mvMuted: true,
  pauseMusicOnMv: true,
  allowSimultaneousPlayback: false,
};
