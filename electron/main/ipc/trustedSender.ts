import type { IpcMainInvokeEvent } from "electron";
import { getMainWindow } from "@main/window";

/**
 * 仅接受主窗口主框架的命令，远程 WebContentsView 无法使用管理 IPC
 * @param event - IPC 来源
 */
export const assertTrustedSender = (event: IpcMainInvokeEvent): void => {
  const main = getMainWindow()?.webContents;
  if (!main || event.sender !== main || event.senderFrame !== main.mainFrame)
    throw new Error("不受信的 IPC 来源");
};
