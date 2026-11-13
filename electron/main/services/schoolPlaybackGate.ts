import type { SchoolPhase } from "@shared/types/school";

let phaseProvider: () => SchoolPhase = () => "TRANSITIONING";
let enabledProvider: () => boolean = () => false;

export const configureSchoolPlaybackGate = (
  getPhase: () => SchoolPhase,
  isEnabled: () => boolean,
): void => {
  phaseProvider = getPhase;
  enabledProvider = isEnabled;
};

export const getSchoolPhase = (): SchoolPhase => phaseProvider();
export const isSchoolModeEnabled = (): boolean => enabledProvider();

/** 上课和状态切换期间拒绝所有恢复播放的入口。 */
export const canStartPlayback = (): boolean => {
  const phase = phaseProvider();
  return phase !== "CLASS" && phase !== "TRANSITIONING";
};

export const canUseSchoolRequest = (): boolean => canStartPlayback();
