import { app, protocol } from "electron";
import { is } from "@electron-toolkit/utils";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { initUpdater } from "../updater";
import { initShortcut } from "../shortcut";
import { useLogger } from "../utils/logger";
import { initIpc } from "../ipc";
import { createWindow } from "./window";
import { initTray } from "../tray";
import { initSetting } from "./setting";
import { protocolScheme } from "@shared/meta";
import { registerAppHandlers } from "./app";
import { initAppConfig } from "./config";
import { pluginRegistry } from "../plugins/registry";
import { initMediaServices } from "../mediaServices";
import { taskbarLyricService } from "../services/taskbarLyric";
import { pluginIpcBridge } from "../services/pluginIpcBridge";
import { initSchoolService } from "../services/schoolService";

const log = useLogger("Main");

// 注册自定义协议
protocol.registerSchemesAsPrivileged([
  {
    scheme: protocolScheme,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const init = async (): Promise<void> => {
  await app.whenReady();

  // 初始化设置与插件
  await initSetting();
  void pluginRegistry.checkAllUpdates();

  // 注册自定义协议
  protocolScheme.forEach((scheme) => {
    protocol.registerFileProtocol(scheme, (request, callback) => {
      const url = request.url.substring(scheme.length + 3);
      callback({ path: url });
    });
  });

  // 初始化应用配置
  initAppConfig();
  electronApp.setAppUserModelId("top.imsyy.splayer-next");
  registerAppHandlers();

  // 创建并初始化窗口
  await initSchoolService();
  await createWindow();
  await initIpc();

  // 初始化插件 IPC 桥接（连接插件管理器与 WebContents 路由）
  pluginIpcBridge.init();
  // 初始化快捷键
  initShortcut();
  // 初始化系统托盘
  initTray();
  // 初始化更新程序
  initUpdater();
  // 初始化媒体服务
  await initMediaServices();
  // 初始化桌面歌词服务（在 IPC 注册后）
  await taskbarLyricService.init();

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on("activate", () => {
    void createWindow();
  });

  log.info("🚀 Main process initialized");
};

if (is.dev) {
  app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");
}

init().catch((error) => {
  log.error("Failed to initialize:", error);
  app.quit();
});
