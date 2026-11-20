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
  await main.loadURL("data:text/html,<input aria-label='搜索'>");
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
  const events: Array<{ state: string }> = [];
  const loader = new BilikitLoader(
    wc,
    () => {},
    (event) => events.push(event as { state: string }),
  );
  const core = process.env.CPLAYER_CORE_ENABLED !== "false";
  const noLogin = process.env.CPLAYER_NO_LOGIN !== "false";
  const { url } = parseBilibiliSong(
    process.env.BILIBILI_TEST_URL ?? "https://www.bilibili.com/video/BV1Y6We6jEPQ/",
  );
  const ending = process.env.CPLAYER_TEST_ENDING === "true";
  const token = "carbonv-live-ending";
  await loader.install(core, noLogin, ending ? { token, url, autoPlay: true } : null);
  try {
    await wc.loadURL(url);
  } catch (error) {
    if (
      (error as { code?: string }).code !== "ERR_ABORTED" ||
      parseBilibiliSong(wc.getURL()).id !== parseBilibiliSong(url).id
    )
      throw error;
  }
  let stable = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const decoded = await wc.executeJavaScript(
      "[...document.querySelectorAll('video')].some(v => v.readyState >= 2 && v.videoWidth > 0 && !v.paused && v.currentTime > 0)",
    );
    await wc.executeJavaScript(
      "document.querySelectorAll('video').forEach(v => { v.muted = true; void v.play().catch(() => {}); })",
      true,
    );
    // 避免把刚解码就被站点重建的播放器视为稳定播放
    stable = decoded ? stable + 1 : 0;
    if (stable >= 3) break;
    await new Promise((done) => setTimeout(done, 1000));
  }
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
    events,
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
  // 使用相同的原生遮挡操作验证真实站点不会因搜索焦点转移暂停
  const beforeFocus = await wc.executeJavaScript("document.querySelector('video').currentTime");
  wc.setBackgroundThrottling(false);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  main.webContents.focus();
  await main.webContents.executeJavaScript("document.querySelector('input').focus()");
  await new Promise((done) => setTimeout(done, 1000));
  const focus = await wc.executeJavaScript(
    "({paused:document.querySelector('video').paused,time:document.querySelector('video').currentTime,visibility:document.visibilityState,focused:document.hasFocus()})",
  );
  await writeFile(
    "test-results/bilibili-focus.json",
    JSON.stringify({ core, noLogin, beforeFocus, ...focus }, null, 2),
  );
  console.log(JSON.stringify({ focus, beforeFocus, core, noLogin }));
  assert.equal(focus.paused, false, "真实 B 站在搜索焦点转移后暂停");
  assert.equal(focus.visibility, "visible");
  assert.equal(focus.focused, false);
  assert.ok(focus.time > beforeFocus + 0.2, "搜索期间真实视频进度未继续");
  view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
  wc.setBackgroundThrottling(true);
  if (ending) {
    await wc.executeJavaScript(
      `(() => {
      const video = document.querySelector('video');
      window.__carbonvSongControl('seek', Math.max(0, video.duration * 1000 - 1500), ${JSON.stringify(token)});
      window.__carbonvSongControl('play', 0, ${JSON.stringify(token)});
    })()`,
      true,
    );
    for (let attempt = 0; attempt < 100 && !events.some((e) => e.state === "ended"); attempt++)
      await new Promise((done) => setTimeout(done, 500));
    // 覆盖站点常见的五秒自动续播倒计时
    await new Promise((done) => setTimeout(done, 6500));
    const final = await wc.executeJavaScript(
      "({url:location.href,videos:[...document.querySelectorAll('video')].map(v=>({paused:v.paused,ended:v.ended,time:v.currentTime,duration:v.duration}))})",
    );
    const endingReport = {
      timestamp: new Date().toISOString(),
      core,
      noLogin,
      ended: events.filter((e) => e.state === "ended").length,
      final,
    };
    await writeFile("test-results/bilibili-ending.json", JSON.stringify(endingReport, null, 2));
    await writeFile("test-results/bilibili-ending.png", (await wc.capturePage()).toPNG());
    console.log(JSON.stringify(endingReport));
    assert.equal(endingReport.ended, 1, "真实站点没有报告唯一结束");
    assert.equal(
      parseBilibiliSong(final.url).id,
      parseBilibiliSong(url).id,
      "真实站点自动跳转了下一首",
    );
    assert.ok(
      final.videos.every((v: { paused: boolean }) => v.paused),
      "结束后仍有网页视频在播放",
    );
  }
  loader.dispose();
  wc.close({ waitForBeforeUnload: false });
  main.destroy();
  app.quit();
};
void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
