import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@shared/types/player";
import { defaultSchoolConfig } from "@shared/school/schedule";
const storage = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  held: null as null | (() => void),
}));
vi.mock("localforage", () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => storage.data.get(key),
      setItem: async (key: string, value: unknown) => {
        if (storage.held) {
          const wait = storage.held;
          storage.held = null;
          await new Promise<void>((resolve) => waitResolve(resolve, wait));
        }
        storage.data.set(key, value);
      },
    }),
  },
}));
/** 让测试有意延迟一次旧持久化写入 */
const waitResolve = (resolve: () => void, signal: () => void): void => {
  storage.held = resolve;
  signal();
};
import {
  setQueue,
  clearQueue,
  restoreQueue,
  queue,
  originalQueue,
  shuffleQueue,
  flushQueueWrites,
} from "./queue";
import { schoolState } from "./school";
/** 创建轻量队列项 */
const track = (id: string): Track => ({
  id,
  source: "local",
  title: id,
  artists: [],
  duration: 1000,
});
beforeEach(async () => {
  await flushQueueWrites();
  storage.data.clear();
  schoolState.value = {
    ...schoolState.value,
    config: structuredClone(defaultSchoolConfig),
    pendingClear: null,
    phase: "DISABLED",
  };
});
describe("队列清理与持久化竞态", () => {
  it("旧写入迟到时清空仍最后落盘，洗牌备份同步删除", async () => {
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    storage.held = started;
    setQueue([track("a"), track("b")]);
    shuffleQueue(0);
    await waiting;
    const clearing = clearQueue();
    const release = storage.held!;
    storage.held = null;
    release();
    await clearing;
    expect(storage.data.get("playList")).toEqual([]);
    expect(storage.data.get("originalPlayList")).toBeNull();
    expect(queue.value).toEqual([]);
    expect(originalQueue.value).toBeNull();
  });
  it("恢复期间清空不会让旧快照覆盖新状态", async () => {
    setQueue([track("old")]);
    await flushQueueWrites();
    const restoring = restoreQueue();
    const clearing = clearQueue();
    await Promise.all([restoring, clearing]);
    expect(queue.value).toEqual([]);
    expect(storage.data.get("playList")).toEqual([]);
  });
  it("锁定期间所有低层新增和历史恢复被拒绝", async () => {
    schoolState.value = {
      ...schoolState.value,
      config: { ...defaultSchoolConfig, enabled: true, scheduleEnabled: true },
      phase: "CLASS",
    };
    setQueue([track("late")]);
    await restoreQueue();
    expect(queue.value).toEqual([]);
    await clearQueue();
    expect(storage.data.get("playList")).toEqual([]);
  });
  it("Vue 代理曲目在快照时转为原始对象，可持久化而不触发 DataCloneError", async () => {
    setQueue([reactive(track("proxy"))]);
    await flushQueueWrites();
    expect((storage.data.get("playList") as Array<{ track: Track }>)[0].track.id).toBe("proxy");
  });
});
