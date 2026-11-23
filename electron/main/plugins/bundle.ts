import fs from "node:fs/promises";
import path from "node:path";
import { open, type Entry } from "yauzl";
import { pluginsDir } from "@main/utils/paths";
/**
 * 拒绝路径穿越、链接、盘符和平台相关的歧义路径
 * @param name - 压缩包相对路径
 */
export const validateAssetPath = (name: string): void => {
  if (
    !name ||
    name.length > 240 ||
    name.includes("\\") ||
    name.includes(":") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    name
      .split("/")
      .some(
        (v) =>
          [".", "..", ""].includes(v) ||
          /[. ]$/.test(v) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(v),
      )
  )
    throw new Error("插件包路径非法");
};
/**
 * 读取经过大小、路径和类型校验的插件包，校验完成前不写入磁盘
 * @param file - ZIP 文件
 * @returns 入口和资源
 */
export const readPluginBundle = (
  file: string,
): Promise<{ source: string; files: Map<string, Buffer> }> =>
  new Promise((resolve, reject) => {
    open(file, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error("插件包无法读取"));
        return;
      }
      const files = new Map<string, Buffer>();
      const names = new Set<string>();
      let bytes = 0;
      let count = 0;
      let failed = false;
      /** 关闭失败的包，不留下挂起的文件句柄 */
      const fail = (reason: unknown): void => {
        if (!failed) {
          failed = true;
          zip.close();
          reject(reason);
        }
      };
      zip.on("error", fail);
      zip.on("entry", (entry: Entry) => {
        try {
          if (++count > 256) throw new Error("插件包条目过多");
          const symlink = ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
          if (symlink) throw new Error("插件包不允许符号链接");
          if (entry.fileName.endsWith("/")) {
            validateAssetPath(entry.fileName.slice(0, -1));
            zip.readEntry();
            return;
          }
          validateAssetPath(entry.fileName);
          if (names.has(entry.fileName.toLowerCase())) throw new Error("插件包包含重复路径");
          names.add(entry.fileName.toLowerCase());
          bytes += entry.uncompressedSize;
          if (bytes > 32 * 1024 * 1024) throw new Error("插件包过大");
          zip.openReadStream(entry, (reason, stream) => {
            if (reason || !stream) {
              fail(reason ?? new Error("插件包读取失败"));
              return;
            }
            const parts: Buffer[] = [];
            let size = 0;
            stream.on("data", (part: Buffer) => {
              size += part.length;
              if (size > entry.uncompressedSize || size > 32 * 1024 * 1024) {
                stream.destroy();
                fail(new Error("插件包实际大小超限"));
                return;
              }
              parts.push(part);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              if (!failed) {
                files.set(entry.fileName, Buffer.concat(parts));
                zip.readEntry();
              }
            });
          });
        } catch (reason) {
          fail(reason);
        }
      });
      zip.on("end", () => {
        if (failed) return;
        try {
          const manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "null") as {
            entry: string;
          };
          if (!manifest || typeof manifest.entry !== "string") throw new Error("缺少插件清单");
          validateAssetPath(manifest.entry);
          const source = files.get(manifest.entry)?.toString("utf8");
          if (!source || source.length > 9_000_000) throw new Error("插件入口无效");
          resolve({ source, files });
        } catch (reason) {
          reject(reason);
        }
      });
      zip.readEntry();
    });
  });
/**
 * 安装已完全校验的资源，使用临时目录与原子替换
 * @param id - 经脚本元数据校验的插件标识
 * @param files - 有限资源
 */
export const installBundleAssets = async (
  id: string,
  files: Map<string, Buffer>,
): Promise<void> => {
  const root = path.join(pluginsDir, "packages");
  await fs.mkdir(root, { recursive: true });
  const target = path.join(root, encodeURIComponent(id));
  const staging = await fs.mkdtemp(path.join(root, ".install-"));
  const backup = target + ".previous";
  try {
    for (const [name, data] of files) {
      validateAssetPath(name);
      const file = path.join(staging, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, data);
    }
    await fs.rm(backup, { recursive: true, force: true });
    try {
      await fs.rename(target, backup);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    try {
      await fs.rename(staging, target);
    } catch (e) {
      await fs.rename(backup, target).catch(() => {});
      throw e;
    }
    await fs.rm(backup, { recursive: true, force: true });
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
};
/**
 * 读取插件自己的打包资源，不接受外部路径
 * @param id - 插件标识
 * @param name - 相对资源名
 */
export const readPluginAsset = async (id: string, name: string): Promise<Uint8Array> => {
  validateAssetPath(name);
  const file = path.join(pluginsDir, "packages", encodeURIComponent(id), name);
  const info = await fs.stat(file);
  if (info.size > 8 * 1024 * 1024) throw new Error("资源过大");
  return new Uint8Array(await fs.readFile(file));
};
