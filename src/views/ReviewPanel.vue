<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from "vue";
import {
    NButton,
    NConfigProvider,
    NTag,
    GlobalThemeOverrides,
    darkTheme,
} from "naive-ui";
import { t } from "@/lang/helper";
import { getThemeOverrides } from "@/styles/theme";
import { speakWord } from "@/utils/pronounce";
import { ReviewService, ReviewQueueItem } from "@/review/review-service";
import { reviewSettingsFrom } from "@/review/settings";
import { ReviewResponse } from "@/review/types";
import { ExpressionInfo } from "@/storage/interface";
import type PluginType from "@/plugin";

// 允许测试注入假服务；生产路径在 onMounted 惰性构造
const props = defineProps<{ service?: ReviewService }>();

const plugin = getCurrentInstance().appContext.config.globalProperties
    .plugin as PluginType;

const RESPONSES: ReviewResponse[] = ["again", "hard", "good", "easy"];
const LABEL: Record<ReviewResponse, string> = {
    again: "Again", hard: "Hard", good: "Good", easy: "Easy",
};
/** 每个难度一个主题色（取自共享主题语义色：红/橙/青绿/绿，明暗自适应） */
const BUTTON_TYPE: Record<ReviewResponse, "error" | "warning" | "primary" | "success"> = {
    again: "error",
    hard: "warning",
    good: "primary",
    easy: "success",
};
// 键盘快捷键（不在按钮上显示，避免多余数字）
const HOTKEY: Record<ReviewResponse, string> = {
    again: "1", hard: "2", good: "3", easy: "4",
};

const state = ref<"loading" | "front" | "back" | "done">("loading");
const rootEl = ref<HTMLElement | null>(null);
/** 背面的笔记/例句默认折叠，点击按钮后展开（每次翻到新卡重置） */
const showDetails = ref(false);
let queue: ReviewQueueItem[] = [];
let idx = 0;
const queueLen = ref(0);
const doneCount = ref(0);
const skippedCount = ref(0);
const noCards = ref(false);
const current = ref<ReviewQueueItem | null>(null);
const record = ref<ExpressionInfo | null>(null);

const theme = computed(() => (plugin.store.dark ? darkTheme : undefined));
const themeConfig = computed<GlobalThemeOverrides>(() =>
    getThemeOverrides(plugin.store.dark)
);

const meaning = computed(() => record.value?.meaning ?? current.value?.info.meaning ?? "");
const tags = computed(() => current.value?.info.tags ?? []);
const notes = computed(() => record.value?.notes ?? []);
const sentences = computed(() => record.value?.sentences ?? []);

function svc(): ReviewService {
    return props.service ?? new ReviewService(
        plugin.storage.DB(),
        () => reviewSettingsFrom(plugin.settings),
    );
}

onMounted(async () => {
    window.addEventListener("keydown", onKey);
    const q = await svc().buildQueue(Date.now() / 1000);
    queue = [...q.due, ...q.newItems];
    queueLen.value = queue.length;
    if (queue.length === 0) {
        noCards.value = true;
        state.value = "done";
        return;
    }
    next();
});

onUnmounted(() => {
    window.removeEventListener("keydown", onKey);
});

function next() {
    if (idx >= queue.length) {
        state.value = "done";
        return;
    }
    current.value = queue[idx];
    record.value = null;
    showDetails.value = false;
    idx++;
    state.value = "front";
}

async function showAnswer() {
    if (state.value !== "front" || !current.value) return;
    try {
        record.value = await plugin.storage.DB().getExpression(current.value.expression);
    } catch (e) {
        console.warn("[review] load expression failed", e);
    }
    state.value = "back";
}

/** 正面即可评分（未看答案），背面评分推进队列 */
async function rate(response: ReviewResponse) {
    if ((state.value !== "front" && state.value !== "back") || !current.value) return;
    const wasFront = state.value === "front";
    if (wasFront) {
        // 正面直接评分时补载完整释义（下一张卡正面不需要，只为完成页/一致性）
        try {
            record.value = await plugin.storage.DB().getExpression(current.value.expression);
        } catch (e) {
            console.warn("[review] load expression failed", e);
        }
    }
    try {
        const { schedule, dueToday } = await svc().applyReview(
            current.value.expression,
            current.value.schedule,
            response,
            Date.now() / 1000,
        );
        doneCount.value++;
        // FSRS 短期 / SM-2 Again：当日到期，回插队尾继续巩固
        if (dueToday) {
            queue.push({ ...current.value, schedule });
        }
    } catch (e) {
        console.error("[review] applyReview failed", e);
        skippedCount.value++;
    }
    next();
}

function speak() {
    if (!current.value) return;
    speakWord(current.value.expression, {
        native: plugin.settings.native,
        foreign: plugin.settings.foreign,
        accent: plugin.settings.review_prons,
    });
}

function isEditable(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    return (
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (el as HTMLElement).isContentEditable === true
    );
}

/**
 * 面板是否处于可响应快捷键的前台状态：
 * ItemView 的 leaf 切到后台不会卸载，无守卫会劫持编辑器/弹框里的 Space 与 1-4。
 */
function isPanelActive(): boolean {
    const active = document.activeElement;
    if (isEditable(active)) return false;
    const root = rootEl.value;
    return (
        active === null || active === document.body ||
        (root !== null && root.contains(active))
    );
}

function onKey(e: KeyboardEvent) {
    if (!isPanelActive()) return;
    if (e.key === " " && state.value === "front") {
        e.preventDefault();
        showAnswer();
        return;
    }
    if (state.value !== "front" && state.value !== "back") return;
    const hit = RESPONSES.find((r) => HOTKEY[r] === e.key);
    if (hit) {
        e.preventDefault();
        rate(hit);
    }
}

