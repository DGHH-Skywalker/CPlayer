import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dynamicsSourceHash, verifyDynamics } from "./verify-dynamics.mjs";
/** 创建不依赖 Rust 安装的资源校验夹具 */
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "carbonv-dsp-"));
  mkdirSync(join(root, "native/noise-dsp/src"), { recursive: true });
  mkdirSync(join(root, "vendor/noiselimiter"), { recursive: true });
  writeFileSync(join(root, "native/noise-dsp/Cargo.toml"), "[package]\n");
  writeFileSync(join(root, "native/noise-dsp/src/lib.rs"), "// 固定核心\n");
  writeFileSync(join(root, "vendor/noiselimiter/dynamics.wasm"), "wasm");
  writeFileSync(
    join(root, "vendor/noiselimiter/manifest.json"),
    JSON.stringify({
      sourceSha256: dynamicsSourceHash(root),
      wasmSha256: createHash("sha256").update("wasm").digest("hex"),
    }),
  );
  return root;
};
test("固定资源、规范源码和平台换行均可验证", () => {
  const root = fixture();
  try {
    verifyDynamics(root);
    writeFileSync(join(root, "native/noise-dsp/src/lib.rs"), "// 固定核心\r\n");
    verifyDynamics(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("拒绝来源已变化而未重新固定的DSP", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "native/noise-dsp/src/lib.rs"), "// 已变更");
    assert.throws(() => verifyDynamics(root), /源码已变化/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("拒绝被改写的本地WASM", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "vendor/noiselimiter/dynamics.wasm"), "tampered");
    assert.throws(() => verifyDynamics(root), /WASM 校验失败/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
