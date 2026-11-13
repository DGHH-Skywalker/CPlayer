import { ipcRenderer } from "electron";
import type {
  SchoolCleanupAck,
  SchoolConfig,
  SchoolState,
} from "../../shared/types/school";

const subscribe = <T>(channel: string, callback: (data: T) => void): (() => void) => {
  ipcRenderer.removeAllListeners(channel);
  const handler = (_event: Electron.IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

export const schoolApi = {
  getState: (): Promise<SchoolState> => ipcRenderer.invoke("school:get-state"),
  getConfig: (): Promise<SchoolConfig> => ipcRenderer.invoke("school:get-config"),
  setConfig: (config: SchoolConfig): Promise<SchoolState> =>
    ipcRenderer.invoke("school:set-config", config),
  forceEndBreak: (): Promise<SchoolState> => ipcRenderer.invoke("school:force-end-break"),
  exportSchedule: (): Promise<string> => ipcRenderer.invoke("school:export"),
  importSchedule: (source: string): Promise<SchoolState> =>
    ipcRenderer.invoke("school:import", source),
  ready: (): Promise<SchoolState> => ipcRenderer.invoke("school:ready"),
  ackCleanup: (ack: SchoolCleanupAck): void => ipcRenderer.send("school:cleanup-ack", ack),
  onState: (callback: (state: SchoolState) => void): (() => void) =>
    subscribe("school:state", callback),
  onForceCleanup: (callback: (data: { generation: number }) => void): (() => void) =>
    subscribe("school:force-cleanup", callback),
  onBreak: (callback: (state: SchoolState) => void): (() => void) =>
    subscribe("school:break", callback),
};
