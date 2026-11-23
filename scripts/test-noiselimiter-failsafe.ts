import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { app, BrowserWindow, session } from "electron";
import { registerDynamics, removeDynamics } from "../electron/main/services/audioEffects";
import { DEFAULT_DYNAMICS } from "../shared/types/audioEffects";
import { BilikitLoader } from "../electron/main/services/bilikitLoader";
const missingResources = join(tmpdir(), `carbonv-missing-dsp-${Date.now()}`);
app.getAppPath = () => missingResources;
app.disableHardwareAcceleration();
setTimeout(() => app.exit(1), 15000).unref();
/** 真实浏览器验证资源缺失时原生 autoplay 也不能绕过保护 */
const run = async (): Promise<void> => {
  await app.whenReady();
  registerDynamics("fault", DEFAULT_DYNAMICS);
  const wav = Buffer.alloc(44 + 8000 * 4 * 2);
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
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < 32000; i++)
    wav.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / 8000) * 28000), 44 + i * 2);
  const source = `data:audio/wav;base64,${wav.toString("base64")}`;
  const dedicated = session.fromPartition(`failsafe-${Date.now()}`);
  await dedicated.protocol.handle(
    "https",
    () =>
      new Response(`<!doctype html><video autoplay src="${source}"></video>`, {
        headers: { "content-type": "text/html" },
      }),
  );
  const window = new BrowserWindow({
    show: true,
    webPreferences: {
      session: dedicated,
      autoplayPolicy: "no-user-gesture-required",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const wc = window.webContents;
  wc.setAudioMuted(true);
  await wc.loadURL("about:blank");
  const loader = new BilikitLoader(wc, () => {});
  await loader.install(false, false);
  await wc.loadURL("https://www.bilibili.com/fault");
  await new Promise((done) => setTimeout(done, 600));
  const blocked = await wc.executeJavaScript(
    "({protection:window.__carbonvDynamics.status(),paused:document.querySelector('video').paused,muted:document.querySelector('video').muted,time:document.querySelector('video').currentTime})",
  );
  assert.equal(blocked.protection.error, true);
  assert.equal(blocked.paused, true);
  assert.equal(blocked.muted, true);
  assert.equal(blocked.time, 0);
  assert.equal(
    await wc.executeJavaScript("document.querySelector('video').play().then(()=>false,()=>true)"),
    true,
  );
  await wc.executeJavaScript(
    `const audio=new Audio(${JSON.stringify(source)});audio.autoplay=true;document.body.append(audio);`,
  );
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(
    await wc.executeJavaScript(
      "[...document.querySelectorAll('video,audio')].every(v=>v.paused&&v.muted)",
    ),
    true,
  );
  removeDynamics("fault");
  await loader.updateAudioEffects();
  assert.equal(
    await wc.executeJavaScript("document.querySelector('video').paused"),
    true,
    "关闭保护不擅自恢复播放",
  );
  await wc.executeJavaScript("document.querySelector('video').play()", true);
  await new Promise((done) => setTimeout(done, 200));
  assert.equal(await wc.executeJavaScript("document.querySelector('video').paused"), false);
  assert.equal(await wc.executeJavaScript("document.querySelector('video').muted"), false);
  console.log(
    JSON.stringify({
      resourceFailureProtection: true,
      nativeAutoplayBlocked: blocked,
      dynamicMediaBlocked: true,
      explicitDisableRestores: true,
    }),
  );
  loader.dispose();
  window.destroy();
  app.quit();
};
void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
