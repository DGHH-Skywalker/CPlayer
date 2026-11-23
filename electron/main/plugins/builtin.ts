import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
export { NOISE_LIMITER_ID } from "@shared/types/audioEffects";
/** 读取固定打包插件，不从网络拉取可执行代码 */
export const builtinNoiseSource = (): string =>
  fs.readFileSync(
    path.join(
      app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "vendor"),
      "noiselimiter",
      "plugin.js",
    ),
    "utf8",
  );
