import { CURRENT_AGREEMENT_VERSION } from "../shared/constants/agreement";
import type { SchoolSnapshot } from "../shared/types/school";
import type { BilibiliState } from "../shared/types/bilibili";
interface DebugTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}
interface DebugClient {
  socket: WebSocket;
  onEvent(method: string, callback: (params: Record<string, unknown>) => void): () => void;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
interface Evaluation {
  exceptionDetails?: unknown;
  result: { value: unknown };
}
import assert from "node:assert/strict";
import { readdir, stat, open, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

/**
 * 连接实际便携版的本地调试端口
 * @param kind - 主应用或独立 B 站页面
 * @returns 主应用页面调试目标
 */
const waitForPage = async (kind: "main" | "bilibili" = "main"): Promise<DebugTarget> => {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const targets = (await fetch("http://127.0.0.1:9333/json/list", {
        signal: AbortSignal.timeout(1000),
      }).then((response) => response.json())) as DebugTarget[];
      const page = targets.find(
        (target) =>
          target.type === "page" &&
          (kind === "main"
            ? target.url.startsWith("file:")
            : target.url.startsWith("https://search.bilibili.com/")),
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
  const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  let serial = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data)) as {
      id: number;
      method?: string;
      params?: Record<string, unknown>;
      error?: { message: string };
      result: unknown;
    };
    if (message.method)
      for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
    const receiver = pending.get(message.id);
    if (!receiver) return;
    if (message.error) receiver.reject(new Error(message.error.message));
    else receiver.resolve(message.result);
  });
  return {
    socket,
    /** 监听调试器实际解析事件，避免 file 协议 Performance Resource Timing 缺失 */
    onEvent(method, callback) {
      let callbacks = listeners.get(method);
      if (!callbacks) {
        callbacks = new Set();
        listeners.set(method, callbacks);
      }
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
        if (!callbacks.size) listeners.delete(method);
      };
    },
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
    userGesture: true,
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
  "noiselimiter/plugin.js",
  "noiselimiter/dynamics.wasm",
  "noiselimiter/manifest.json",
]) {
  assert.ok((await stat(resolve("dist/win-unpacked/resources", resource))).size > 0);
}

