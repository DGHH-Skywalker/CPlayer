import type { SchoolSnapshot } from "../shared/types/school";
import type { BilibiliState } from "../shared/types/bilibili";
interface DebugTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}
interface DebugClient {
  socket: WebSocket;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
interface Evaluation {
  exceptionDetails?: unknown;
  result: { value: unknown };
}
import assert from "node:assert/strict";
import { readdir, stat, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

/**
 * 连接实际便携版的本地调试端口
 * @returns 主应用页面调试目标
 */
const waitForPage = async (): Promise<DebugTarget> => {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const targets = (await fetch("http://127.0.0.1:9333/json/list", {
        signal: AbortSignal.timeout(1000),
      }).then((response) => response.json())) as DebugTarget[];
      const page = targets.find(
        (target) => target.type === "page" && target.url.startsWith("file:"),
      );
      if (page) return page;
    } catch {
      // 便携包解压及窗口创建尚未结束
    }
    await delay(1000);
  }
  throw new Error("便携版未在两分钟内启动主窗口");
};

/**
 * 打开本地 CDP 通道，按请求 ID 隔离响应
 * @param url - 本次便携版页面的调试地址
 * @returns 带有超时和清理的命令接口
 */
const connect = async (url: string): Promise<DebugClient> => {
  const socket = new WebSocket(url);
  await new Promise<void>((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let serial = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data)) as {
      id: number;
      error?: { message: string };
      result: unknown;
    };
    const receiver = pending.get(message.id);
    if (!receiver) return;
    if (message.error) receiver.reject(new Error(message.error.message));
    else receiver.resolve(message.result);
  });
  return {
    socket,
    /**
     * 执行页面命令，超时后移除待处理项
     * @param method - CDP 方法
     * @param params - 协议参数
     */
    async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
      const id = ++serial;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise((resolveRequest, reject) => {
          pending.set(id, { resolve: resolveRequest, reject });
          timer = setTimeout(() => reject(new Error(`CDP 超时: ${method}`)), 20000);
          socket.send(JSON.stringify({ id, method, params }));
        });
      } finally {
        clearTimeout(timer);
        pending.delete(id);
      }
    },
  };
};

/**
 * 在主应用主框架执行验证代码，直接测试受信 IPC
 * @param client - 本地 CDP 连接
 * @param expression - 测试表达式
 * @returns 可序列化执行结果
 */
const evaluate = async <T>(client: DebugClient, expression: string): Promise<T> => {
  const result = (await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as Evaluation;
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value as T;
};

assert.equal(process.platform, "win32", "此检查需要 Windows runner");
const portable = (await readdir("dist")).find((name) => name.endsWith("-portable.exe"));
assert.ok(portable, "缺少便携版 EXE");
for (const resource of [
  "bilikit/bilikit-core.user.js",
  "bilikit/manifest.json",
  "bilikit/LICENSE",
  "native/audio-engine.node",
]) {
  assert.ok((await stat(resolve("dist/win-unpacked/resources", resource))).size > 0);
}

const logFile = await open("dist/portable-smoke.log", "w");
const appProcess = spawn(resolve("dist", portable), ["--remote-debugging-port=9333"], {
  stdio: ["ignore", logFile.fd, logFile.fd],
});
let client: DebugClient | undefined;
try {
  const page = await waitForPage();
  client = await connect(page.webSocketDebuggerUrl);
  let snapshot: SchoolSnapshot | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    snapshot = await evaluate<SchoolSnapshot | null>(
      client,
      "window.api?.school ? window.api.school.get() : null",
    );
    if (snapshot) break;
    await delay(500);
  }
  assert.ok(snapshot, "预加载校园 API 不可用");
  assert.equal(snapshot.config.enabled, false);
  const locked = await evaluate<{ state: SchoolSnapshot; playback: { success: boolean } }>(
    client,
    `(async () => {
    const current = await window.api.school.get();
    const config = { ...current.config, enabled: true, scheduleEnabled: true, breaks: [], specialDates: {}, disabledDates: [] };
    await window.api.school.configure(config);
    const playback = await window.api.player.play();
    return { state: await window.api.school.get(), playback };
  })()`,
  );
  assert.equal(locked.state.phase, "CLASS");
  assert.equal(locked.playback.success, false);
  const browser = await evaluate<BilibiliState>(client, "window.api.bilibili.command('show')");
  assert.equal(browser.coreVersion, "0.5.35");
  await evaluate(client, "window.api.bilibili.command('hide')");
  const disabled = await evaluate<SchoolSnapshot>(
    client,
    `(async () => {
    const current = await window.api.school.get();
    return window.api.school.configure({ ...current.config, enabled: false, scheduleEnabled: false });
  })()`,
  );
  assert.equal(disabled.phase, "DISABLED");
  console.log(
    JSON.stringify({
      success: true,
      portable,
      renderer: page.url,
      packagedPreload: true,
      classGate: true,
      packagedCore: browser.coreVersion,
    }),
  );
  await evaluate(client, "window.api.window.quit()").catch(() => {});
} catch (error) {
  await logFile.sync();
  console.error((await readFile("dist/portable-smoke.log", "utf8")).slice(-10000));
  throw error;
} finally {
  client?.socket.close();
  if (appProcess.pid)
    spawnSync("taskkill", ["/PID", String(appProcess.pid), "/T", "/F"], { stdio: "ignore" });
  await logFile.close();
}
