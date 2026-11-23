import { app } from "electron";
import { join } from "node:path";

/**
 * 按应用根目录定位构建入口与公共资源，不依赖调用模块被拆分到哪个 chunk
 * @param segments - 相对项目根目录或 app.asar 的路径片段
 * @returns 开发和打包环境均可使用的绝对路径
 */
export const appFile = (...segments: string[]): string => join(app.getAppPath(), ...segments);
