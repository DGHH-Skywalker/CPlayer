import path from "node:path";
import { app, powerMonitor } from "electron";
import type { BilibiliConfig, SchoolConfig, SchoolState } from "@shared/types/school";
import { getMainWindow } from "../core/window";
import { useLogger } from "../utils/logger";
import { CampusConfigStore } from "./campusConfigStore";
import { stopAllPlayback } from "./playbackShutdown";
import { configureSchoolPlaybackGate } from "./schoolPlaybackGate";
import { requestSchoolQueueCleanup } from "./schoolCleanupCoordinator";
import { SchoolScheduler } from "./schoolScheduler";

const log = useLogger("SchoolScheduler");
let store: CampusConfigStore | null = null;
let scheduler: SchoolScheduler | null = null;
let classMediaHook: () => void | Promise<void> = () => {};
let initialized = false;

const sendState = (state: SchoolState): void => {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) window.webContents.send("school:state", state);
};

export const registerSchoolClassMediaHook = (hook: () => void | Promise<void>): void => {
  classMediaHook = hook;
};

/** 初始化主进程配置和调度；上课锁定先于渲染层历史恢复。 */
export const initSchoolService = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;
  store = new CampusConfigStore(path.join(app.getPath("userData"), "campus-config.json"));
  await store.init();
  scheduler = new SchoolScheduler({
    getConfig: () => store!.getSchool(),
    onState: sendState,
    enforceClass: async (generation) => {
      await stopAllPlayback();
      await classMediaHook();
      await requestSchoolQueueCleanup(generation);
    },
    onBreak: (state) => {
      const window = getMainWindow();
      if (window && !window.isDestroyed()) window.webContents.send("school:break", state);
    },
    onError: (error) => log.error("上课强制清理未完成", error),
  });
  configureSchoolPlaybackGate(
    () => scheduler?.getState().phase ?? "TRANSITIONING",
    () => store?.getSchool().enabled ?? false,
  );
  powerMonitor.on("resume", () => void scheduler?.powerResumed());
  powerMonitor.on("unlock-screen", () => void scheduler?.powerResumed());
  await scheduler.init();
};

const requireStore = (): CampusConfigStore => {
  if (!store || !scheduler) throw new Error("校园服务尚未初始化");
  return store;
};

export const getSchoolState = (): SchoolState => {
  if (!scheduler) throw new Error("校园服务尚未初始化");
  return scheduler.getState();
};

export const getSchoolConfig = (): SchoolConfig => requireStore().getSchool();
export const getBilibiliConfig = (): BilibiliConfig => requireStore().getBilibili();

export const setSchoolConfig = async (config: SchoolConfig): Promise<SchoolState> => {
  await requireStore().setSchool(config);
  await scheduler!.configChanged();
  return getSchoolState();
};

export const setBilibiliConfig = async (config: BilibiliConfig): Promise<BilibiliConfig> => {
  return requireStore().setBilibili(config);
};

export const exportSchoolSchedule = (): string => requireStore().exportSchool();

export const importSchoolSchedule = async (source: string): Promise<SchoolState> => {
  await requireStore().importSchool(source);
  await scheduler!.configChanged();
  return getSchoolState();
};

export const forceEndSchoolBreak = async (): Promise<SchoolState> => {
  await scheduler?.forceEndBreak();
  return getSchoolState();
};

export const schoolRendererReady = async (): Promise<SchoolState> => {
  await scheduler?.reconcile();
  return getSchoolState();
};
