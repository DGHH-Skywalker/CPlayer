import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx/package.json"))("esbuild");
const output = resolve(".electron-browser-test.cjs");
try {
  await build({
    entryPoints: ["scripts/test-bilibili-electron.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    alias: { "@main": resolve("electron/main"), "@shared": resolve("shared") },
    logLevel: "warning",
  });
  const args = process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [];
  const result = spawnSync(require("electron"), [...args, output], {
    stdio: "inherit",
    timeout: 60_000,
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(output);
}
