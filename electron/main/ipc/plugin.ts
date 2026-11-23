import { audioEffectsState } from "@main/services/audioEffects";
/**
 * 插件系统 IPC
 *
 * 渲染端通过 `window.api.plugins.*` 调用以下 channel：
 * - plugin:list / install / pickAndInstall / installFromUrl / uninstall / setEnabled
 * - plugin:search / resolveUrl
 * 并订阅 `plugin:status` 广播以更新 UI。
 */

import { assertTrustedSender } from "./trustedSender";
import { pluginCenterSession } from "@main/plugins/centerSession";
import { ipcMain, dialog } from "electron";
import type { PluginInfo, PluginGrant, PluginSearchArgs } from "@shared/types/plugin";
import { pluginRegistry } from "@main/plugins/registry";
import { resolveUrl, invokeMenu } from "@main/plugins/router";
import { matchLyric, matchCover } from "@main/plugins/metadata";
import { searchPluginTracks } from "@main/plugins/search";
import { fetchScript, fetchMarket } from "@main/plugins/net";
import { broadcast } from "@main/utils/broadcast";
import { coreLog } from "@main/utils/logger";

/** 插件管理只接受主窗口主框架，远程网页不能导入或授权插件 */
const handle: typeof ipcMain.handle = (channel, listener) => {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
};

/**
 * 注册插件管理、搜索与音源调用的进程通信处理器
 */
export const registerPluginIpc = (): void => {
  handle("plugin:effects-state", () => audioEffectsState());
  handle("plugin:center-state", () => pluginCenterSession.unlocked);
  handle("plugin:center-enter", () => pluginCenterSession.enter());
  handle("plugin:center-reset", () => pluginCenterSession.reset());
  handle("plugin:restore-builtin", async () => {
    if (!pluginCenterSession.unlocked) throw new Error("插件中心未解锁");
    await pluginRegistry.restoreBuiltin();
  });
  handle(
    "plugin:setPermission",
    async (_event, id: string, grant: PluginGrant, enabled: boolean) => {
      await pluginRegistry.setPermission(id, grant, enabled);
    },
  );
  handle("plugin:list", async (_event, waitForPluginId?: string): Promise<PluginInfo[]> => {
    if (waitForPluginId) await pluginRegistry.getRuntime(waitForPluginId)?.initialLoad;
    return pluginRegistry.listInfo();
  });

  handle("plugin:install", async (_evt, filePath: string) => {
    try {
      const info = await pluginRegistry.install(filePath);
      return { ok: true, id: info.manifest.id };
    } catch (err) {
      coreLog.warn("[plugin] install failed:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 弹出原生文件选择框 → 安装选中的 .js 脚本
  // 注意：不要把主窗口作为 parent 传入，frameless 窗口 + 模态对话框会在 Windows 上卡死主窗
  handle("plugin:pickAndInstall", async () => {
    const res = await dialog.showOpenDialog({
      title: "导入插件",
      filters: [{ name: "Plugin Script", extensions: ["js", "zip"] }],
      properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, cancelled: true };
    try {
      const info = await pluginRegistry.install(res.filePaths[0]);
      return { ok: true, id: info.manifest.id };
    } catch (err) {
      coreLog.warn("[plugin] pickAndInstall failed:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 拉取插件市场索引
  handle("plugin:market", async () => {
    try {
      return { ok: true, plugins: await fetchMarket() };
    } catch (err) {
      coreLog.warn("[plugin] market fetch failed:", err);
      return { ok: false, plugins: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 从远端 URL 下载并安装
  handle("plugin:installFromUrl", async (_evt, url: string) => {
    try {
      const source = await fetchScript(url);
      const info = await pluginRegistry.installFromSource(source);
      return { ok: true, id: info.manifest.id };
    } catch (err) {
      coreLog.warn("[plugin] installFromUrl failed:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  handle("plugin:uninstall", async (_evt, id: string) => {
    try {
      await pluginRegistry.uninstall(id);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  handle("plugin:setEnabled", async (_evt, id: string, enabled: boolean) => {
    await pluginRegistry.setEnabled(id, enabled);
  });

  handle("plugin:setSetting", async (_event, id: string, key: string, value: unknown) => {
    await pluginRegistry.setSetting(id, key, value);
  });

  // 手动检查更新：拉 @updateUrl(raw .js) 读其 @version 与本地比对，有新版则置 updateInfo
  handle("plugin:checkUpdate", async (_evt, id: string) => {
    try {
      return await pluginRegistry.checkUpdate(id);
    } catch (err) {
      coreLog.warn("[plugin] checkUpdate failed:", err);
      return {
        ok: false,
        hasUpdate: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 一键更新：拉取 updateUrl(raw .js) 原地覆盖；失败回退到手动打开下载页
  handle("plugin:applyUpdate", async (_evt, id: string) => {
    const updateUrl = pluginRegistry.getUpdateUrl(id);
    if (!updateUrl) return { ok: false, error: "PLUGIN_NO_UPDATE_URL" };
    try {
      const source = await fetchScript(updateUrl);
      const plugin = await pluginRegistry.applyUpdateFromSource(id, source);
      return { ok: true, plugin };
    } catch (err) {
      coreLog.warn("[plugin] applyUpdate failed:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        fallbackUrl: updateUrl,
      };
    }
  });

  handle("plugin:search", (_event, args: PluginSearchArgs) => searchPluginTracks(args));

  handle("plugin:resolveUrl", async (_evt, args) => {
    return resolveUrl(args);
  });

  handle("plugin:invokeMenu", async (_evt, args) => {
    try {
      const res = await invokeMenu(args);
      return { ok: true, toast: res?.toast, openUrl: res?.openUrl, copyText: res?.copyText };
    } catch (err) {
      coreLog.warn("[plugin] invokeMenu failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 插件兜底匹配歌词：内置三平台拿不到时由渲染端逐个插件源调用
  handle("plugin:matchLyric", async (_evt, args) => {
    const data = await matchLyric(args);
    return data ? { ok: true, data } : { ok: false };
  });

  // 插件兜底匹配封面：曲目无封面时由渲染端逐个插件源调用
  handle("plugin:matchCover", async (_evt, args) => {
    const data = await matchCover(args);
    return data ? { ok: true, data } : { ok: false };
  });

  // 状态变化广播
  pluginRegistry.on("status", (info: PluginInfo) => {
    broadcast("plugin:status", info);
  });
};
