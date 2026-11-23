/** 本次应用运行内的插件中心入口状态，不写入配置 */
export class PluginCenterSession {
  unlocked = false;
  private presses = 0;
  private firstAt = 0;
  /**
   * 消费一次独立 Enter，三秒内五次才解锁
   * @param now - 主进程接收时间
   * @returns 当前解锁状态
   */
  enter(now = Date.now()): boolean {
    if (this.unlocked) return true;
    if (!this.presses || now - this.firstAt > 3000 || now < this.firstAt) {
      this.firstAt = now;
      this.presses = 0;
    }
    this.presses++;
    if (this.presses === 5) this.unlocked = true;
    return this.unlocked;
  }
  /** 中断按键序列，不撤销本次启动已完成的解锁 */
  reset(): void {
    this.presses = 0;
    this.firstAt = 0;
  }
}
export const pluginCenterSession = new PluginCenterSession();