/** 例句中单词大小写不敏感高亮（v-html 内容，样式在非 scoped 块） */
function highlight(text: string): string {
    if (!text) return "";
    const word = current.value?.expression ?? "";
    if (!word) return text;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(escaped, "gi"), (m) => `<mark>${m}</mark>`);
}
</script>

<template>
    <div ref="rootEl" class="langr-review">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig">
            <div v-if="state === 'loading'" class="review-state review-loading">
                {{ t("Review") }}…
            </div>

            <div v-else-if="state === 'done'" class="review-state review-done">
                <div class="done-icon">✓</div>
                <div class="done-title">
                    {{ noCards ? t("No cards due") : t("Review Complete") }}
                </div>
                <div v-if="doneCount > 0" class="done-count">
                    {{ t("Reviewed {0} cards", doneCount) }}
                </div>
                <div v-if="skippedCount > 0" class="done-skipped">
                    {{ t("Skipped {0} cards (scheduling error)", skippedCount) }}
                </div>
            </div>

            <div v-else-if="current" class="review-card">
                <div class="review-progress">
                    {{ Math.min(doneCount + 1, queueLen) }} / {{ queueLen }}
                </div>

                <div class="review-expression-row">
                    <span class="review-expression">{{ current.expression }}</span>
                    <button
                        type="button"
                        class="review-speak"
                        :title="t('Review')"
                        @click="speak"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                    </button>
                </div>

                <template v-if="state === 'front'">
                    <div class="review-actions">
                        <NButton type="primary" size="large" @click="showAnswer">
                            {{ t("Show Answer") }}
                        </NButton>
                    </div>
                </template>

                <template v-else>
                    <div class="review-back">
                        <div class="review-meaning">{{ meaning }}</div>
                        <div v-if="tags.length" class="review-tags">
                            <NTag v-for="tag in tags" :key="tag" size="small" :bordered="false">
                                {{ tag }}
                            </NTag>
                        </div>
                        <button
                            v-if="(notes.length > 0 || sentences.length > 0) && !showDetails"
                            type="button"
                            class="review-details-toggle"
                            @click="showDetails = true"
                        >
                            {{ t("Notes & Sentences") }}
                        </button>
                        <template v-if="showDetails">
                            <ul v-if="notes.length" class="review-notes">
                                <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
                            </ul>
                            <ul v-if="sentences.length" class="review-sentences">
                                <li v-for="(s, i) in sentences" :key="i">
                                    <span class="sen-origin" v-html="highlight(s.sentence)"></span>
                                    <span v-if="s.trans" class="sen-trans">{{ s.trans }}</span>
                                </li>
                            </ul>
                        </template>
                    </div>
                </template>

                <!-- 评分按钮：正反面常驻（正面可直接评分） -->
                <div v-if="state === 'front' || state === 'back'" class="review-rating">
                    <NButton
                        v-for="resp in RESPONSES"
                        :key="resp"
                        :type="BUTTON_TYPE[resp]"
                        size="large"
                        @click="rate(resp)"
                    >
                        {{ t(LABEL[resp]) }}
                    </NButton>
                </div>
            </div>
        </NConfigProvider>
    </div>
</template>

<style scoped>
.langr-review {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.review-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ll-space-3);
    color: var(--ll-text-2);
}

.review-done .done-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--ll-radius-full);
    background: var(--ll-primary-soft);
    color: var(--ll-primary);
    font-size: 26px;
    line-height: 48px;
    text-align: center;
}

.review-done .done-title {
    font-size: 18px;
    color: var(--ll-text);
}

.review-done .done-count {
    color: var(--ll-text-2);
}

.review-done .done-skipped {
    color: var(--ll-accent);
    font-size: 12px;
}

.review-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--ll-space-6) var(--ll-space-5);
    gap: var(--ll-space-5);
    overflow-y: auto;
}

.review-progress {
    align-self: flex-end;
    color: var(--ll-text-3);
    font-size: 13px;
}

.review-expression-row {
    display: flex;
    align-items: center;
    gap: var(--ll-space-3);
}

.review-expression {
    font-size: 32px;
    font-weight: 600;
    color: var(--ll-text);
    overflow-wrap: anywhere;
}

.review-actions,
.review-rating {
    display: flex;
    gap: var(--ll-space-3);
    flex-wrap: wrap;
    justify-content: center;
}

.review-back {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: var(--ll-space-4);
}

.review-meaning {
    color: var(--ll-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.review-tags {
    display: flex;
    gap: var(--ll-space-2);
    flex-wrap: wrap;
}

.review-details-toggle {
    align-self: flex-start;
    padding: var(--ll-space-1) var(--ll-space-3);
    box-sizing: border-box;
    border: 1px solid var(--ll-border);
    border-radius: var(--ll-radius-md);
    background: var(--ll-surface-2);
    color: var(--ll-text-2);
    font-size: 13px;
    cursor: pointer;

    &:hover {
        border-color: var(--ll-border-strong);
        color: var(--ll-text);
    }
}

.review-notes,
.review-sentences {
    margin: 0;
    padding-left: var(--ll-space-5);
    color: var(--ll-text-2);
    display: flex;
    flex-direction: column;
    gap: var(--ll-space-2);
}

.review-sentences .sen-trans {
    display: block;
    color: var(--ll-text-3);
    font-size: 13px;
}
</style>

<style>
/* v-html 注入的节点没有 data-v 属性，scoped 打不中——放非 scoped 块并以 .langr-review 限定 */
.langr-review mark {
    background: var(--ll-primary-soft);
    color: var(--ll-primary-strong);
    border-radius: var(--ll-radius-xs);
    padding: 0 2px;
}
</style>
