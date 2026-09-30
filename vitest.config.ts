import { defineConfig } from "vitest/config";
import { resolve } from "path";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": resolve(import.meta.dirname, "src"),
            "@dict": resolve(import.meta.dirname, "src/dictionary"),
            "@comp": resolve(import.meta.dirname, "src/component"),
            // 用 stub 替换 obsidian 模块，测试只覆盖其用到的少量 API
            obsidian: resolve(import.meta.dirname, "tests/setup/obsidian-stub.ts"),
        },
        extensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".json"],
    },
    test: {
        environment: "happy-dom",
        setupFiles: ["tests/setup/setup.ts"],
        include: ["tests/**/*.test.ts"],
    },
});
