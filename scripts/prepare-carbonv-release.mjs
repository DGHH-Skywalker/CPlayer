import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 读取目录中的实际构建产物
 * @param directory - 下载后的 artifact 根目录
 * @returns 所有文件的绝对路径
 */
const filesIn = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : [];
  });

/**
 * 计算发布文件的 SHA-256
 * @param path - 文件路径
 * @returns 十六进制摘要
 */
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * 验证构建与当前标签源码一致，再生成公开发布附件
 * @param input - GitHub artifact 下载目录
 * @param output - 发布暂存目录
 * @param cwd - 当前标签检出的仓库目录
 * @returns 本次发布的版本、提交和附件名
 */
export const assembleRelease = (input, output, cwd = process.cwd()) => {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const candidates = filesIn(resolve(input));
  /**
   * 每类附件必须唯一，避免取到其他提交或重复下载文件
   * @param name - 预期附件文件名
   * @returns 唯一文件路径
   */
  const unique = (name) => {
    const matched = candidates.filter((path) => basename(path) === name);
    assert.equal(matched.length, 1, `Missing or duplicate asset: ${name}`);
    return matched[0];
  };
  const build = JSON.parse(readFileSync(unique("build-provenance.json"), "utf8"));
  assert.equal(build.version, pkg.version, "Build version differs from release source");
  assert.equal(build.commit, commit, "Build commit differs from release source");
  const acceptancePath = unique("acceptance-result.json");
  const acceptance = JSON.parse(readFileSync(acceptancePath, "utf8"));
  assert.equal(acceptance.success, true, "Portable acceptance failed");
  assert.equal(acceptance.packagedPreload, true, "Packaged preload was not verified");
  assert.equal(acceptance.classGate, true, "Class playback gate was not verified");
  const core = JSON.parse(readFileSync(join(cwd, "vendor/bilikit/manifest.json"), "utf8"));
  assert.equal(
    sha256(join(cwd, "vendor/bilikit/bilikit-core.user.js")),
    core.sha256,
    "Core checksum differs",
  );
  assert.equal(acceptance.packagedCore, core.version, "Packaged Core version differs");
  const dynamics = JSON.parse(readFileSync(join(cwd, "vendor/noiselimiter/manifest.json"), "utf8"));
  assert.equal(
    sha256(join(cwd, "vendor/noiselimiter/dynamics.wasm")),
    dynamics.wasmSha256,
    "Dynamics checksum differs",
  );
  assert.equal(acceptance.startupLazyLoading, true, "Lazy startup was not verified");
  assert.equal(acceptance.pluginCenter, true, "Plugin center was not verified");
  assert.equal(acceptance.noiseLimiter, true, "NoiseLimiter was not verified");
  assert.equal(
    build.dynamics?.wasmSha256,
    dynamics.wasmSha256,
    "Built dynamics differs from source",
  );
  const pluginZip = unique(`NoiseLimiter-${dynamics.version}.cplayer.zip`);
  const names = ["setup", "portable"].map((kind) => `Cplayer-${pkg.version}-x64-${kind}.exe`);
  const binaries = names.map((name) => unique(name));
  for (const path of binaries)
    assert.equal(readFileSync(path).subarray(0, 2).toString(), "MZ", "Invalid Windows executable");
  const destination = resolve(output);
  mkdirSync(destination);
  for (const path of binaries) copyFileSync(path, join(destination, basename(path)));
  copyFileSync(pluginZip, join(destination, basename(pluginZip)));
  copyFileSync(acceptancePath, join(destination, "acceptance-result.json"));
  execFileSync(
    "git",
    [
      "archive",
      "--format=zip",
      `--prefix=CarbonVPlayer-${pkg.version}/`,
      "-o",
      join(destination, `CarbonVPlayer-${pkg.version}-source.zip`),
      "HEAD",
    ],
    { cwd },
  );
  execFileSync(
    "git",
    [
      "archive",
      "--format=zip",
      "-o",
      join(destination, `CarbonVPlayer-${pkg.version}-licenses.zip`),
      "HEAD",
      "LICENSE",
      "NOTICE.md",
      "vendor/bilikit/LICENSE",
      "vendor/bilikit/BRAND-ASSETS.md",
      "vendor/bilikit/manifest.json",
      "vendor/noiselimiter/UPSTREAM.json",
      "vendor/noiselimiter/camilladsp/LICENSE_MPL2.0.txt",
      "vendor/noiselimiter/camilladsp/LICENSE_GLPv3.txt",
    ],
    { cwd },
  );
  writeFileSync(
    join(destination, "release-provenance.json"),
    JSON.stringify(
      {
        application: "CarbonVPlayer",
        version: pkg.version,
        commit,
        build,
        core,
        dynamics,
        acceptance,
      },
      null,
      2,
    ) + "\n",
  );
  const files = readdirSync(destination).sort();
  writeFileSync(
    join(destination, "SHA256SUMS.txt"),
    files.map((name) => `${sha256(join(destination, name))}  ${name}`).join("\n") + "\n",
  );
  return { version: pkg.version, commit, files: [...files, "SHA256SUMS.txt"] };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(assembleRelease(process.argv[2], process.argv[3])));
}
