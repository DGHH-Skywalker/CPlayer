import { app } from "electron";
import fs from "node:fs";
import { createHash } from "node:crypto";
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

/**
 * 只升级随 v1.4.0 分发的原始脚本，不覆盖用户改写的同名插件
 * @param source - 已安装的脚本文本
 * @returns 固定新版脚本，非原版则保持原安装
 */
export const upgradeBuiltinNoiseSource = (source: string): string | undefined => {
  const digest = createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
  return digest === "f657600ec028369e6c0ce4ca30eaffcadcf260a87d63bcf7b829c1588358fae4"
    ? builtinNoiseSource()
    : undefined;
};
