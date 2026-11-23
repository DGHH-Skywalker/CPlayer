/** 一项可以在核心播放准备后执行的启动工作 */
export interface StartupTask {
  name: string;
  run(): void | Promise<unknown>;
}

/**
 * 在任务之间归还事件循环，单项失败不阻断后续功能，退出后不再启动新工作
 * @param tasks - 已按优先级排列的后台任务
 * @param quitting - 是否已经进入退出流程
 * @param failed - 单项失败的日志入口
 * @param completed - 单项耗时记录，包含等待的异步工作
 */
export const runStartupTasks = async (
  tasks: StartupTask[],
  quitting: () => boolean,
  failed: (name: string, error: unknown) => void,
  completed?: (name: string, durationMs: number) => void,
): Promise<void> => {
  for (const task of tasks) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (quitting()) return;
    const startedAt = performance.now();
    try {
      await task.run();
    } catch (error) {
      failed(task.name, error);
    } finally {
      completed?.(task.name, Math.round(performance.now() - startedAt));
    }
  }
};
