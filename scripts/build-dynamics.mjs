import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
    env: { ...process.env, CARGO_ENCODED_RUSTFLAGS: `--remap-path-prefix=${process.cwd()}=.` },
  },
);
copyFileSync(
  "native/noise-dsp/target/wasm32-unknown-unknown/release/carbonv_dsp.wasm",
  "vendor/noiselimiter/dynamics.wasm",
);
const sha256 = createHash("sha256")
  .update(readFileSync("vendor/noiselimiter/dynamics.wasm"))
  .digest("hex");
writeFileSync(
  "vendor/noiselimiter/manifest.json",
  JSON.stringify(
    {
      id: "carbonv.noise-limiter",
      version: "1.0.0",
      entry: "plugin.js",
      hostApi: 6,
      wasmSha256: sha256,
    },
    null,
    2,
  ) + "\n",
);
