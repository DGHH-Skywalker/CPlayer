import { describe, expect, it, vi } from "vitest";
import { StartupFileMaintenance } from "./startupFiles";

describe("后台清理与新文件写入的屏障", () => {
  it("活动文件和预载租约不被清理，同名新任务等待旧删除完成", async () => {
    const cleaner = new StartupFileMaintenance((name) => name === "active");
    const remove = vi.fn();
    expect(await cleaner.run("active", remove)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    let finish!: () => void;
    const operation = cleaner.run(
      "old",
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const barrier = cleaner.pending("old");
    expect(barrier).toBeDefined();
    expect(cleaner.pending("other")).toBeUndefined();
    await Promise.resolve();
    let written = false;
    const write = barrier!.then(() => {
      written = true;
    });
    expect(written).toBe(false);
    finish();
    await operation;
    await write;
    expect(written).toBe(true);
    expect(cleaner.pending("old")).toBeUndefined();
  });

  it("退出后停止排队清理，失败不会留下永久屏障", async () => {
    const cleaner = new StartupFileMaintenance(() => false);
    await expect(
      cleaner.run("failed", async () => {
        throw new Error("denied");
      }),
    ).rejects.toThrow("denied");
    expect(cleaner.pending("failed")).toBeUndefined();
    cleaner.stop();
    expect(cleaner.disposed).toBe(true);
    const remove = vi.fn();
    expect(await cleaner.run("old", remove)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
