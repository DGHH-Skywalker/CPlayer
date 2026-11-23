import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("./noiseLimiterPage", () => ({ noiseLimiterBootstrap: () => "/* fixed protection */" }));
vi.mock("./audioEffects", () => ({
  effectiveDynamics: () => ({ enabled: true }),
  reportBrowserEffect: vi.fn(),
}));
vi.mock("@main/utils/logger", () => ({
  coreLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { BilikitLoader } from "./bilikitLoader";

/** 构造可注入 CDP attach 和注册失败的独立网页目标 */
const fixture = () => {
  let attached = false;
  const debuggerApi = Object.assign(new EventEmitter(), {
    isAttached: () => attached,
    attach: vi.fn(() => {
      attached = true;
    }),
    detach: vi.fn(() => {
      attached = false;
      debuggerApi.emit("detach", {}, "target_closed");
    }),
    sendCommand: vi.fn(async () => ({ identifier: "main-script" })),
  });
  const reportProtection = vi.fn();
  const contents = {
    debugger: debuggerApi,
    isDestroyed: () => false,
    mainFrame: { framesInSubtree: [] },
  } as unknown as WebContents;
  return {
    debuggerApi,
    reportProtection,
    loader: new BilikitLoader(contents, vi.fn(), vi.fn(), reportProtection),
  };
};

describe("主进程可信的早期注入状态", () => {
  it("Core 关闭也要注册独立保护，不能以 Core.loaded 判断音频安全", async () => {
    const { loader, reportProtection } = fixture();
    expect(loader.audioProtected).toBe(false);
    await loader.install(false, false);
    expect(loader.loaded).toBe(false);
    expect(loader.audioProtected).toBe(true);
    expect(reportProtection).toHaveBeenLastCalledWith(true);
    loader.dispose();
  });
  it.each(["attach", "register"] as const)("CDP %s 失败不能声称保护就绪", async (failure) => {
    const { loader, debuggerApi, reportProtection } = fixture();
    if (failure === "attach")
      debuggerApi.attach.mockImplementationOnce(() => {
        throw new Error("CDP unavailable");
      });
    else debuggerApi.sendCommand.mockRejectedValueOnce(new Error("CDP unavailable"));
    await loader.install(false, false);
    expect(loader.audioProtected).toBe(false);
    expect(reportProtection).toHaveBeenLastCalledWith(false);
    loader.dispose();
  });
  it("detach 立即失效，重新安装后恢复，监听器不能重复增加", async () => {
    const { loader, debuggerApi, reportProtection } = fixture();
    await loader.install(false, false);
    expect(loader.audioProtected).toBe(true);
    debuggerApi.detach();
    expect(loader.audioProtected).toBe(false);
    expect(reportProtection).toHaveBeenLastCalledWith(false);
    await loader.install(false, false);
    expect(loader.audioProtected).toBe(true);
    expect(debuggerApi.listenerCount("message")).toBe(1);
    loader.dispose();
    expect(loader.audioProtected).toBe(false);
    expect(debuggerApi.listenerCount("detach")).toBe(0);
  });
});
