// DEBUG HARNESS — playground 入口：注入假 plugin 后挂载 PlaygroundApp。
import { createApp } from "vue";
import PlaygroundApp from "./PlaygroundApp.vue";
import { createFakePlugin } from "./fake-plugin";

// 与插件全局样式一致（--ll-* 设计令牌 / 状态色）
import "@/styles/tokens.css";
import "@/statusColors.css";

const app = createApp(PlaygroundApp);
const plugin = createFakePlugin();
// DEBUG: 暴露给页内探针，用于验证提交流程写入的数据
(window as any).__pgPlugin = plugin;
app.config.globalProperties.plugin = plugin;
app.mount("#app");

// DEBUG: ?obsidian-css=1 时注入真实 Obsidian app.css，复现宿主全局样式对组件的影响
// （如 button/svg 全局规则），用于排查"打包后图标消失"一类问题。
// app.css 不入库（555KB），用 playground/asar-tool.mjs 从本机 Obsidian 提取：
//   node playground/asar-tool.mjs "<Obsidian>\resources\obsidian.asar" extract app.css
if (new URLSearchParams(location.search).has("obsidian-css")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./app.css";
    document.head.appendChild(link);
}
