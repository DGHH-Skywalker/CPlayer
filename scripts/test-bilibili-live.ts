import assert from "node:assert/strict";
import { app, BrowserWindow, WebContentsView, session } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { BilikitLoader } from "../electron/main/services/bilikitLoader";
import { parseBilibiliSong } from "../shared/bilibiliSong";

app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
setTimeout(() => app.exit(2), 120_000).unref();

/** 在全新匿名会话验证真实网站解码，结果不包含 Cookie 内容 */
const run = async (): Promise<void> => {
  await app.whenReady();
  const dedicated = session.fromPartition(`carbonv-live-${Date.now()}`);
  if (process.env.HTTPS_PROXY) await dedicated.setProxy({ proxyRules: process.env.HTTPS_PROXY });
  const main = new BrowserWindow({ show: true, width: 1280, height: 800 });
  const view = new WebContentsView({
    webPreferences: {
      session: dedicated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  main.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
  const wc = view.webContents;
  wc.setUserAgent(
    wc.getUserAgent().replace(/\s(?:Electron|Cplayer|carbonv_player|CarbonVPlayer)\/[^\s]+/gi, ""),
  );
  wc.setAudioMuted(true);
  await wc.loadURL("about:blank");
  const loader = new BilikitLoader(wc, () => {});
  const core = process.env.CPLAYER_CORE_ENABLED !== "false";
  const noLogin = process.env.CPLAYER_NO_LOGIN !== "false";
  await loader.install(core, noLogin);
  const { url } = parseBilibiliSong(
    process.env.BILIBILI_TEST_URL ?? "https://www.bilibili.com/video/BV1Y6We6jEPQ/",
  );
  await wc.loadURL(url);
  for (let attempt = 0; attempt < 60; attempt++) {
    const decoded = await wc.executeJavaScript(
      "[...document.querySelectorAll('video')].some(v => v.readyState >= 2 && v.videoWidth > 0)",
    );
    await wc.executeJavaScript(
      "document.querySelectorAll('video').forEach(v => { v.muted = true; void v.play().catch(() => {}); })",
      true,
    );
    if (decoded) break;
    await new Promise((done) => setTimeout(done, 1000));
  }
  await new Promise((done) => setTimeout(done, 2000));
  const result = await wc.executeJavaScript(
    "({ url: location.href, title: document.title, node: typeof require, early: !!globalThis.__carbonv_core_document_start__, videos: [...document.querySelectorAll('video')].map(v => ({width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,paused:v.paused,time:v.currentTime,error:v.error?.code})) })",
  );
  const loggedIn = (await dedicated.cookies.get({ name: "SESSDATA" })).length > 0;
  const report = {
    timestamp: new Date().toISOString(),
    electron: process.versions.electron,
    core,
    noLogin,
    version: loader.version,
    loggedIn,
    result,
  };
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/bilibili-live.json", JSON.stringify(report, null, 2));
  await writeFile("test-results/bilibili-live.png", (await wc.capturePage()).toPNG());
  console.log(JSON.stringify(report));
  assert.equal(loggedIn, false);
  assert.equal(result.node, "undefined");
  assert.ok(
    result.videos.some(
      (v: { width: number; height: number; readyState: number; paused: boolean; time: number }) =>
        v.width > 0 && v.readyState >= 2 && !v.paused && v.time > 0,
    ),
    "真实网站未解码播放，详见 test-results",
  );
  if (core && noLogin)
    assert.ok(
      result.videos.some((v: { height: number }) => v.height >= 1080),
      "所测视频没有达到 1080P",
    );
  loader.dispose();
  wc.close({ waitForBeforeUnload: false });
  main.destroy();
  app.quit();
};
void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
