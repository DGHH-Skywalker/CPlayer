import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * 汇总构建产物的静态 JS 依赖闭包，动态 import 不计入首屏
 * @param directory - renderer assets 目录
 * @returns 各入口的模块数、未压缩字节和最大模块
 */
export const auditStartup = (directory = "out/renderer/assets") => {
  const root = resolve(directory),
    names = readdirSync(root);
  /**
   * 遍历静态导入，按文件去重
   * @param entry - 实际入口文件名
   * @returns 静态依赖列表
   */
  const closure = (entry) => {
    const pending = [entry],
      found = new Set();
    while (pending.length) {
      const name = pending.pop();
      if (found.has(name)) continue;
      found.add(name);
      const source = readFileSync(join(root, name), "utf8");
      for (const match of source.matchAll(
        /(?:^|\n)(?:import\s+(?:(?:[^;\n]+?)\s+from\s+)?|export\s+[^;\n]+?\s+from\s+)["']\.\/([^"']+\.js)["']/g,
      ))
        pending.push(match[1]);
    }
    return [...found]
      .map((name) => ({ name, bytes: statSync(join(root, name)).size }))
      .sort((a, b) => b.bytes - a.bytes);
  };
  return Object.fromEntries(
    [
      ["bootstrap", /^index-[\w-]+\.js$/],
      ["main", /^main-[\w-]+\.js$/],
      ["mainLayout", /^MainLayout-[\w-]+\.js$/],
      ["settings", /^SettingsContent-[\w-]+\.js$/],
    ].map(([label, pattern]) => {
      const entry = names.find((name) => pattern.test(name));
      if (!entry) throw new Error(`缺少构建入口: ${label}`);
      const files = closure(entry);
      return [
        label,
        {
          entry,
          count: files.length,
          bytes: files.reduce((sum, file) => sum + file.bytes, 0),
          largest: files.slice(0, 8),
        },
      ];
    }),
  );
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditStartup(process.argv[2]);
  const output = JSON.stringify(result, null, 2) + "\n";
  if (process.argv[3]) writeFileSync(process.argv[3], output);
  console.log(output);
}
