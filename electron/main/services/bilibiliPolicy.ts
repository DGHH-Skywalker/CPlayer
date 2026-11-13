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
