/** 可测量的 CSS 矩形 */
interface SurfaceRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  height: number;
}

/**
 * 原生视图必须裁剪到内容区，并为仍在入场动画中的播放栏预留完整高度
 * @param surface - 网页容器
 * @param content - 主内容滚动区域
 * @param viewport - 渲染窗口尺寸
 * @param footer - 当前播放栏，未出现时为空
 * @returns 不覆盖导航、侧栏及播放栏的 CSS 边界
 */
export const bilibiliSurfaceBounds = (
  surface: SurfaceRect,
  content: SurfaceRect,
  viewport: { width: number; height: number },
  footer?: SurfaceRect,
): { x: number; y: number; width: number; height: number } => {
  const x = Math.max(0, surface.left, content.left);
  const y = Math.max(0, surface.top, content.top);
  const right = Math.min(viewport.width, surface.right, content.right);
  const bottom = Math.min(
    viewport.height,
    surface.bottom,
    content.bottom,
    footer ? Math.min(footer.top, viewport.height - footer.height) : Infinity,
  );
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
};
