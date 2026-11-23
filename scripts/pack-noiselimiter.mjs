import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { ZipFile } from "yazl";
import { finished } from "node:stream/promises";
const manifest = JSON.parse(await readFile("vendor/noiselimiter/manifest.json", "utf8"));
await mkdir("dist", { recursive: true });
const zip = new ZipFile();
for (const file of [
  "plugin.js",
  "manifest.json",
  "UPSTREAM.json",
  "camilladsp/LICENSE_MPL2.0.txt",
  "camilladsp/LICENSE_GLPv3.txt",
])
  zip.addFile(`vendor/noiselimiter/${file}`, file);
const output = createWriteStream(`dist/NoiseLimiter-${manifest.version}.cplayer.zip`);
zip.outputStream.pipe(output);
zip.end();
await finished(output);
console.log(`NoiseLimiter ${manifest.version} packaged`);
