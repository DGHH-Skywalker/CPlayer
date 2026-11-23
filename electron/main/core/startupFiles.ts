/**
 * 串行后台清理与新下载之间的单文件屏障，当前任务只占用一个记录
 */
export class StartupFileMaintenance {
  private current: { name: string; promise: Promise<void> } | null = null;
  private stopped = false;

  /**
   * 初始化活动文件判定
   * @param active - 文件是否由当前下载或预载持有
   */
  constructor(private readonly active: (name: string) => boolean) {}

  /** 退出时停止后续清理，不中断已经交给文件系统的单次操作 */
  stop(): void {
    this.stopped = true;
  }

  /** 查询退出状态，避免数据库关闭后继续处理清理结果 */
  get disposed(): boolean {
    return this.stopped;
  }

  /**
   * 新下载写入前等待同名旧文件清理完成
   * @param name - 临时文件名
   * @returns 当前同名文件操作，其他文件不受阻塞
   */
  pending(name: string): Promise<void> | undefined {
    return this.current?.name === name ? this.current.promise : undefined;
  }

  /**
   * 原子占用单个文件的清理次序，新任务不能在清理途中覆盖同名文件
   * @param name - 文件名
   * @param cleanup - 单个文件的清理操作
   * @returns 是否执行过清理
   */
  async run(name: string, cleanup: () => Promise<void>): Promise<boolean> {
    if (this.stopped || this.active(name)) return false;
    const promise = Promise.resolve().then(async () => {
      if (!this.stopped) await cleanup();
    });
    this.current = { name, promise };
    try {
      await promise;
      return true;
    } finally {
      if (this.current?.promise === promise) this.current = null;
    }
  }
}
