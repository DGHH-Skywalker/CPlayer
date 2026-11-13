import { app, type WebContents } from "electron";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { coreLog } from "@main/utils/logger";
import { isBilibiliUrl } from "./bilibiliPolicy";

/** 返回已打包的本地脚本及固定版本，不从远程下载代码 */
const readCore = () => {
  const root = app.isPackaged
    ? resolve(process.resourcesPath, "bilikit")
    : resolve(app.getAppPath(), "vendor/bilikit");
  const source = readFileSync(resolve(root, "bilikit-core.user.js"), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")) as {
    version: string;
    sha256: string;
  };
  if (createHash("sha256").update(source).digest("hex") !== manifest.sha256)
    throw new Error("Core 本地资源校验失败");
  return { source, manifest };
};

/**
 * 构建主世界 document-start 代码，配置同步仅写允许的非敏感键
 * @param source - 固定版本 Core
 * @param enabled - 是否注入 Core
 * @param noLogin - 免登录模块明确开关
 */
export const coreBootstrap = (
  source: string,
  enabled: boolean,
  noLogin: boolean,
): string => `(() => {
  if (location.protocol !== 'https:' || !(location.hostname === 'bilibili.com' || location.hostname.endsWith('.bilibili.com'))) return;
  try {
    const key = 'module.no-login.enabled';
    const local = JSON.parse(localStorage.getItem('bilikit:settings') || '{}');
    let shared = {};
    try { shared = JSON.parse(decodeURIComponent((document.cookie.match(/(?:^|;\\s*)bilikit_settings=([^;]*)/) || [])[1] || '%7B%7D')); } catch {}
    local[key] = ${enabled && noLogin};
    localStorage.setItem('bilikit:settings', JSON.stringify(local));
    const safe = {};
    for (const [k,v] of Object.entries(shared)) if (!/accessKey|token|secret|passwd|password/i.test(k)) safe[k] = v;
    safe[key] = ${enabled && noLogin};
    document.cookie = 'bilikit_settings=' + encodeURIComponent(JSON.stringify(safe)) + '; path=/; domain=.bilibili.com; max-age=31536000; SameSite=Lax; Secure';
    if (!${enabled && noLogin} && !document.cookie.match(/(?:^|;\\s*)DedeUserID__ckMd5=[^;]/)) document.cookie = 'DedeUserID=; path=/; domain=.bilibili.com; max-age=0; Secure';
  } catch {}
  ${enabled ? "globalThis.__carbonv_core_document_start__ = true;\n" + source : ""}
})();`;

/** 非特权媒体报告，只发送聚合布尔状态，不接受播放控制 */
const MEDIA_BOOTSTRAP = `(() => {
  if (location.protocol !== 'https:' || !(location.hostname === 'bilibili.com' || location.hostname.endsWith('.bilibili.com'))) return;
  const report = () => {
    const playing = [...document.querySelectorAll('video,audio')].some(v => !v.paused && !v.ended);
    try { carbonvMedia(JSON.stringify({ playing })); } catch {}
  };
  for (const name of ['play','playing','pause','ended','emptied']) document.addEventListener(name, report, true);
  addEventListener('pagehide', () => { try { carbonvMedia('{"playing":false}'); } catch {} });
})();`;

/** 在首次导航之前注册 CDP 主世界注入，支持同进程和跨进程子框架 */
export class BilikitLoader {
  private scripts = new Map<string, string>();
  private mediaContexts = new Map<string, boolean>();
  private sessions = new Set<string>();
  private source = "";
  private registration: Promise<void> = Promise.resolve();
  private contents: WebContents;
  version = "unavailable";
  loaded = false;

  /**
   * 创建本地脚本加载器
   * @param contents - 无 Node 权限的独立网页
   * @param reportMedia - 已验证网页上下文的媒体布尔事件
   */
  constructor(
    contents: WebContents,
    private reportMedia: (playing: boolean) => void,
  ) {
    this.contents = contents;
  }

  /**
   * 注册主世界脚本并挂接跨进程框架
   * @param enabled - 永久与临时开关计算结果
   * @param noLogin - 免登录增强设置
   */
  install(enabled: boolean, noLogin: boolean): Promise<void> {
    const task = this.registration.then(() => this.installNow(enabled, noLogin));
    this.registration = task.catch(() => {});
    return task;
  }

