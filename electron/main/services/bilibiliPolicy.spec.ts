import { describe, expect, it } from "vitest";
import { isBilibiliUrl } from "./bilibiliPolicy";
describe("B 站顶层导航白名单", () => {
  it("允许站点、搜索、登录和播放器子域", () => {
    for (const host of [
      "bilibili.com",
      "www.bilibili.com",
      "search.bilibili.com",
      "passport.bilibili.com",
      "player.bilibili.com",
    ])
      expect(isBilibiliUrl(`https://${host}/`)).toBe(true);
  });
  it("拒绝伪域名、协议、端口、嵌入凭据及非法 URL", () => {
    for (const url of [
      "https://bilibili.com.evil.com",
      "https://evilbilibili.com",
      "https://bilibili.com@evil.com",
      "https://evil.com@bilibili.com",
      "http://www.bilibili.com",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://bilibili.com:8080",
      "data:text/html,foo",
      "bad",
    ])
      expect(isBilibiliUrl(url)).toBe(false);
  });
});
