import type { SchoolCleanupAck } from "@shared/types/school";
import { getMainWindow } from "../core/window";

interface PendingCleanup {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const pending = new Map<number, PendingCleanup>();

/** 请求渲染层清空两个队列，并等待其实际读回验证。 */
export const requestSchoolQueueCleanup = (generation: number): Promise<void> => {
  const previous = pending.get(generation);
  if (previous) {
    clearTimeout(previous.timeout);
    pending.delete(generation);
    previous.reject(new Error("校园清空请求已被新请求替代"));
  }
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return Promise.reject(new Error("主窗口尚未就绪，校园清空将在渲染层就绪后重试"));
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(generation);
      reject(new Error("等待校园队列持久化验证超时"));
    }, 10_000);
    pending.set(generation, { resolve, reject, timeout });
    window.webContents.send("school:force-cleanup", { generation });
  });
};

/** 仅接受当前代次且两个队列均已读回为空的回执。 */
export const acknowledgeSchoolQueueCleanup = (ack: SchoolCleanupAck): boolean => {
  const request = pending.get(ack.generation);
  if (!request) return false;
  clearTimeout(request.timeout);
  pending.delete(ack.generation);
  if (!ack.queueEmpty || !ack.originalQueueEmpty) {
    request.reject(new Error("校园队列读回验证失败"));
    return false;
  }
  request.resolve();
  return true;
};
