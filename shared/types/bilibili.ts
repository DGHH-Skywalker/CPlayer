import type { Track, PlayerState } from "./player";

/** 哔哩Song 播放事件，以操作标识隔离迟到网页事件 */
export interface BilibiliSongEvent {
  token: string;
  trackId: string;
  state: PlayerState | "ended" | "error";
  position: number;
  duration: number;
  error?: string;
}

/** B 站独立视图状态 */
export interface BilibiliState {
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  visible: boolean;
  mediaPlaying: boolean;
  temporaryDisabled: boolean;
  coreLoaded: boolean;
  coreVersion: string;
  partition: string;
}

/** 浏览器管理接口，仅向主窗口暴露 */
export interface BilibiliApi {
  song(): Promise<Track>;
  playSong(track: Track, token: string, autoPlay: boolean): Promise<void>;
  controlSong(
    command: "play" | "pause" | "stop" | "seek",
    token: string,
    position?: number,
  ): Promise<void>;
  onSong(callback: (event: BilibiliSongEvent) => void): () => void;
  command(command: string, value?: unknown): Promise<BilibiliState>;
  onState(callback: (state: BilibiliState) => void): () => void;
}
