import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_REPO_URL__: JSON.stringify(pkg.repository.url),
    __APP_REPO_NAME__: JSON.stringify(pkg.productName),
    __APP_AUTHOR__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_AUTHOR_URL__: JSON.stringify(pkg.author.url),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@main": fileURLToPath(new URL("./electron/main", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@windows": fileURLToPath(new URL("./windows", import.meta.url)),
      "@root": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  plugins: [
    {
      name: "test-virtual-styles",
      /** 测试启动入口时解析虚拟样式，不运行整套 UnoCSS 生成流程 */
      resolveId(id) {
        if (id === "virtual:uno.css") return "\0test-uno-css";
        return null;
      },
      /** 样式不参与启动顺序测试，提供空模块即可 */
      load(id) {
        if (id === "\0test-uno-css") return "";
        return null;
      },
    },
    vue(),
    Icons({ compiler: "vue3" }),
    AutoImport({
      imports: ["vue", "pinia", "vue-router", "@vueuse/core", "vue-i18n"],
    }),
  ],
  test: {
    environment: "happy-dom",
    include: [
      "electron/**/*.spec.ts",
      "src/**/*.spec.ts",
      "windows/**/*.spec.ts",
      "docs/**/*.spec.ts",
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
