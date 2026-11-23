import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembleRelease } from "./prepare-carbonv-release.mjs";

/** 创建带真实 Git 提交的最小发布夹具，不连接远程仓库 */
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "carbonv-release-"));
  const input = join(root, "artifacts");
  mkdirSync(input);
  mkdirSync(join(root, "vendor/bilikit"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.4.0" }));
  for (const name of [
    "LICENSE",
    "NOTICE.md",
    "vendor/bilikit/LICENSE",
    "vendor/bilikit/BRAND-ASSETS.md",
  ])
    writeFileSync(join(root, name), "fixture license\n");
  writeFileSync(join(root, "vendor/bilikit/bilikit-core.user.js"), "fixture");
  writeFileSync(
    join(root, "vendor/bilikit/manifest.json"),
    JSON.stringify({
      version: "0.5.35",
      sha256: createHash("sha256").update("fixture").digest("hex"),
    }),
  );
  mkdirSync(join(root, "vendor/noiselimiter/camilladsp"), { recursive: true });
  for (const name of [
    "UPSTREAM.json",
    "camilladsp/LICENSE_MPL2.0.txt",
    "camilladsp/LICENSE_GLPv3.txt",
  ])
    writeFileSync(join(root, "vendor/noiselimiter", name), "fixture license");
  writeFileSync(join(root, "vendor/noiselimiter/dynamics.wasm"), "fixture wasm");
  writeFileSync(
    join(root, "vendor/noiselimiter/manifest.json"),
    JSON.stringify({
      version: "1.0.0",
      wasmSha256: createHash("sha256").update("fixture wasm").digest("hex"),
    }),
  );
  writeFileSync(join(input, "NoiseLimiter-1.0.0.cplayer.zip"), "PKfixture");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=release@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: root },
  );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  for (const kind of ["setup", "portable"])
    writeFileSync(join(input, `Cplayer-1.4.0-x64-${kind}.exe`), "MZfixture");
  writeFileSync(
    join(input, "build-provenance.json"),
    JSON.stringify({
      version: "1.4.0",
      commit,
      dynamics: { wasmSha256: createHash("sha256").update("fixture wasm").digest("hex") },
    }),
  );
  writeFileSync(
    join(input, "acceptance-result.json"),
    JSON.stringify({
      startupLazyLoading: true,
      pluginCenter: true,
      noiseLimiter: true,
      success: true,
      packagedPreload: true,
      classGate: true,
      packagedCore: "0.5.35",
      nativeAudio: { verified: false },
    }),
  );
  return { root, input, output: join(root, "upload") };
};

test("发布附件包含对应源码、许可与准确校验值", () => {
  const f = fixture();
  try {
    const result = assembleRelease(f.input, f.output, f.root);
    assert.equal(result.version, "1.4.0");
    assert.ok(result.files.includes("CarbonVPlayer-1.4.0-source.zip"));
    const sums = readFileSync(join(f.output, "SHA256SUMS.txt"), "utf8").trim().split("\n");
    for (const line of sums) {
      const [digest, name] = line.split("  ");
      assert.equal(
        digest,
        createHash("sha256")
          .update(readFileSync(join(f.output, name)))
          .digest("hex"),
      );
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("拒绝错用其他提交的二进制文件", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.input, "build-provenance.json"),
      JSON.stringify({ version: "1.4.0", commit: "old" }),
    );
    assert.throws(() => assembleRelease(f.input, f.output, f.root), /Build commit differs/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("便携版上课闸门验收失败时拒绝发布", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.input, "acceptance-result.json"),
      JSON.stringify({ success: true, packagedPreload: true, classGate: false }),
    );
    assert.throws(() => assembleRelease(f.input, f.output, f.root), /Class playback gate/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("缺少安装包时拒绝发布", () => {
  const f = fixture();
  try {
    rmSync(join(f.input, "Cplayer-1.4.0-x64-setup.exe"));
    assert.throws(() => assembleRelease(f.input, f.output, f.root), /Missing or duplicate asset/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
