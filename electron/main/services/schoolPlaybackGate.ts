let check: () => boolean = () => false;

/**
 * 注入主进程调度器，在启动检查完成前默认拒绝播放
 * @param checker - 实时调度权限检查
 */
export const installSchoolGate = (checker: () => boolean): void => {
  check = checker;
};

/** 检查播放权限，始终在原生调用之前执行 */
export const schoolAllowsPlayback = (): boolean => check();

/** 拒绝上课、清理中和初始化前的播放或加载 */
export const assertSchoolPlayback = (): void => {
  if (!check()) throw new Error("上课中，点歌暂不可用");
};
