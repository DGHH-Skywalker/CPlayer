import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dialog = vi.hoisted(() => ({ showOpenDialog: vi.fn(), showSaveDialog: vi.fn() }));
vi.mock("electron", () => ({ dialog }));
import {
  pickPluginFile,
  readGrantedFile,
  writeGrantedFile,
  releasePluginFiles,
} from "./fileAccess";
let root: string | undefined;
afterEach(async () => {
  releasePluginFiles("test");
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = undefined;
  vi.restoreAllMocks();
});
describe("插件单文件会话授权", () => {
  it("用户选定的读凭据不能跨插件使用或写入", async () => {
    root = await fs.mkdtemp(join(tmpdir(), "carbonv-files-"));
    const path = join(root, "input.txt");
    await fs.writeFile(path, "music");
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] });
    const token = await pickPluginFile("test", "read", () => true);
    expect(token).toBeTruthy();
    expect(new TextDecoder().decode(await readGrantedFile("test", token!))).toBe("music");
    await expect(readGrantedFile("other", token!)).rejects.toThrow("未授权");
    await expect(writeGrantedFile("test", token!, new Uint8Array())).rejects.toThrow("未授权");
  });
  it("文件选择完成前失效的会话不能获得凭据", async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: "unused" });
    expect(await pickPluginFile("test", "write", () => false)).toBeNull();
  });
  it("异步写入中撤权不会覆盖用户文件", async () => {
    root = await fs.mkdtemp(join(tmpdir(), "carbonv-files-"));
    const path = join(root, "saved.txt");
    await fs.writeFile(path, "old");
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path });
    const token = await pickPluginFile("test", "write", () => true);
    const original = fs.writeFile.bind(fs);
    vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
      await original(...args);
      releasePluginFiles("test");
    });
    await expect(writeGrantedFile("test", token!, new TextEncoder().encode("new"))).rejects.toThrow(
      "失效",
    );
    expect(await fs.readFile(path, "utf8")).toBe("old");
    expect(await fs.readdir(root)).toEqual(["saved.txt"]);
  });
});
