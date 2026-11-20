import assert from "node:assert/strict";
import { app, BrowserWindow, WebContentsView, session } from "electron";
import { BilikitLoader } from "../electron/main/services/bilikitLoader";
import { biliSongBootstrap } from "../electron/main/services/bilibiliSongPage";
import { BilibiliSongButton } from "../electron/main/services/bilibiliSongButton";
import { bilibiliBounds } from "../electron/main/services/bilibiliPolicy";

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
    if (["/tone.wav", "/focus.wav"].includes(url.pathname)) {
      const frames = url.pathname === "/focus.wav" ? 80000 : 8000;
      const wav = Buffer.alloc(44 + frames * 2);
      wav.write("RIFF");
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24);
      wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(frames * 2, 40);
      return new Response(wav, { headers: { "content-type": "audio/wav" } });
    }
    if (url.pathname === "/focus")
      return new Response(
        `<!doctype html><video src="/focus.wav" autoplay muted loop></video><script>document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelector('video').pause()})</script>`,
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname.startsWith("/video/"))
      return new Response(
        `<!doctype html><video id="mv" src="/tone.wav" muted loop></video><script>
          window.siteNext = 0; window.siteAttempts = 0;
          const video = document.querySelector('video');
          video.loop = true; video.setAttribute('loop', '');
          window.addEventListener('ended', () => { window.siteNext++; history.pushState({}, '', '/video/BV1wHWe68Eh3/?p=2'); video.play().catch(() => {}); }, true);
          video.addEventListener('timeupdate', () => {
            video.loop = true;
            const mode = new URLSearchParams(location.search).get('test');
            if (mode && !window.siteAttempts && video.currentTime > (mode === 'early-rebuild' ? .3 : .85)) {
              window.siteAttempts++;
              video.remove();
              const next = document.createElement('video'); next.muted = true; next.src = '/tone.wav?next'; document.body.append(next);
              next.addEventListener('playing', () => window.siteNext++);
              next.play().catch(() => {});
            }
          });
        </script>`,
        { headers: { "content-type": "text/html" } },
      );
    const content =
      url.pathname === "/child"
        ? "<script>window.earlyChild = !!globalThis.__carbonv_core_document_start__</script>"
        : `<!doctype html><html><head><script>window.coreAtFirstScript = !!globalThis.__carbonv_core_document_start__; window.noLoginAtFirstScript = JSON.parse(localStorage.getItem('bilikit:settings') || '{}')['module.no-login.enabled'];</script></head><body><h1>Electron document-start fixture</h1><iframe src="https://player.bilibili.com/child"></iframe><iframe src="https://www.bilibili.com/child"></iframe><iframe src="https://fixture.invalid/child"></iframe></body></html>`;
    return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  const window = new BrowserWindow({ show: false, width: 1100, height: 760 });
  await window.loadURL(
    "data:text/html,<style>body{margin:0;background:rgb(18,24,36)}</style><input aria-label='搜索'><footer style='position:fixed;bottom:0;height:80px;width:100%;background:rgb(60,90,160)'>Cplayer player controls</footer>",
  );
  const view = new WebContentsView({
    webPreferences: {
      session: dedicated,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1100, height: 760 });
  const wc = view.webContents;
  for (const zoom of [1, 1.25, 1.5]) {
    window.webContents.setZoomFactor(zoom);
    await new Promise((done) => setTimeout(done, 20));
    const desired = bilibiliBounds(
      { x: 200, y: 100, width: 900, height: 660 },
      zoom,
      window.getContentSize(),
    );
    view.setBounds(desired);
    assert.deepEqual(view.getBounds(), desired);
    const size = window.getContentSize();
    assert.ok(desired.x + desired.width <= size[0] && desired.y + desired.height <= size[1]);
  }
  window.webContents.setZoomFactor(1);
  await wc.loadURL("about:blank");
  const songEvents: Array<{ state: string }> = [];
  const loader = new BilikitLoader(
    wc,
    () => {},
    (event) => {
      songEvents.push(event as { state: string });
      const value = event as { state: string; token: string };
      if (value.state === "loading")
        void wc
          .executeJavaScript(
            `window.__carbonvSongControl('play', 0, ${JSON.stringify(value.token)})`,
            true,
          )
          .catch(() => {});
    },
  );
  console.log("注册 document-start");
  await loader.install(true, false);
  console.log("加载测试文档");
  await wc.loadURL("https://www.bilibili.com/test");
  const dpi = await wc.executeJavaScript("devicePixelRatio");
  if (process.env.CPLAYER_TEST_DPI)
    assert.ok(Math.abs(dpi - Number(process.env.CPLAYER_TEST_DPI)) < 0.05);
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
  const song = {
    token: "fixture-song",
    url: "https://www.bilibili.com/video/BV1wHWe68Eh3/",
    autoPlay: true,
  };
  window.show();
  wc.focus();
  // 弹窗只遮住画面，焦点转移与零尺寸都不能让站点收到隐藏或暂停
  await loader.install(false, false);
  await wc.loadURL("https://www.bilibili.com/focus");
  await wc.executeJavaScript("document.querySelector('video').play()", true);
  await new Promise((done) => setTimeout(done, 200));
  const beforeFocus = await wc.executeJavaScript("document.querySelector('video').currentTime");
  wc.setBackgroundThrottling(false);
  view.setBounds({ x: 200, y: 100, width: 0, height: 0 });
  window.webContents.focus();
  await window.webContents.executeJavaScript("document.querySelector('input').focus()");
  await new Promise((done) => setTimeout(done, 600));
  const afterFocus = await wc.executeJavaScript(
    "({paused:document.querySelector('video').paused,time:document.querySelector('video').currentTime,visibility:document.visibilityState,focused:document.hasFocus()})",
  );
  console.log("搜索遮挡后的实际媒体状态", { beforeFocus, afterFocus });
  assert.equal(afterFocus.paused, false);
  assert.equal(afterFocus.visibility, "visible");
  assert.equal(afterFocus.focused, false);
  assert.ok(afterFocus.time > beforeFocus + 0.2);
  await wc.executeJavaScript("document.querySelector('video').pause()");
  view.setBounds({ x: 200, y: 100, width: 800, height: 500 });
  wc.setBackgroundThrottling(true);
  assert.equal(await wc.executeJavaScript("document.querySelector('video').paused"), true);
  console.log("搜索焦点、弹窗遮挡时持续播放与手动暂停验证通过");
  // 原生结束、window 捕获抢占、循环和结束前播放器重建均必须只推进一次
  for (const mode of ["", "late-rebuild", "early-rebuild"]) {
    songEvents.length = 0;
    const current = {
      ...song,
      token: `fixture-${mode}`,
      url: song.url + (mode ? `?test=${mode}` : ""),
    };
    new Function(biliSongBootstrap(current));
    await loader.install(false, false, current);
    await wc.loadURL(current.url);
    await wc.executeJavaScript(
      `window.__carbonvSongControl('play', 0, ${JSON.stringify(current.token)})`,
      true,
    );
    for (let attempt = 0; attempt < 70 && !songEvents.some((e) => e.state === "ended"); attempt++)
      await new Promise((done) => setTimeout(done, 100));
    if (!songEvents.some((e) => e.state === "ended"))
      console.log(
        "未结束样本",
        mode,
        songEvents,
        await wc.executeJavaScript(
          "[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,duration:v.duration,paused:v.paused,ended:v.ended,ready:v.readyState,error:v.error?.message}))",
        ),
      );
    assert.equal(
      songEvents.filter((e) => e.state === "ended").length,
      1,
      `未收到唯一结束事件: ${mode}`,
    );
    assert.equal(await wc.executeJavaScript("window.siteNext"), mode === "early-rebuild" ? 1 : 0);
    assert.equal(wc.getURL(), current.url);
    assert.equal(
      await wc.executeJavaScript(
        "document.querySelector('video').play().then(() => false, () => true)",
      ),
      true,
    );
    console.log(`哔哩Song 循环、window 捕获与播放器重建验证通过: ${mode || "natural"}`);
  }
  // 原生本地按钮在远程视图之上，不向网页提供任何特权 API
  let requested = 0;
  const button = new BilibiliSongButton(window, () => {
    requested++;
  });
  const ready = new Promise<void>((done) =>
    button.view.webContents.once("did-finish-load", () => done()),
  );
  button.update({ x: 200, y: 64, width: 800, height: 500 }, true, true);
  await ready;
  for (const zoom of [1, 1.25, 1.5]) {
    window.webContents.setZoomFactor(zoom);
    await new Promise((done) => setTimeout(done, 20));
    button.update({ x: 200, y: 64, width: 800, height: 500 }, true, true);
    const b = button.view.getBounds();
    assert.ok(b.y + b.height <= 565 - Math.round(16 * zoom), JSON.stringify({ zoom, b }));
    assert.equal(button.view.webContents.getZoomFactor(), zoom);
  }
  window.webContents.setZoomFactor(1);
  button.update({ x: 200, y: 64, width: 800, height: 500 }, true, true);
  assert.equal(window.contentView.children.at(-1), button.view);
  assert.ok(button.view.getBounds().y + button.view.getBounds().height < 564);
  assert.equal(await button.view.webContents.executeJavaScript("typeof window.api"), "undefined");
  await button.view.webContents.executeJavaScript("document.querySelector('button').click()");
  assert.equal(requested, 0);
  window.show();
  button.view.webContents.focus();
  button.view.webContents.sendInputEvent({
    type: "mouseDown",
    x: 20,
    y: 20,
    button: "left",
    clickCount: 1,
  });
  button.view.webContents.sendInputEvent({
    type: "mouseUp",
    x: 20,
    y: 20,
    button: "left",
    clickCount: 1,
  });
  await new Promise((done) => setTimeout(done, 100));
  assert.equal(requested, 1);
  button.update({ x: 200, y: 64, width: 800, height: 500 }, true, false);
  button.view.webContents.sendInputEvent({
    type: "mouseDown",
    x: 20,
    y: 20,
    button: "left",
    clickCount: 1,
  });
  button.view.webContents.sendInputEvent({
    type: "mouseUp",
    x: 20,
    y: 20,
    button: "left",
    clickCount: 1,
  });
  await new Promise((done) => setTimeout(done, 100));
  assert.equal(requested, 1);
  button.dispose();
  window.hide();
  console.log("本地悬浮按钮层级、真实点击与上课禁用验证通过");
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
      dpi,
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
