import { describe, expect, it, vi } from "vitest";
import { runStartupTasks } from "./startupTasks";

describe("分阶段后台启动", () => {
  it("每项先归还事件循环，等待前项完成再启动下一项", async () => {
    const calls: string[] = [];
    let finish!: () => void;
    const started = runStartupTasks(
      [
        {
          name: "first",
          run: () => {
            calls.push("first");
            return new Promise<void>((done) => {
              finish = done;
            });
          },
        },
        {
          name: "second",
          run: () => {
            calls.push("second");
          },
        },
      ],
      () => false,
      vi.fn(),
    );
    expect(calls).toEqual([]);
    await new Promise<void>((done) => setImmediate(done));
    expect(calls).toEqual(["first"]);
    finish();
    await started;
    expect(calls).toEqual(["first", "second"]);
  });

  it("单项失败继续后续工作，退出后不再执行排队任务", async () => {
    let quitting = false;
    const failed = vi.fn();
    const never = vi.fn();
    await runStartupTasks(
      [
        {
          name: "failure",
          run: () => {
            throw new Error("broken");
          },
        },
        {
          name: "quit",
          run: () => {
            quitting = true;
          },
        },
        { name: "never", run: never },
      ],
      () => quitting,
      failed,
    );
    expect(failed).toHaveBeenCalledWith("failure", expect.any(Error));
    expect(never).not.toHaveBeenCalled();
  });
});
