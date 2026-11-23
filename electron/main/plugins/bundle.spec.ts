import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZipFile } from "yazl";
vi.mock("@main/utils/paths", () => ({ pluginsDir: "/unused" }));
import { readPluginBundle, validateAssetPath } from "./bundle";
let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
/** 创建完整插件包验证入口与资源，无需安装或执行脚本 */
const bundle = async (entries: [string, string][]): Promise<string> => {
  directory = await mkdtemp(join(tmpdir(), "carbonv-plugin-"));
  const file = join(directory, "bundle.zip");
  const zip = new ZipFile();
  for (const [name, source] of entries) zip.addBuffer(Buffer.from(source), name);
  const chunks: Buffer[] = [];
  zip.outputStream.on("data", (data) => chunks.push(data));
  const ended = new Promise<void>((done) => zip.outputStream.on("end", done));
  zip.end();
  await ended;
  await writeFile(file, Buffer.concat(chunks));
  return file;
};
describe("插件包验证", () => {
  it("读取清单入口与独立资源", async () => {
    const file = await bundle([
      ["manifest.json", JSON.stringify({ entry: "plugin.js" })],
      ["plugin.js", "splayer.register({})"],
      ["assets/a.txt", "value"],
    ]);
    const result = await readPluginBundle(file);
    expect(result.source).toBe("splayer.register({})");
    expect(result.files.get("assets/a.txt")?.toString()).toBe("value");
  });
  it("拒绝无入口和 Windows 大小写冲突", async () => {
    const file = await bundle([
      ["manifest.json", JSON.stringify({ entry: "plugin.js" })],
      ["Plugin.js", "one"],
      ["plugin.js", "two"],
    ]);
    await expect(readPluginBundle(file)).rejects.toThrow("重复");
  });
  it.each(["../a", "/a", "a\\b", "C:/a", "a/../b", "a//b", "CON.txt", "a./file", "a /file"])(
    "拒绝危险路径 %s",
    (name) => expect(() => validateAssetPath(name)).toThrow(),
  );
});
