// DEBUG HARNESS — 独立于插件构建。仅供本地浏览器预览/排障 UI 使用，
// 不参与 `npm run build`（根 vite.config.ts 才是插件构建入口）。
// 启动：npx vite --config playground/vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

const repo = resolve(import.meta.dirname, "..");

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": resolve(repo, "src"),
            "@dict": resolve(repo, "src/dictionary"),
            "@comp": resolve(repo, "src/component"),
            // 浏览器里没有 obsidian 模块，指向测试替身（moment/Notice 等少量 API）
            obsidian: resolve(repo, "tests/setup/obsidian-stub.ts"),
        },
        extensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".json"],
    },
    server: {
        port: 5199,
        strictPort: true,
    },
});
