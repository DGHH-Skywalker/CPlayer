import { beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
const state = vi.hoisted(() => ({ root: "/development/CPlayer" }));
vi.mock("electron", () => ({ app: { getAppPath: () => state.root } }));
import { appFile } from "./appFiles";
beforeEach(() => {
  state.root = "/development/CPlayer";
});
describe("不受代码分块影响的应用资源路径", () => {
  it("开发构建与独立 worker 使用应用根目录，不能相对当前工作目录或 chunk", () => {
    expect(appFile("out", "preload", "index.mjs")).toBe(join(state.root, "out/preload/index.mjs"));
    expect(appFile("out", "main", "host.worker.js")).toBe(
      join(state.root, "out/main/host.worker.js"),
    );
    expect(appFile("out", "main", "fingerprint.worker.js")).toBe(
      join(state.root, "out/main/fingerprint.worker.js"),
    );
    expect(appFile("public", "icons", "tray", "play-dark.png")).toBe(
      join(state.root, "public/icons/tray/play-dark.png"),
    );
  });
  it("打包后解析 app.asar 内的主窗口、歌词页和公共封面", () => {
    state.root = "/installed/resources/app.asar";
    expect(appFile("out", "renderer", "index.html")).toBe(
      join(state.root, "out/renderer/index.html"),
    );
    for (const name of ["desktop-lyric", "dynamic-island", "taskbar-lyric"])
      expect(appFile("out", "renderer", "windows", name, "index.html")).toBe(
        join(state.root, "out/renderer/windows", name, "index.html"),
      );
    expect(appFile("public", "images", "song.jpg")).toBe(
      join(state.root, "public/images/song.jpg"),
    );
  });
});
