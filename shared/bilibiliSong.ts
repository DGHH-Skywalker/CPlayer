import type { Track } from "./types/player";

/**
 * 将公开 BV/av 视频地址规范化，分 P 作为独立队列项
 * @param input - B 站视频页地址
 * @returns 去除跟踪参数后的网页地址与稳定标识
 */
export const parseBilibiliSong = (input: string): { url: string; id: string } => {
  const url = new URL(input);
  const match = /^\/(?:en\/)?video\/(BV[a-zA-Z0-9]{10}|av\d+)\/?$/.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    !["www.bilibili.com", "m.bilibili.com", "bilibili.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    throw new Error("请选择 B 站 BV 或 av 视频页面");
  const page = Number(url.searchParams.get("p") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("视频分 P 无效");
  return {
    url: `https://www.bilibili.com/video/${match[1]}/${page > 1 ? `?p=${page}` : ""}`,
    id: `bilibili:${match[1]}:p${page}`,
  };
};

/**
 * 创建轻量网页曲目，不解析音视频流
 * @param url - 当前视频页面
 * @param title - 页面标题
 * @returns 可由现有队列持久化的特殊歌曲
 */
export const createBilibiliSong = (url: string, title: string): Track => {
  const parsed = parseBilibiliSong(url);
  return {
    id: parsed.id,
    source: "bilibili",
    bilibili: { url: parsed.url },
    title:
      title
        .replace(/_哔哩哔哩_bilibili$/, "")
        .trim()
        .slice(0, 300) || "哔哩Song",
    artists: [{ name: "哔哩Song · 实验性" }],
    duration: 0,
  };
};
