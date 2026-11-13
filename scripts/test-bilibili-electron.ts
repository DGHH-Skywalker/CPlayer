import assert from "node:assert/strict";
import { app, BrowserWindow, WebContentsView, session } from "electron";
import { BilikitLoader } from "../electron/main/services/bilikitLoader";

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("site-per-process");
app.on("window-all-closed", () => {});
setTimeout(() => {
  console.error("Electron smoke timeout");
  app.exit(1);
}, 45_000).unref();

/** 使用真实 Electron 运行早期主世界注入、子域和独立存储测试 */
const run = async (): Promise<void> => {
  console.log("等待 Electron ready");
  await app.whenReady();
  console.log("Electron ready");
  const dedicated = session.fromPartition(`carbonv-test-${Date.now()}`);
  const untouched = session.fromPartition(`carbonv-other-${Date.now()}`);
  await untouched.cookies.set({
    url: "https://www.bilibili.com",
    name: "keep",
    value: "main-session",
  });
  await dedicated.protocol.handle("https", (request) => {
    const url = new URL(request.url);
    const content =
      url.pathname === "/child"
        ? "<script>window.earlyChild = !!globalThis.__carbonv_core_document_start__</script>"
        : `<!doctype html><html><head><script>window.coreAtFirstScript = !!globalThis.__carbonv_core_document_start__; window.noLoginAtFirstScript = JSON.parse(localStorage.getItem('bilikit:settings') || '{}')['module.no-login.enabled'];</script></head><body><h1>Electron document-start fixture</h1><iframe src="https://player.bilibili.com/child"></iframe><iframe src="https://www.bilibili.com/child"></iframe><iframe src="https://fixture.invalid/child"></iframe></body></html>`;
    return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  const window = new BrowserWindow({ show: false, width: 1100, height: 760 });
  const view = new WebContentsView({
    webPreferences: {
      session: dedicated,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1100, height: 760 });
  const wc = view.webContents;
  await wc.loadURL("about:blank");
  const loader = new BilikitLoader(wc, () => {});
  console.log("注册 document-start");
  await loader.install(true, false);
  console.log("加载测试文档");
  await wc.loadURL("https://www.bilibili.com/test");
  const result = await wc.executeJavaScript(
    `({ early: !!window.coreAtFirstScript, noLogin: window.noLoginAtFirstScript, node: typeof require, alive: localStorage.getItem('bilikit:alive.core'), frameCount: frames.length, sameFrameEarly: !!frames[1].earlyChild })`,
  );
  assert.equal(result.early, true);
  assert.equal(result.noLogin, false);
  assert.equal(result.node, "undefined");
  assert.equal(result.sameFrameEarly, true);
  assert.equal(loader.loaded, true);
  const frames = wc.mainFrame.frames;
  const cross = frames.find((f) => f.url.startsWith("https://player.bilibili.com"))!;
  assert.equal(await cross.executeJavaScript("window.earlyChild"), true);
  const foreign = frames.find((f) => f.url.startsWith("https://fixture.invalid"))!;
  assert.notEqual(foreign.processId, wc.mainFrame.processId);
  assert.equal(await foreign.executeJavaScript("window.earlyChild"), false);
  console.log("子域与跨进程框架的主世界注入、域名过滤验证通过");
  await wc.loadURL("https://search.bilibili.com/test");
  assert.equal(await wc.executeJavaScript("!!window.coreAtFirstScript"), true);
  await loader.install(true, true);
  await wc.loadURL("https://www.bilibili.com/next");
  assert.equal(await wc.executeJavaScript("window.noLoginAtFirstScript"), true);
  await wc.executeJavaScript("history.pushState({}, '', '/spa');");
  assert.equal(await wc.executeJavaScript("!!window.coreAtFirstScript"), true);
  await loader.install(false, false);
  await wc.loadURL("about:blank");
  console.log("关闭旧文档后清理测试存储");
  await dedicated.clearStorageData();
  await wc.loadURL("https://www.bilibili.com/test");
  assert.equal(await wc.executeJavaScript("!!window.coreAtFirstScript"), false);
  await dedicated.cookies.set({
    url: "https://www.bilibili.com",
    name: "SESSDATA",
    value: "fixture",
  });
  loader.dispose();
  window.contentView.removeChildView(view);
  wc.close({ waitForBeforeUnload: false });
  window.destroy();
  console.log("销毁视图后清理独立 Session");
  await dedicated.clearData();
  await dedicated.clearCache();
  assert.equal((await dedicated.cookies.get({})).length, 0);
  assert.equal((await untouched.cookies.get({ name: "keep" }))[0].value, "main-session");
  console.log(
    JSON.stringify({
      success: true,
      electron: process.versions.electron,
      core: loader.version,
      fixture: result,
      sessionIsolated: true,
      cleanupIsolated: true,
      metrics: app
        .getAppMetrics()
        .map((m) => ({ type: m.type, memoryKB: m.memory.workingSetSize })),
    }),
  );
  app.quit();
};
void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
