import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
const create = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({
  app: { getAppPath: () => "/fixture/resources/app.asar" },
  nativeTheme: { shouldUseDarkColors: true },
  BrowserWindow: class {
    constructor(options: unknown) {
      create(options);
    }
  },
}));
import { createWindow } from "./create";
describe("分块后的窗口资源", () => {
  it("preload 与图标从应用根目录加载，覆盖偏好仍保留默认安全配置", () => {
    createWindow({ width: 700, webPreferences: { sandbox: true } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 700,
        icon: join("/fixture/resources/app.asar", "public", "icons", "favicon.png"),
        webPreferences: expect.objectContaining({
          preload: join("/fixture/resources/app.asar", "out", "preload", "index.mjs"),
          sandbox: true,
          spellcheck: false,
        }),
      }),
    );
  });
});
