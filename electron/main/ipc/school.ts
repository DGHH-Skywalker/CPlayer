import { ipcMain } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import type { SchoolCleanupAck, SchoolConfig } from "@shared/types/school";
import { getMainWindow } from "../core/window";
import { acknowledgeSchoolQueueCleanup } from "../services/schoolCleanupCoordinator";
import {
  exportSchoolSchedule,
  forceEndSchoolBreak,
  getSchoolConfig,
  getSchoolState,
  importSchoolSchedule,
  schoolRendererReady,
  setSchoolConfig,
} from "../services/schoolService";

const assertTrustedSender = (event: IpcMainInvokeEvent | IpcMainEvent): void => {
  const window = getMainWindow();
  if (
    !window ||
    window.isDestroyed() ||
    event.sender.id !== window.webContents.id ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error("校园控制仅接受主窗口主框架请求");
  }
};

export const registerSchoolIpc = (): void => {
  ipcMain.handle("school:get-state", (event) => {
    assertTrustedSender(event);
    return getSchoolState();
  });
  ipcMain.handle("school:get-config", (event) => {
    assertTrustedSender(event);
    return getSchoolConfig();
  });
  ipcMain.handle("school:set-config", (event, config: SchoolConfig) => {
    assertTrustedSender(event);
    return setSchoolConfig(config);
  });
  ipcMain.handle("school:force-end-break", (event) => {
    assertTrustedSender(event);
    return forceEndSchoolBreak();
  });
  ipcMain.handle("school:export", (event) => {
    assertTrustedSender(event);
    return exportSchoolSchedule();
  });
  ipcMain.handle("school:import", (event, source: string) => {
    assertTrustedSender(event);
    if (typeof source !== "string" || source.length > 1_000_000) {
      throw new Error("校园时间表内容无效");
    }
    return importSchoolSchedule(source);
  });
  ipcMain.handle("school:ready", (event) => {
    assertTrustedSender(event);
    return schoolRendererReady();
  });
  ipcMain.on("school:cleanup-ack", (event, ack: SchoolCleanupAck) => {
    assertTrustedSender(event);
    acknowledgeSchoolQueueCleanup(ack);
  });
};
