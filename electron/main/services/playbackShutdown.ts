import { getPlayer } from "../core/player";
import { lastfm } from "../services/lastfm";
import { neteaseScrobble } from "../services/neteaseScrobble";
import { streamingPlayback } from "../services/streamingPlayback";

export type PlaybackShutdownHandler = () => void | Promise<void>;
let shutdownHandler: PlaybackShutdownHandler | null = null;

/** 播放器 IPC 注册完整停止实现，避免校园调度只执行简化停止。 */
export const registerPlaybackShutdownHandler = (handler: PlaybackShutdownHandler): void => {
  shutdownHandler = handler;
};

/** 停止原生与流媒体音频；完整处理器未就绪时仍执行安全回退。 */
export const stopAllPlayback = async (): Promise<void> => {
  if (shutdownHandler) {
    await shutdownHandler();
    return;
  }
  await streamingPlayback.stopStreamingPlayback();
  neteaseScrobble.onStopped();
  lastfm.onStopped();
  getPlayer().stop();
};
