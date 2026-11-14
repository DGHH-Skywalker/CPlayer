/**
 * 顶层导航仅允许 B 站域名，资源请求不受此规则影响
 * @param value - 未受信的网页 URL
 */
export const isBilibiliUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname === "bilibili.com" || url.hostname.endsWith(".bilibili.com"))
    );
  } catch {
    return false;
  }
};

/**
 * 将渲染端 CSS 边界转为原生 DIP，裁剪到主窗口而不重复乘系统 DPI
 * @param input - CSS 像素边界
 * @param zoom - 应用页面缩放
 * @param size - 主窗口内容尺寸
 * @returns 不越过窗口边缘的原生视图尺寸
 */
export const bilibiliBounds = (
  input: { x: number; y: number; width: number; height: number },
  zoom: number,
  size: number[],
): { x: number; y: number; width: number; height: number } => {
  const x = Math.min(size[0], Math.max(0, Math.round(input.x * zoom)));
  const y = Math.min(size[1], Math.max(0, Math.round(input.y * zoom)));
  return {
    x,
    y,
    width: Math.max(0, Math.min(size[0] - x, Math.round(input.width * zoom))),
    height: Math.max(0, Math.min(size[1] - y, Math.round(input.height * zoom))),
  };
};
