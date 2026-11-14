import type { BilibiliSongEvent } from "@shared/types/bilibili";

/** 原生控制与网页控制之间的窄接口，避免浏览器和播放器循环依赖 */
export const biliSongTransport: {
  current: BilibiliSongEvent | null;
  control:
    ((command: "play" | "pause" | "stop" | "seek", position?: number) => Promise<void>) | null;
} = { current: null, control: null };
