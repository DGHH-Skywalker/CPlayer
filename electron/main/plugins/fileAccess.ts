import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dialog } from "electron";
const grants = new Map<string, Map<string, { path: string; mode: "read" | "write" }>>();
const choosing = new Set<string>();
/**
 * 通过用户选择获取单个文件的临时访问凭据
 * @param id - 插件标识
 * @param mode - 读取或保存
 * @param active - 会话与授权是否仍有效
 */
export const pickPluginFile = async (
  id: string,
  mode: "read" | "write",
  active: () => boolean,
): Promise<string | null> => {
  if (choosing.has(id)) throw new Error("文件选择尚未完成");
  choosing.add(id);
  try {
    const selected =
      mode === "read"
        ? await dialog
            .showOpenDialog({ properties: ["openFile"] })
            .then((v) => (v.canceled ? undefined : v.filePaths[0]))
        : await dialog.showSaveDialog({}).then((v) => (v.canceled ? undefined : v.filePath));
    if (!selected || !active()) return null;
    let own = grants.get(id);
    if (!own) {
      own = new Map();
      grants.set(id, own);
    }
    if (own.size >= 16) throw new Error("文件授权已达上限");
    const token = randomUUID();
    own.set(token, { path: selected, mode });
    return token;
  } finally {
    choosing.delete(id);
  }
};
/**
 * 读取用户为当前插件选择的文件
 * @param id - 插件标识
 * @param token - 本次插件会话的凭据
 */
export const readGrantedFile = async (id: string, token: string): Promise<Uint8Array> => {
  const file = grants.get(id)?.get(token);
  if (!file || file.mode !== "read") throw new Error("文件未授权");
  const handle = await fs.open(file.path, "r");
  try {
    if ((await handle.stat()).size > 8 * 1024 * 1024) throw new Error("文件过大");
    return new Uint8Array(await handle.readFile());
  } finally {
    await handle.close();
  }
};
/**
 * 写入用户明确选择的保存位置，写入前后均受会话控制
 * @param id - 插件标识
 * @param token - 保存凭据
 * @param value - 有限内容
 */
export const writeGrantedFile = async (
  id: string,
  token: string,
  value: Uint8Array,
): Promise<void> => {
  const file = grants.get(id)?.get(token);
  if (
    !file ||
    file.mode !== "write" ||
    !(value instanceof Uint8Array) ||
    value.byteLength > 8 * 1024 * 1024
  )
    throw new Error("文件写入未授权");
  const temporary = `${file.path}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, value, { flag: "wx" });
    if (grants.get(id)?.get(token) !== file) throw new Error("文件授权已失效");
    await fs.rename(temporary, file.path);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};
/**
 * 卸载或撤权时销毁本次会话的文件凭据
 * @param id - 插件标识
 */
export const releasePluginFiles = (id: string): void => {
  grants.delete(id);
};
