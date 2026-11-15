import { describe, expect, it } from "vitest";
import { bilibiliSurfaceBounds } from "./bilibiliSurface";

const viewport = { width: 1200, height: 760 };
const surface = { left: 240, top: 112, right: 1200, bottom: 940, height: 828 };
const content = { left: 240, top: 64, right: 1200, bottom: 760, height: 696 };

describe("B 站原生视图与底栏隔离", () => {
  it("容器最小高度超出窗口时仍不能遮住底部播放栏", () => {
    const b = bilibiliSurfaceBounds(surface, content, viewport, {
      left: 0,
      top: 680,
      right: 1200,
      bottom: 760,
      height: 80,
    });
    expect(b.y + b.height).toBe(680);
  });
  it("播放栏正在从屏幕下方入场时预留最终高度", () => {
    const b = bilibiliSurfaceBounds(surface, content, viewport, {
      left: 0,
      top: 740,
      right: 1200,
      bottom: 820,
      height: 80,
    });
    expect(b.y + b.height).toBe(680);
  });
  it("浮动布局也为播放栏与底部留白保留区域", () => {
    const b = bilibiliSurfaceBounds(surface, content, viewport, {
      left: 252,
      top: 650,
      right: 1200,
      bottom: 760,
      height: 110,
    });
    expect(b.y + b.height).toBe(650);
  });
  it("没有歌曲时使用内容区，缩小窗口也不产生负尺寸", () => {
    expect(bilibiliSurfaceBounds(surface, content, viewport).height).toBe(648);
    expect(bilibiliSurfaceBounds(surface, content, { width: 100, height: 80 }).height).toBe(0);
  });
});
