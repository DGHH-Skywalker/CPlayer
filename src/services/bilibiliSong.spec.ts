import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSchoolConfig } from "@shared/school/schedule";
import { createBilibiliSong, parseBilibiliSong } from "@shared/bilibiliSong";

const mocks = vi.hoisted(() => ({
  next: vi.fn(),
  playerStop: vi.fn(),
  control: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  status: {
    currentTrack: null as unknown,
    state: "stopped",
    trackLoading: false,
    position: 0,
    duration: 0,
    playIndex: 0,
  },
  media: { track: null as unknown },
  school: { value: { generation: 0, config: {} as typeof defaultSchoolConfig } },
  allowed: true,
}));
vi.mock("@/core/player", () => ({ nextTrack: mocks.next, stop: mocks.playerStop }));
vi.mock("@/stores/queue", () => ({ queueLength: { value: 3 } }));
vi.mock("@/router", () => ({ default: { push: vi.fn() } }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/stores/media", () => ({ useMediaStore: () => mocks.media }));
vi.mock("@/stores/school", () => ({
  schoolState: mocks.school,
  canRequestNow: () => mocks.allowed,
}));
vi.mock("@/composables/useToast", () => ({ toast: { error: vi.fn() } }));
import {
  startBilibiliSong,
  stopBilibiliSong,
  handleBilibiliSongEvent,
  isBilibiliSongActive,
} from "./bilibiliSong";

const track = createBilibiliSong(
  "https://www.bilibili.com/video/BV1wHWe68Eh3/?p=2&share=abc",
  "测试 MV",
);
beforeEach(async () => {
  await stopBilibiliSong();
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.status.playIndex = 0;
  mocks.school.value = { generation: 1, config: structuredClone(defaultSchoolConfig) };
  mocks.school.value.config.bilibili.biliSongEnabled = true;
  mocks.status.currentTrack = track;
  mocks.media.track = track;
  mocks.stop.mockResolvedValue({ success: true });
  Object.assign(window, {
    api: {
      player: { stop: mocks.stop },
      bilibili: { playSong: mocks.play, controlSong: mocks.control, onSong: () => () => {} },
    },
  });
});

describe("哔哩Song 网页队列", () => {
  it("规范化分 P 并去除跟踪参数", () => {
    expect(track.id).toBe("bilibili:BV1wHWe68Eh3:p2");
    expect(track.bilibili?.url).toBe("https://www.bilibili.com/video/BV1wHWe68Eh3/?p=2");
    expect(parseBilibiliSong("https://www.bilibili.com/en/video/BV1wHWe68Eh3/?p=2").id).toBe(
      track.id,
    );
    for (const url of [
      "https://bilibili.com.evil/video/BV1wHWe68Eh3/",
      "https://www.bilibili.com@evil.test/video/BV1wHWe68Eh3/",
      "http://www.bilibili.com/video/BV1wHWe68Eh3/",
      "https://www.bilibili.com/video/BV1wHWe68Eh3/?p=-1",
    ])
      expect(() => parseBilibiliSong(url)).toThrow();
  });
  it("自然结束只推进一次，旧结束事件无效", async () => {
    await startBilibiliSong(track, true);
    const token = mocks.play.mock.calls[0]![1];
    const event = {
      token,
      trackId: track.id,
      state: "ended" as const,
      position: 1000,
      duration: 1000,
    };
    await handleBilibiliSongEvent(event);
    await handleBilibiliSongEvent(event);
    expect(mocks.next).toHaveBeenCalledTimes(1);
    expect(isBilibiliSongActive()).toBe(false);
  });
  it("上课作废视频结束的自动切歌", async () => {
    await startBilibiliSong(track, true);
    const token = mocks.play.mock.calls[0]![1];
    mocks.school.value.generation++;
    mocks.allowed = false;
    await handleBilibiliSongEvent({
      token,
      trackId: track.id,
      state: "ended",
      position: 1000,
      duration: 1000,
    });
    expect(mocks.next).not.toHaveBeenCalled();
  });
  it("网页项位于队尾时停止，避免重新播放同一视频", async () => {
    mocks.status.playIndex = 2;
    await startBilibiliSong(track, true);
    const token = mocks.play.mock.calls[0]![1];
    await handleBilibiliSongEvent({
      token,
      trackId: track.id,
      state: "ended",
      position: 1000,
      duration: 1000,
    });
    expect(mocks.playerStop).toHaveBeenCalledOnce();
    expect(mocks.next).not.toHaveBeenCalled();
  });
  it("切换队列项后旧视频不能改变新曲状态", async () => {
    await startBilibiliSong(track, true);
    const old = mocks.play.mock.calls[0]![1];
    await startBilibiliSong(track, false);
    await handleBilibiliSongEvent({
      token: old,
      trackId: track.id,
      state: "ended",
      position: 1000,
      duration: 1000,
    });
    expect(mocks.next).not.toHaveBeenCalled();
    expect(mocks.control).toHaveBeenCalledWith("stop", old);
  });
  it("默认关闭时不能启动网页曲目", async () => {
    mocks.school.value.config.bilibili.biliSongEnabled = false;
    await expect(startBilibiliSong(track, true)).rejects.toThrow("实验性");
  });
  it("原生停止等待期间取消，不再打开旧 MV", async () => {
    let finish!: (value: { success: boolean }) => void;
    mocks.stop.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const starting = startBilibiliSong(track, true);
    await stopBilibiliSong();
    finish({ success: true });
    await starting;
    expect(mocks.play).not.toHaveBeenCalled();
  });
});
