import { ipcMain } from "electron";
import { assertTrustedSender } from "./trustedSender";
import { bilibiliCommand } from "@main/services/bilibiliBrowser";

/** 仅允许主应用主框架管理无特权的独立浏览器 */
export const registerBilibiliIpc = (): void => {
  ipcMain.handle("bilibili:command", (event, command: string, value?: unknown) => {
    assertTrustedSender(event);
    return bilibiliCommand(command, value);
  });
};
