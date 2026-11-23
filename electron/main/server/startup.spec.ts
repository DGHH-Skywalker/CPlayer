import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: false,
  loadHono: vi.fn(),
  loadRoutes: vi.fn(),
  serve: vi.fn(),
  close: vi.fn(),
  closeAll: vi.fn(),
  closeWs: vi.fn(),
  terminate: vi.fn(),
}));
vi.mock("@main/store", () => ({
  store: {
    get: (key: string) =>
      key === "externalApi.enabled" ? mocks.enabled : key === "externalApi.port" ? 8124 : false,
  },
}));
vi.mock("@main/utils/logger", () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@main/utils/broadcast", () => ({ broadcast: vi.fn() }));
vi.mock("hono", () => {
  mocks.loadHono();
  return {
    Hono: class {
      use = vi.fn();
      route = vi.fn();
      get = vi.fn();
      fetch = vi.fn();
    },
  };
});
vi.mock("@hono/node-server", () => ({ serve: mocks.serve, upgradeWebSocket: vi.fn() }));
vi.mock("ws", () => ({
  WebSocketServer: class {
    clients = [{ terminate: mocks.terminate }];
    close = mocks.closeWs;
  },
}));
vi.mock("./routes", () => {
  mocks.loadRoutes();
  return { buildRoutes: vi.fn() };
});
vi.mock("./ws", () => ({ wsHandlers: {} }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.enabled = false;
  mocks.close.mockImplementation((done: () => void) => done());
  mocks.serve.mockImplementation(() => {
    const server = Object.assign(new EventEmitter(), {
      close: mocks.close,
      closeAllConnections: mocks.closeAll,
    });
    queueMicrotask(() => server.emit("listening"));
    return server;
  });
});
describe("外部 API 真正按需加载", () => {
  it("禁用时不载入 HTTP 框架或路由，状态查询保持轻量", async () => {
    const service = await import("./index");
    expect(service.getServerStatus().listening).toBe(false);
    await service.startServer();
    expect(mocks.loadHono).not.toHaveBeenCalled();
    expect(mocks.loadRoutes).not.toHaveBeenCalled();
    expect(mocks.serve).not.toHaveBeenCalled();
  });
  it("并发启动复用任务，关闭释放 HTTP 与 WebSocket", async () => {
    mocks.enabled = true;
    const service = await import("./index");
    const starting = service.startServer();
    expect(service.startServer()).toBe(starting);
    expect((await starting).listening).toBe(true);
    expect(mocks.serve).toHaveBeenCalledOnce();
    await service.stopServer();
    expect(service.getServerStatus().listening).toBe(false);
    expect(mocks.terminate).toHaveBeenCalledOnce();
    expect(mocks.closeAll).toHaveBeenCalledOnce();
  });
  it("加载途中停止不会迟到监听，重新启用以最后请求为准", async () => {
    mocks.enabled = true;
    const service = await import("./index");
    const first = service.startServer();
    const stop = service.stopServer();
    await first;
    await stop;
    expect(mocks.serve).not.toHaveBeenCalled();
    const second = service.startServer();
    const oldStop = service.stopServer();
    const latest = service.startServer();
    expect(second).toBe(latest);
    await oldStop;
    expect((await latest).listening).toBe(true);
    await service.stopServer();
  });
});
