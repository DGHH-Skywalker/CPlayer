import { ipcMain } from "electron";
import { assertTrustedSender } from "./trustedSender";
import { getSchoolScheduler } from "@main/services/school";
import type { SchoolConfig } from "@shared/types/school";

/** 注册学校配置、手动截止和可靠清理确认 */
export const registerSchoolIpc = (): void => {
  ipcMain.handle("school:get", (event) => {
    assertTrustedSender(event);
    return getSchoolScheduler().get();
  });
  ipcMain.handle("school:configure", (event, config: SchoolConfig) => {
    assertTrustedSender(event);
    return getSchoolScheduler().configure(config);
  });
  ipcMain.handle("school:endBreak", (event) => {
    assertTrustedSender(event);
    return getSchoolScheduler().endBreak();
  });
  ipcMain.handle("school:acknowledge", (event, id: string) => {
    assertTrustedSender(event);
    return getSchoolScheduler().acknowledge(id);
  });
};
