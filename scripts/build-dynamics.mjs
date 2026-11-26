import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { dynamicsSourceHash, verifyDynamics } from "./verify-dynamics.mjs";
const check = process.argv.includes("--check");
const fixed = check ? verifyDynamics() : undefined;
execFileSync(
  "cargo",
  [
    "build",
    "--manifest-path",
    "native/noise-dsp/Cargo.toml",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUSTUP_TOOLCHAIN: "1.100.0",
      CARGO_ENCODED_RUSTFLAGS: `--remap-path-prefix=${process.cwd()}=.`,
    },
  },
);
const compiled = "native/noise-dsp/target/wasm32-unknown-unknown/release/carbonv_dsp.wasm";
const sha256 = createHash("sha256").update(readFileSync(compiled)).digest("hex");
if (check) {
  assert.equal(sha256, fixed.wasmSha256, "Linux 重建的 DSP 与固定资源不一致");
  console.log("固定 DSP 的源码、重建产物与校验值一致");
  process.exit(0);
}
copyFileSync(compiled, "vendor/noiselimiter/dynamics.wasm");
writeFileSync(
  "vendor/noiselimiter/manifest.json",
  JSON.stringify(
    {
      id: "carbonv.noise-limiter",
      version: "1.1.0",
      entry: "plugin.js",
      hostApi: 6,
      sourceSha256: dynamicsSourceHash(),
      buildPlatform: process.platform,
      wasmSha256: sha256,
    },
    null,
    2,
  ) + "\n",
);
