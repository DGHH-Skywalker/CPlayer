import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * 计算可移植核心的规范源码摘要，忽略平台换行差异
 * @param cwd - 项目根目录
 * @returns SHA-256 摘要
 */
export const dynamicsSourceHash = (cwd = process.cwd()) => {
  const root = join(cwd, "native/noise-dsp");
  /** 收集实际 Rust 源文件，不包含编译输出 */
  const sources = (relative) =>
    readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(`${relative}/${entry.name}`)
        : entry.name.endsWith(".rs")
          ? [`${relative}/${entry.name}`]
          : [],
    );
  const hash = createHash("sha256");
  for (const name of ["Cargo.toml", ...sources("src")].sort())
    hash
      .update(name + "\0")
      .update(readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n"))
      .update("\0");
  return hash.digest("hex");
};
/**
 * 校验固定资源及对应源码，应用打包不重写经过审查的 WASM
 * @param cwd - 项目根目录
 * @returns 当前固定清单
 */
export const verifyDynamics = (cwd = process.cwd()) => {
  const manifest = JSON.parse(readFileSync(join(cwd, "vendor/noiselimiter/manifest.json"), "utf8"));
  const wasm = readFileSync(join(cwd, "vendor/noiselimiter/dynamics.wasm"));
  assert.equal(
    createHash("sha256").update(wasm).digest("hex"),
    manifest.wasmSha256,
    "NoiseLimiter WASM 校验失败",
  );
  assert.equal(
    dynamicsSourceHash(cwd),
    manifest.sourceSha256,
    "DSP 源码已变化，请在 Linux 重新执行 pnpm build:dynamics 并提交固定资源",
  );
  return manifest;
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(verifyDynamics()));
