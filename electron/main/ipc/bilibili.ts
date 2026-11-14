import { ipcMain } from "electron";
import { assertTrustedSender } from "./trustedSender";
import {
  bilibiliCommand,
  currentBilibiliSong,
  playBilibiliSong,
  controlBilibiliSong,
} from "@main/services/bilibiliBrowser";

/** 仅允许主应用主框架管理无特权的独立浏览器 */
export const registerBilibiliIpc = (): void => {
  ipcMain.handle("bilibili:current-song", (event) => {
    assertTrustedSender(event);
    return currentBilibiliSong();
  });
  ipcMain.handle("bilibili:play-song", (event, track, token, autoPlay) => {
    assertTrustedSender(event);
    return playBilibiliSong(track, token, autoPlay === true);
  });
  ipcMain.handle("bilibili:control-song", (event, command, token, position) => {
    assertTrustedSender(event);
    return controlBilibiliSong(command, token, position);
  });
  ipcMain.handle("bilibili:command", (event, command: string, value?: unknown) => {
    assertTrustedSender(event);
    return bilibiliCommand(command, value);
  });
};
