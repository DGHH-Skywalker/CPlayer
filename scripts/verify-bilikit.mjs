import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  readFileSync(new URL("../vendor/bilikit/manifest.json", import.meta.url), "utf8"),
);
const source = readFileSync(new URL("../vendor/bilikit/bilikit-core.user.js", import.meta.url));
const checksum = createHash("sha256").update(source).digest("hex");
if (checksum !== manifest.sha256) throw new Error("Core SHA-256 不匹配");
console.log(`Core ${manifest.version} ${manifest.commit} SHA-256 ${checksum}`);
