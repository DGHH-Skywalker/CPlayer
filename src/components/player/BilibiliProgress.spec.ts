import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import BilibiliProgress from "./BilibiliProgress.vue";
const mocks = vi.hoisted(() => ({
  status: { state: "paused", position: 1000, duration: 120000 },
  media: { track: { id: "one" } },
  control: vi.fn(),
}));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/stores/media", () => ({ useMediaStore: () => mocks.media }));
vi.mock("@/services/bilibiliSong", () => ({ controlBilibiliSong: mocks.control }));
vi.mock("@/services/bilibiliSeek", async () => ({
  bilibiliTimeline: (await import("vue")).shallowRef({
    pendingTarget: null,
    buffering: false,
    buffered: [],
  }),
}));
vi.mock("@/composables/useToast", () => ({ toast: { error: vi.fn() } }));
beforeEach(() => {
  mocks.control.mockClear();
  mocks.status = reactive({ state: "paused", position: 1000, duration: 120000 });
});
/** 使用控件事件验证预览和提交的分离，不模拟浏览器的拖动实现 */
const render = () =>
  mount(BilibiliProgress, {
    global: {
      stubs: {
        SSlider: { name: "SSlider", props: ["modelValue"], template: "<div/>" },
        IconLucideLoaderCircle: true,
      },
    },
  });
describe("网页底栏定位交互", () => {
  it("拖动只预览，松手才提交一次精确时间", async () => {
    const w = render();
    const slider = w.findComponent({ name: "SSlider" });
    slider.vm.$emit("change", 20000);
    await w.vm.$nextTick();
    expect(w.text()).toContain("0:20");
    expect(mocks.control).not.toHaveBeenCalled();
    slider.vm.$emit("dragEnd", 20000);
    await w.vm.$nextTick();
    expect(mocks.control).toHaveBeenCalledExactlyOnceWith("seek", 20000);
    w.unmount();
  });
  it("取消和曲目变化清除预览，不提交定位", async () => {
    const w = render();
    const slider = w.findComponent({ name: "SSlider" });
    slider.vm.$emit("change", 20000);
    slider.vm.$emit("dragCancel");
    await w.vm.$nextTick();
    expect(mocks.control).not.toHaveBeenCalled();
    expect(w.text()).toContain("0:01");
    w.unmount();
  });
});
