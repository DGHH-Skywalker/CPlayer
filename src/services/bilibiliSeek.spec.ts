import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  status: { state: "playing", position: 1000, duration: 120000 },
  control: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/composables/useToast", () => ({ toast: { error: mocks.toast } }));
import {
  seekBilibili,
  acceptBilibiliPosition,
  cancelBilibiliSeek,
  bilibiliTimeline,
} from "./bilibiliSeek";
import type { BilibiliSongEvent } from "@shared/types/bilibili";
/** 构造可信主进程的定位回报 */
const event = (extra: Partial<BilibiliSongEvent> = {}): BilibiliSongEvent => ({
  token: "owner",
  trackId: "track",
  state: "playing",
  position: 1000,
  duration: 120000,
  ...extra,
});
beforeEach(() => {
  cancelBilibiliSeek();
  vi.useFakeTimers();
  mocks.control.mockReset().mockImplementation(async (command, _token, _position, seekId) => ({
    seekId,
    seekOrder: command === "seek" ? 1 : undefined,
  }));
  mocks.toast.mockClear();
  mocks.status = { state: "playing", position: 1000, duration: 120000 };
  vi.stubGlobal("api", { bilibili: { controlSong: mocks.control } });
});
afterEach(() => {
  cancelBilibiliSeek();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("哔哩Song 定位握手", () => {
  it("提交即显示目标，拒绝旧时间，确认后才恢复同步", async () => {
    await seekBilibili("owner", 50000, () => true);
    expect(mocks.status.position).toBe(50000);
    expect(acceptBilibiliPosition(event({ position: 2000 }))).toBe(false);
    const id = mocks.control.mock.calls[0][3];
    expect(
      acceptBilibiliPosition(
        event({ position: 50010, seekId: id, seekOrder: 1, seekPhase: "seeked" }),
      ),
    ).toBe(true);
    expect(bilibiliTimeline.value.pendingTarget).toBe(null);
  });
  it("连续定位时旧确认不能结束新请求", async () => {
    await seekBilibili("owner", 30000, () => true);
    const old = mocks.control.mock.calls[0][3];
    mocks.control.mockImplementationOnce(async (_a, _b, _c, id) => ({ seekId: id, seekOrder: 2 }));
    await seekBilibili("owner", 70000, () => true);
    expect(
      acceptBilibiliPosition(
        event({ position: 30000, seekId: old, seekOrder: 1, seekPhase: "seeked" }),
      ),
    ).toBe(false);
    expect(bilibiliTimeline.value.pendingTarget).toBe(70000);
  });
  it("更晚的外部定位可以接管，但不能接受更早请求", async () => {
    await seekBilibili("owner", 30000, () => true);
    expect(
      acceptBilibiliPosition(
        event({ seekId: "external", seekOrder: 2, position: 60000, seekPhase: "seeked" }),
      ),
    ).toBe(true);
    expect(bilibiliTimeline.value.pendingTarget).toBe(null);
  });
  it("暂停定位不发出播放命令，目标限制在可定位区间", async () => {
    mocks.status.state = "paused";
    acceptBilibiliPosition(
      event({
        state: "paused",
        seekable: [
          [10000, 20000],
          [50000, 60000],
        ],
      }),
    );
    await seekBilibili("owner", 40000, () => true);
    expect(mocks.control).toHaveBeenCalledWith("seek", "owner", 50000, expect.any(String));
    expect(mocks.control.mock.calls.every(([cmd]) => cmd !== "play")).toBe(true);
  });
  it("十秒后查询权威位置，学校锁定后不再发送补偿", async () => {
    let allowed = true;
    await seekBilibili("owner", 60000, () => allowed);
    allowed = false;
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.control).toHaveBeenCalledOnce();
    expect(bilibiliTimeline.value.pendingTarget).toBe(null);
  });
  it("无定位确认也不会永久锁住滑块", async () => {
    await seekBilibili("owner", 60000, () => true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.control).toHaveBeenLastCalledWith(
      "inspect",
      "owner",
      undefined,
      expect.any(String),
    );
    expect(bilibiliTimeline.value.pendingTarget).toBe(null);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });
  it("未取得时长和非法位置均不提交请求", async () => {
    await seekBilibili("owner", NaN, () => true);
    mocks.status.duration = 0;
    await seekBilibili("owner", 10000, () => true);
    expect(mocks.control).not.toHaveBeenCalled();
  });
});