const configDirectory = resolve("dist/UserData/app-data/config");
await mkdir(configDirectory, { recursive: true });
await writeFile(
  resolve(configDirectory, "settings.json"),
  JSON.stringify({
    system: { onboardingCompleted: true, agreedAgreementVersion: CURRENT_AGREEMENT_VERSION },
  }),
);
const logFile = await open("dist/portable-smoke.log", "w");
const appProcess = spawn(resolve("dist", portable), ["--remote-debugging-port=9333"], {
  stdio: ["ignore", logFile.fd, logFile.fd],
});
let client: DebugClient | undefined;
let browserClient: DebugClient | undefined;
let nativeAudio: { verified: boolean; reason?: string } = {
  verified: false,
  reason: "尚未检查输出设备",
};
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
  for (let i = 0; i < 200; i++) {
    if (
      await evaluate(
        client,
        "!document.getElementById('app-loading') && !!document.querySelector('.player-shell')",
      )
    )
      break;
    await delay(100);
  }
  assert.equal(
    await evaluate(
      client,
      "!document.getElementById('app-loading') && !!document.querySelector('.player-shell')",
    ),
    true,
    "核心播放器与首页未就绪",
  );
  const startup = await evaluate<{
    marks: Array<{ name: string; startTime: number }>;
    scripts: string[];
  }>(
    client,
    `({marks:performance.getEntriesByType('mark').filter(e=>e.name.startsWith('carbonv:')).map(e=>({name:e.name,startTime:e.startTime})),scripts:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.endsWith('.js'))})`,
  );
  const parsedScripts: string[] = [];
  const offParsed = client.onEvent("Debugger.scriptParsed", (params) => {
    if (typeof params.url === "string" && /\/out\/renderer\/assets\/[^/]+\.js$/.test(params.url))
      parsedScripts.push(params.url);
  });
  await client.send("Debugger.enable");
  startup.scripts = [...new Set(parsedScripts)];
  await client.send("Debugger.disable");
  offParsed();
  assert.ok(startup.scripts.length > 0, "未捕获实际首屏JS模块，不能判定懒加载");
  assert.ok(startup.marks.some((m) => m.name === "carbonv:player-ready"));
  assert.ok(startup.marks.some((m) => m.name === "carbonv:startup-complete"));
  assert.ok(
    !startup.scripts.some((n) =>
      /\/(SettingsContent|SchoolControlCenter|PluginCenter|FullPlayer|Bilibili-|Stats-|Library-)/.test(
        n,
      ),
    ),
    "未打开页面进入启动加载集合",
  );
  await writeFile("dist/startup-acceptance.json", JSON.stringify(startup, null, 2));

  assert.equal(await evaluate(client, "window.api.plugins.centerState()"), false);
  const probePath = resolve("dist/plugin-probe.js");
  await writeFile(
    probePath,
    `/**
 * @id carbonv.acceptance
 * @name Acceptance
 * @version 1.0.0
 * @apiLevel 6
 * @grant ui,settings
 */
cplayer.register({});
cplayer.settings.get('player.autoPlay').then(v=>cplayer.settings.set('player.autoPlay',v)).then(()=>cplayer.ui.openSettings('general'));`,
  );
  const probe = await evaluate<{ ok: boolean }>(
    client,
    `window.api.plugins.install(${JSON.stringify(probePath)})`,
  );
  assert.equal(probe.ok, true);
  for (let i = 0; i < 100; i++) {
    if (await evaluate(client, "!!document.querySelector('[data-settings-content]')")) break;
    await delay(100);
  }
  assert.equal(
    await evaluate(client, "!!document.querySelector('[data-settings-content]')"),
    true,
    "API6 设置导航失败",
  );
  await evaluate(client, "document.querySelector('[data-settings-content]').focus()");
  for (let i = 0; i < 5; i++) {
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await delay(70);
  }
  assert.equal(await evaluate(client, "window.api.plugins.centerState()"), true);
  for (let i = 0; i < 100; i++) {
    if (
      await evaluate(
        client,
        "document.querySelector('[data-settings-content]')?.textContent.includes('NoiseLimiter')",
      )
    )
      break;
    await delay(100);
  }
  assert.equal(
    await evaluate(
      client,
      "document.querySelector('[data-settings-content]').textContent.includes('NoiseLimiter')",
    ),
    true,
  );
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await delay(300);
  await evaluate(client, "window.api.plugins.uninstall('carbonv.acceptance')");
  const noiseId = "carbonv.noise-limiter";
  const initialNoise = await evaluate<{
    native: string;
    enabled: boolean;
    config: { mode: string; strength: number; ceilingDb: number };
  }>(client, "window.api.plugins.effectsState()");
  assert.equal(initialNoise.enabled, true);
  assert.equal(initialNoise.native, "active", "打包原生DSP未正确配置");
  assert.equal(initialNoise.config.mode, "dynamic");
  assert.equal(initialNoise.config.strength, 50);
  assert.equal(initialNoise.config.ceilingDb, -12);
  await evaluate(client, `window.api.plugins.list('${noiseId}')`);
  await evaluate(client, `window.api.plugins.setSetting('${noiseId}','mode','basic')`);
  await evaluate(client, `window.api.plugins.setSetting('${noiseId}','basicStrength',75)`);
  await delay(150);
  const basic = await evaluate<{ config: { mode: string; strength: number } }>(
    client,
    "window.api.plugins.effectsState()",
  );
  assert.equal(basic.config.mode, "basic");
  assert.equal(basic.config.strength, 75);
  await evaluate(client, `window.api.plugins.uninstall('${noiseId}')`);
  assert.equal(
    await evaluate(client, "window.api.plugins.effectsState().then(s=>s.enabled)"),
    false,
  );
  const zipPath = resolve("dist/NoiseLimiter-1.0.0.cplayer.zip");
  const installedNoise = await evaluate<{ ok: boolean; error?: string }>(
    client,
    `window.api.plugins.install(${JSON.stringify(zipPath)})`,
  );
  assert.equal(installedNoise.ok, true, installedNoise.error);
  await evaluate(client, `window.api.plugins.list('${noiseId}')`);
  await evaluate(client, `window.api.plugins.setSetting('${noiseId}','mode','dynamic')`);
  await evaluate(client, `window.api.plugins.setEnabled('${noiseId}',false)`);
  assert.equal(
    await evaluate(client, "window.api.plugins.effectsState().then(s=>s.enabled)"),
    false,
  );
  await evaluate(client, "window.api.plugins.restoreBuiltin()");
  await evaluate(client, `window.api.plugins.list('${noiseId}')`);
  await delay(100);
  assert.equal(
    await evaluate(client, "window.api.plugins.effectsState().then(s=>s.enabled)"),
    true,
  );
  await writeFile(
    "dist/plugin-acceptance.json",
    JSON.stringify({
      apiLevel: 6,
      fiveEnterUnlock: true,
      defaultNoise: initialNoise,
      basic,
      zipInstall: true,
      uninstall: true,
      restore: true,
    }),
  );
  const devices = await evaluate<{ success: boolean; data?: unknown[] }>(
    client,
    "window.api.player.getOutputDevices()",
  );
  if (devices.success && devices.data?.length) {
    const frames = 44100 * 10;
    const tone = Buffer.alloc(44 + frames * 2);
    tone.write("RIFF");
    tone.writeUInt32LE(tone.length - 8, 4);
    tone.write("WAVEfmt ", 8);
    tone.writeUInt32LE(16, 16);
    tone.writeUInt16LE(1, 20);
    tone.writeUInt16LE(1, 22);
    tone.writeUInt32LE(44100, 24);
    tone.writeUInt32LE(88200, 28);
    tone.writeUInt16LE(2, 32);
    tone.writeUInt16LE(16, 34);
    tone.write("data", 36);
    tone.writeUInt32LE(frames * 2, 40);
    for (let frame = 0; frame < frames; frame++)
      tone.writeInt16LE(
        Math.round(Math.sin((frame * 2 * Math.PI * 440) / 44100) * 3000),
        44 + frame * 2,
      );
    const tonePath = resolve("dist/cutoff-tone.wav");
    await writeFile(tonePath, tone);
    const loaded = await evaluate<{ success: boolean; error?: string }>(
      client,
      `window.api.player.load(${JSON.stringify(tonePath)}, {autoPlay:true})`,
    );
    nativeAudio = { verified: loaded.success, reason: loaded.error };
    if (loaded.success) {
      await delay(300);
      const playing = await evaluate<{ data: { state: string } }>(
        client,
        "window.api.player.getStatus()",
      );
      assert.equal(playing.data.state, "playing");
    }
  } else nativeAudio.reason = "Windows runner 未提供音频输出端点，不能替代实体扬声器验收";
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
  const stopped = await evaluate<{ data: { state: string; position: number } }>(
    client,
    "window.api.player.getStatus()",
  );
  assert.equal(stopped.data.state, "stopped");
  assert.equal(stopped.data.position, 0);
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
  const layout = await evaluate<{
    footerVisible: boolean;
    footerTop: number;
    bounds: { y: number; height: number };
    button: { y: number; height: number } | null;
    toolbar: string[];
    addressBars: number;
  }>(
    client,
    `(async () => {
    const snapshot = await window.api.school.get();
    await window.api.school.configure({...snapshot.config,bilibili:{...snapshot.config.bilibili,biliSongEnabled:true}});
    const app = document.getElementById('app').__vue_app__;
    await app.config.globalProperties.$router.push('/bilibili');
    const media = app.config.globalProperties.$pinia._s.get('media');
    media.setTrack({id:'bilibili:BV1Y6We6jEPQ:p1',source:'bilibili',bilibili:{url:'https://www.bilibili.com/video/BV1Y6We6jEPQ/'},title:'哔哩Song 底栏验收',artists:[{name:'哔哩Song'}],duration:1000});
    await new Promise(done=>setTimeout(done,900));
    const footer = document.querySelector('[data-player-bar]');
    const surface = document.querySelector('[aria-label="B 站独立浏览区域"]');
    const state = await window.api.bilibili.command('status');
    return {footerVisible:!!footer && footer.getBoundingClientRect().height>0,footerTop:footer?.getBoundingClientRect().top,bounds:state.bounds,button:state.buttonBounds,toolbar:[...surface.parentElement.firstElementChild.querySelectorAll('button')].map(b=>b.textContent.trim()),addressBars:surface.parentElement.querySelectorAll('input').length};
  })()`,
  );
  assert.equal(layout.footerVisible, true, "哔哩Song 缺少底部播放栏");
  assert.ok(layout.bounds.y + layout.bounds.height <= layout.footerTop + 1, "原生网页遮挡了底栏");
  assert.ok(
    layout.button && layout.button.y + layout.button.height <= layout.footerTop,
    "悬浮按钮未限制在底栏上方",
  );
  assert.equal(layout.addressBars, 0);
  assert.deepEqual(layout.toolbar, ["刷新", "复制链接", "MV 剧场模式", "全屏"]);
  await writeFile("dist/bilibili-layout.json", JSON.stringify(layout, null, 2));
  const remotePage = await waitForPage("bilibili");
  browserClient = await connect(remotePage.webSocketDebuggerUrl);
  let browserDocumentReady = false;
  for (let i = 0; i < 200; i++) {
    try {
      browserDocumentReady = await evaluate<boolean>(
        browserClient,
        "location.hostname === 'search.bilibili.com' && document.readyState !== 'loading' && !!document.body",
      );
      if (browserDocumentReady) break;
    } catch {
      /* 跨进程导航期间执行上下文暂不可用，等待新文档 */
    }
    await delay(100);
  }
  assert.ok(browserDocumentReady, "B站首页文档尚未就绪，不能注入媒体验收夹具");

  const focusTone = Buffer.alloc(44 + 8000 * 10 * 2);
  focusTone.write("RIFF");
  focusTone.writeUInt32LE(focusTone.length - 8, 4);
  focusTone.write("WAVEfmt ", 8);
  focusTone.writeUInt32LE(16, 16);
  focusTone.writeUInt16LE(1, 20);
  focusTone.writeUInt16LE(1, 22);
  focusTone.writeUInt32LE(8000, 24);
  focusTone.writeUInt32LE(16000, 28);
  focusTone.writeUInt16LE(2, 32);
  focusTone.writeUInt16LE(16, 34);
  focusTone.write("data", 36);
  focusTone.writeUInt32LE(focusTone.length - 44, 40);
  await evaluate(
    browserClient,
    `(async () => {
    const media = new Audio('data:audio/wav;base64,${focusTone.toString("base64")}');
    media.muted = true;
    media.loop = true;
    document.body.appendChild(media);
    window.__carbonvFocusTestMedia = media;
    await media.play();
  })()`,
  );
  await delay(300);
  const startTime = await evaluate<number>(
    browserClient,
    "window.__carbonvFocusTestMedia.currentTime",
  );
  const focus = await evaluate<BilibiliState & { inputFocused: boolean }>(
    client,
    `(async () => {
    document.querySelector('header [role="button"][aria-label]').click();
    await new Promise(done=>setTimeout(done,650));
    const input = document.querySelector('[role="dialog"] input');
    input?.focus();
    return {...await window.api.bilibili.command('status'),inputFocused:!!input && document.activeElement===input};
  })()`,
  );
  const playing = await evaluate<{ paused: boolean; time: number; visibility: string }>(
    browserClient,
    "({paused:window.__carbonvFocusTestMedia.paused,time:window.__carbonvFocusTestMedia.currentTime,visibility:document.visibilityState})",
  );
  assert.equal(focus.inputFocused, true);
  assert.equal(focus.visible, true);
  assert.equal(focus.occluded, true);
  assert.equal(focus.bounds.width, 0);
  assert.equal(focus.bounds.height, 0);
  assert.equal(focus.buttonBounds, null);
  assert.equal(playing.paused, false, "点击搜索框暂停了 B 站媒体");
  assert.ok(playing.time > startTime + 0.2, "搜索期间媒体进度未继续");
  assert.equal(playing.visibility, "visible");
  await evaluate(browserClient, "window.__carbonvFocusTestMedia.pause()");
  const restored = await evaluate<BilibiliState>(
    client,
    `(async () => {
    document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('status').searchOpen = false;
    await new Promise(done=>setTimeout(done,650));
    return window.api.bilibili.command('status');
  })()`,
  );
  assert.equal(restored.occluded, false);
  assert.ok(restored.bounds.height > 0);
  assert.equal(
    await evaluate(browserClient, "window.__carbonvFocusTestMedia.paused"),
    true,
    "关闭弹窗恢复了手动暂停的媒体",
  );
  await evaluate(browserClient, "window.__carbonvFocusTestMedia.play()");
  await evaluate(
    client,
    `(async () => {
    await document.getElementById('app').__vue_app__.config.globalProperties.$router.push('/');
    await new Promise(done=>setTimeout(done,300));
  })()`,
  );
  assert.equal(
    await evaluate(browserClient, "window.__carbonvFocusTestMedia.paused"),
    true,
    "离开页面没有暂停媒体",
  );
  await evaluate(
    client,
    `(async () => {
    await document.getElementById('app').__vue_app__.config.globalProperties.$router.push('/bilibili');
    await new Promise(done=>setTimeout(done,650));
    document.querySelector('header [role="button"][aria-label]').click();
    await new Promise(done=>setTimeout(done,300));
  })()`,
  );
  await evaluate(browserClient, "window.__carbonvFocusTestMedia.play()");
  await evaluate(
    client,
    `(async () => {
    const snapshot = await window.api.school.get();
    await window.api.school.configure({...snapshot.config,enabled:true,scheduleEnabled:true,breaks:[],specialDates:{},disabledDates:[]});
    await new Promise(done=>setTimeout(done,300));
  })()`,
  );
  assert.equal(
    await evaluate(browserClient, "window.__carbonvFocusTestMedia.paused"),
    true,
    "弹窗遮挡时上课未暂停媒体",
  );
  await writeFile(
    "dist/bilibili-focus.json",
    JSON.stringify({ focus, playing, restored, routePause: true, classPause: true }, null, 2),
  );
  const verdict = JSON.stringify({
    success: true,
    portable,
    renderer: page.url,
    startupLazyLoading: true,
    pluginCenter: true,
    noiseLimiter: true,
    packagedPreload: true,
    classGate: true,
    packagedCore: browser.coreVersion,
    nativeAudio,
    startup,
    noiseLimiterState: initialNoise,
    bilibiliLayout: true,
    floatingSongButton: true,
    searchFocusPlayback: true,
    overlayClassGate: true,
  });
  console.log(verdict);
  await writeFile("dist/acceptance-result.json", verdict + "\n");
  await evaluate(client, "window.api.window.quit()").catch(() => {});
} catch (error) {
  await logFile.sync();
  console.error((await readFile("dist/portable-smoke.log", "utf8")).slice(-10000));
  throw error;
} finally {
  client?.socket.close();
  browserClient?.socket.close();
  if (appProcess.pid)
    spawnSync("taskkill", ["/PID", String(appProcess.pid), "/T", "/F"], { stdio: "ignore" });
  await logFile.close();
}
