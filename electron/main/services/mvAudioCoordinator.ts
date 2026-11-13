import type { SchoolConfig } from "@shared/types/school";

/** 可测试的独立音频协调依赖 */
export interface MvAudioHooks {
  isPlaying(): boolean;
  isPaused(): boolean;
  pause(): void;
  resume(): Promise<void>;
  version(): number;
  generation(): number;
  allowed(): boolean;
  mute(value: boolean): void;
}

/** MV 与音乐队列相互独立，仅管理属于本次 MV 的暂停与恢复意图 */
export class MvAudioCoordinator {
  private playing = false;
  private owner: { version: number; generation: number } | null = null;
  /**
   * 注入原生播放器控制
   * @param hooks - 版本、闸门与音频操作
   */
  constructor(private hooks: MvAudioHooks) {}

  /**
   * 根据网页媒体状态协调原生音乐
   * @param playing - 任一网页媒体正在播放
   * @param policy - 用户选择的音频策略
   */
  async update(playing: boolean, policy: SchoolConfig["bilibili"]["audioPolicy"]): Promise<void> {
    this.hooks.mute(policy === "muted");
    if (policy !== "pause-music") {
      this.owner = null;
      this.playing = playing;
      return;
    }
    if (playing && !this.playing && this.hooks.isPlaying()) {
      this.hooks.pause();
      this.owner = { version: this.hooks.version(), generation: this.hooks.generation() };
    }
    const ended = !playing && this.playing;
    this.playing = playing;
    const owner = this.owner;
    if (!ended) return;
    this.owner = null;
    if (
      owner &&
      owner.version === this.hooks.version() &&
      owner.generation === this.hooks.generation() &&
      this.hooks.allowed() &&
      this.hooks.isPaused()
    )
      await this.hooks.resume();
  }

  /** 上课、浏览器清除和崩溃时作废自动恢复意图 */
  invalidate(): void {
    this.owner = null;
    this.playing = false;
  }
}
