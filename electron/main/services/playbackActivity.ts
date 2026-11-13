let version = 0;
/** 标记用户或外部播放控制，作废 MV 的旧恢复意图 */
export const markPlaybackActivity = (): void => {
  version++;
};
/** 读取最近播放控制代次 */
export const getPlaybackActivity = (): number => version;
