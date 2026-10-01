<script setup lang="ts">
// DEBUG HARNESS — 场景宿主：完整 DataPanel / ReviewPanel + 独立挂载的 WordMoreModal 边界场景。
import { ref } from "vue";
import { NMessageProvider } from "naive-ui";
import DataPanel from "@/views/DataPanel.vue";
import ReviewPanel from "@/views/ReviewPanel.vue";
import Stat from "@/views/Stat.vue";
import WordMoreModal from "@/component/WordMoreModal.vue";
import store from "@/store";

const dark = ref(false);
function toggleDark(v: boolean) {
    dark.value = v;
    store.dark = v;
    document.body.classList.toggle("theme-dark", v);
}

const view = ref<"data" | "review" | "stat">("data");

// 独立详情弹框场景：ghostword 不在数据库中 / 空词
const showMissing = ref(false);
const showEmptyWord = ref(false);
const wordNotInDb = "ghostword";
const emptyWord = "";
</script>

<template>
    <div class="pg-root">
        <div class="pg-toolbar">
            <span class="pg-title">OLL UI Playground — debug harness</span>
            <button class="pg-btn" :class="{ 'pg-active': view === 'data' }" @click="view = 'data'">DataPanel</button>
            <button class="pg-btn" :class="{ 'pg-active': view === 'review' }" @click="view = 'review'">Review</button>
            <button class="pg-btn" :class="{ 'pg-active': view === 'stat' }" @click="view = 'stat'">Stat</button>
            <label class="pg-opt"><input type="checkbox" :checked="dark" @change="toggleDark(($event.target as HTMLInputElement).checked)" /> dark</label>
            <button class="pg-btn" @click="showMissing = true">Detail: word missing in DB</button>
            <button class="pg-btn" @click="showEmptyWord = true">Detail: empty word string</button>
        </div>
        <div class="pg-panel">
            <DataPanel v-if="view === 'data'" />
            <ReviewPanel v-else-if="view === 'review'" />
            <Stat v-else />
        </div>

        <NMessageProvider>
            <WordMoreModal :word="wordNotInDb" :show="showMissing" @update:show="showMissing = $event" />
            <WordMoreModal :word="emptyWord" :show="showEmptyWord" @update:show="showEmptyWord = $event" />
        </NMessageProvider>
    </div>
</template>

<style>
body {
    margin: 0;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: var(--background-primary, #ffffff);
    color: var(--text-normal, #222);
}
.theme-dark {
    --background-primary: #1e1e1e;
    --background-secondary: #262626;
    --background-secondary-alt: #202020;
    --background-modifier-border: #3a3a3a;
    --background-modifier-border-hover: #4a4a4a;
    --background-modifier-hover: rgba(255, 255, 255, 0.06);
    --text-normal: #dcddde;
    --text-muted: #999;
    --text-faint: #666;
}
.pg-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
}
.pg-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: #f3f4f6;
    border-bottom: 1px solid #d1d5db;
    flex-shrink: 0;
}
.pg-title {
    font-size: 12px;
    font-weight: 600;
    color: #555;
}
.pg-opt {
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.pg-btn {
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
}
.pg-btn.pg-active {
    font-weight: 700;
    background: #0d9488;
    color: #fff;
    border-color: #0d9488;
}
.pg-panel {
    flex: 1;
    min-height: 0;
    display: flex;
}
.pg-panel > * {
    flex: 1;
}
/* DEBUG: 禁用过渡/动画，保证截图与计算样式探针的确定性（后台标签页 rAF 节流会让过渡卡在半途） */
body,
body * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
}
</style>
