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
import { previewAll } from "@/review/scheduler";
import { formatInterval } from "@/review/format";
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
const HOTKEY: Record<ReviewResponse, string> = {
    again: "1", hard: "2", good: "3", easy: "4",
};

const state = ref<"loading" | "front" | "back" | "done">("loading");
let queue: ReviewQueueItem[] = [];
let idx = 0;
const queueLen = ref(0);
const doneCount = ref(0);
const skippedCount = ref(0);
const noCards = ref(false);
const current = ref<ReviewQueueItem | null>(null);
const record = ref<ExpressionInfo | null>(null);
const previews = ref<Record<string, string>>({});

const showInterval = computed(() => plugin.settings.review_show_interval);
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
    previews.value = {};
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
    const p = previewAll(
        current.value.schedule,
        Date.now() / 1000,
        reviewSettingsFrom(plugin.settings),
    );
    previews.value = Object.fromEntries(
        RESPONSES.map((r) => [r, formatInterval(p[r].interval)]),
    );
    state.value = "back";
}

async function rate(response: ReviewResponse) {
    if (state.value !== "back" || !current.value) return;
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

function onKey(e: KeyboardEvent) {
    if (e.key === " " && state.value === "front") {
        e.preventDefault();
        showAnswer();
        return;
    }
    if (state.value !== "back") return;
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
    <div class="langr-review">
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
                        <ul v-if="notes.length" class="review-notes">
                            <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
                        </ul>
                        <ul v-if="sentences.length" class="review-sentences">
                            <li v-for="(s, i) in sentences" :key="i">
                                <span class="sen-origin" v-html="highlight(s.sentence)"></span>
                                <span v-if="s.trans" class="sen-trans">{{ s.trans }}</span>
                            </li>
                        </ul>
                    </div>

                    <div class="review-rating">
                        <NButton
                            v-for="resp in RESPONSES"
                            :key="resp"
                            :type="resp === 'again' ? 'error' : resp === 'good' ? 'primary' : 'default'"
                            size="large"
                            @click="rate(resp)"
                        >
                            {{ t(LABEL[resp]) }}
                            <span class="btn-hotkey">{{ HOTKEY[resp] }}</span>
                            <span v-if="showInterval" class="btn-interval">{{ previews[resp] }}</span>
                        </NButton>
                    </div>
                </template>
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

.btn-interval {
    opacity: 0.75;
    margin-left: 6px;
    font-size: 12px;
}

.btn-hotkey {
    opacity: 0.5;
    margin-left: 4px;
    font-size: 11px;
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
