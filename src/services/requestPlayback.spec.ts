import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@shared/types/player";
import { defaultSchoolConfig } from "@shared/school/schedule";
const mock = vi.hoisted(() => ({
  play: vi.fn(),
  repeat: vi.fn(),
  shuffle: vi.fn(),
  toast: vi.fn(),
  status: { playIndex: -1, fmMode: false, heartMode: false },
}));
vi.mock("@/core/player", () => ({
  playAtIndex: mock.play,
  setRepeatMode: mock.repeat,
  setShuffleMode: mock.shuffle,
}));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mock.status }));
vi.mock("@/stores/media", () => ({ useMediaStore: () => ({ clear: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ toast: { info: mock.toast } }));
vi.mock("localforage", () => ({
  default: { createInstance: () => ({ setItem: async () => {}, getItem: async () => null }) },
}));
import { requestSongs } from "./requestPlayback";
import { queue, queueEntries, moveInQueue } from "@/stores/queue";
import { schoolState } from "@/stores/school";
/** 创建测试点歌曲目 */
const track = (id: string): Track => ({
  id,
  title: id,
  source: "local",
  artists: [],
  duration: 1000,
});
beforeEach(() => {
  vi.clearAllMocks();
  queueEntries.value = [];
  mock.status.playIndex = -1;
  schoolState.value = {
    ...schoolState.value,
    config: { ...structuredClone(defaultSchoolConfig), enabled: true },
    pendingClear: null,
    phase: "DISABLED",
  };
});
describe("统一校园 FIFO 点歌", () => {
  it("依次 A B C，重复 B 不改变位置，人工调整准确", () => {
    requestSongs([track("a")]);
    mock.status.playIndex = 0;
    requestSongs([track("b"), track("c"), track("b")]);
    expect(queue.value.map((t) => t.id)).toEqual(["a", "b", "c"]);
    requestSongs([track("b")]);
    expect(mock.toast).toHaveBeenCalledWith("歌曲已经在队列中");
    expect(queue.value.map((t) => t.id)).toEqual(["a", "b", "c"]);
    moveInQueue(2, 1);
    expect(queue.value.map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(mock.play).toHaveBeenCalledOnce();
    expect(mock.repeat).toHaveBeenCalledWith("list");
    expect(mock.shuffle).toHaveBeenCalledWith("off");
  });
  it("上课、待清理、过期 BREAK 均不接受点歌", () => {
    schoolState.value = {
      ...schoolState.value,
      config: { ...schoolState.value.config, scheduleEnabled: true },
      phase: "CLASS",
    };
    expect(requestSongs([track("a")])).toBe(0);
    schoolState.value = { ...schoolState.value, phase: "BREAK", endAt: Date.now() - 1 };
    expect(requestSongs([track("a")])).toBe(0);
    schoolState.value = { ...schoolState.value, endAt: Date.now() + 60000, pendingClear: "event" };
    expect(requestSongs([track("a")])).toBe(0);
    expect(queue.value).toEqual([]);
  });
  it("关闭首首自动播放后只添加，空和无效曲目不会加载", () => {
    schoolState.value = {
      ...schoolState.value,
      config: { ...schoolState.value.config, autoPlayFirstRequest: false },
    };
    expect(requestSongs([])).toBe(0);
    expect(requestSongs([track("a")])).toBe(1);
    expect(mock.play).not.toHaveBeenCalled();
  });
});
