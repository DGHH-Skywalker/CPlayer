import { EventEmitter } from "node:events";
import { app, powerMonitor } from "electron";
import { store } from "@main/store";
import { sendToMain } from "@main/utils/broadcast";
import { coreLog } from "@main/utils/logger";
import { SchoolScheduler } from "./schoolScheduler";
import { installSchoolGate } from "./schoolPlaybackGate";
import { stopPlaybackCompletely, clearSchoolPresentation } from "@main/ipc/player";
import { defaultSchoolConfig } from "@shared/school/schedule";

export const schoolEvents = new EventEmitter();
let scheduler: SchoolScheduler;

/** 初始化主进程校园调度，必须早于窗口创建和历史恢复 */
export const initSchool = (): void => {
  scheduler = new SchoolScheduler(
    store.get("school") ?? structuredClone(defaultSchoolConfig),
    {
      now: Date.now,
      stop: (eventId) => {
        coreLog.info("校园强制停止", eventId);
        stopPlaybackCompletely();
        clearSchoolPresentation();
        schoolEvents.emit("cutoff");
      },
      publish: (snapshot) => {
        sendToMain("school:state", snapshot);
        schoolEvents.emit("configured");
      },
      persist: (snapshot) => {
        store.set("school", snapshot.config);
        store.set("schoolRuntime", {
          generation: snapshot.generation,
          pendingClear: snapshot.pendingClear,
          lastCleared: snapshot.lastCleared,
        });
        store.flushImmediate();
      },
    },
    store.get("schoolRuntime.generation") ?? 0,
  );
  installSchoolGate(() => scheduler.allowsPlayback());
  scheduler.start();
  powerMonitor.on("resume", () => scheduler.tick());
  powerMonitor.on("unlock-screen", () => scheduler.tick());
  app.on("browser-window-focus", () => scheduler.tick());
  app.once("before-quit", () => scheduler.dispose());
};

/** 返回唯一的主进程调度实例 */
export const getSchoolScheduler = (): SchoolScheduler => scheduler;
