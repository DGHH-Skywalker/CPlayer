import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx/package.json"))("esbuild");
const output = resolve(".electron-browser-test.cjs");
const live = process.argv.includes("--live");
try {
  await build({
    entryPoints: [live ? "scripts/test-bilibili-live.ts" : "scripts/test-bilibili-electron.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    alias: { "@main": resolve("electron/main"), "@shared": resolve("shared") },
    logLevel: "warning",
  });
  const args = process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [];
  if (process.env.CPLAYER_TEST_DPI)
    args.push(`--force-device-scale-factor=${process.env.CPLAYER_TEST_DPI}`);
  const result = spawnSync(require("electron"), [...args, output], {
    stdio: "inherit",
    timeout: live ? 150_000 : 60_000,
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(output);
}