  /** 按串行顺序替换脚本，避免快速切换开关产生旧注册残留 */
  private async installNow(enabled: boolean, noLogin: boolean): Promise<void> {
    const wc = this.contents;
    if (wc.isDestroyed()) return;
    try {
      if (enabled) {
        const core = readCore();
        this.version = core.manifest.version;
        this.source =
          coreBootstrap(core.source, true, noLogin) +
          MEDIA_BOOTSTRAP +
          `if (window === top) carbonvMedia('{"coreReady":true}');`;
      } else this.source = coreBootstrap("", false, false) + MEDIA_BOOTSTRAP;
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach("1.3");
        wc.debugger.on("message", async (_event, method, params, sessionId) => {
          try {
            if (method === "Target.attachedToTarget") {
              const id = params.sessionId as string;
              if (params.targetInfo.type === "iframe") {
                this.sessions.add(id);
                await this.register(id);
                await wc.debugger.sendCommand(
                  "Target.setAutoAttach",
                  { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
                  id,
                );
              }
              await wc.debugger.sendCommand("Runtime.runIfWaitingForDebugger", {}, id);
            } else if (method === "Target.detachedFromTarget") {
              this.clearMediaContexts(params.sessionId);
              this.sessions.delete(params.sessionId);
              this.scripts.delete(params.sessionId);
            } else if (
              method === "Runtime.bindingCalled" &&
              params.name === "carbonvMedia" &&
              isBilibiliUrl(wc.getURL())
            ) {
              const value = JSON.parse(params.payload);
              if (value.coreReady === true) this.loaded = true;
              if (typeof value.playing === "boolean") {
                this.mediaContexts.set(
                  `${sessionId ?? ""}/${params.executionContextId}`,
                  value.playing,
                );
                this.reportMedia(this.isMediaPlaying());
              }
            } else if (method === "Runtime.executionContextsCleared") {
              this.clearMediaContexts(sessionId ?? "");
            } else if (method === "Runtime.executionContextDestroyed") {
              this.mediaContexts.delete(`${sessionId ?? ""}/${params.executionContextId}`);
              this.reportMedia(this.isMediaPlaying());
            } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
              coreLog.debug("B 站页面脚本报告错误", sessionId ?? "main");
            }
          } catch (error) {
            coreLog.warn("B 站框架注入或媒体桥接失败", error);
          }
        });
      }
      for (const session of ["", ...this.sessions]) await this.register(session);
      await wc.debugger.sendCommand("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
      });
      this.loaded = false;
      coreLog.info("B 站提前注入已注册", { enabled, version: this.version });
    } catch (error) {
      this.loaded = false;
      coreLog.error("B 站提前注入失败，保留原生网页", error);
    }
  }

  /**
   * 在指定 CDP 会话移除旧脚本并注册新文档脚本
   * @param sessionId - 主框架为空，子框架使用 CDP Session ID
   */
  private async register(sessionId: string): Promise<void> {
    const wc = this.contents;
    await wc.debugger.sendCommand("Page.enable", {}, sessionId || undefined);
    await wc.debugger.sendCommand("Runtime.enable", {}, sessionId || undefined);
    await wc.debugger.sendCommand(
      "Runtime.addBinding",
      { name: "carbonvMedia" },
      sessionId || undefined,
    );
    const old = this.scripts.get(sessionId);
    if (old)
      await wc.debugger.sendCommand(
        "Page.removeScriptToEvaluateOnNewDocument",
        { identifier: old },
        sessionId || undefined,
      );
    const result = await wc.debugger.sendCommand(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: this.source },
      sessionId || undefined,
    );
    this.scripts.set(sessionId, result.identifier);
  }

  /** 聚合所有仍存活网页文档的媒体状态 */
  isMediaPlaying(): boolean {
    return [...this.mediaContexts.values()].some(Boolean);
  }

  /**
   * 文档或跨进程框架销毁时删除其媒体状态，生命周期限制集合大小
   * @param sessionId - 文档所属 CDP 会话
   */
  private clearMediaContexts(sessionId: string): void {
    for (const key of this.mediaContexts.keys())
      if (key.startsWith(`${sessionId}/`)) this.mediaContexts.delete(key);
    this.reportMedia(this.isMediaPlaying());
  }

  /** 销毁视图时释放调试器与所有脚本注册 */
  dispose(): void {
    if (this.contents.debugger.isAttached()) this.contents.debugger.detach();
    this.mediaContexts.clear();
    this.scripts.clear();
    this.sessions.clear();
  }
}
