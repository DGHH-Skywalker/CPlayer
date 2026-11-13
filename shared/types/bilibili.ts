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
  command(command: string, value?: unknown): Promise<BilibiliState>;
  onState(callback: (state: BilibiliState) => void): () => void;
}
