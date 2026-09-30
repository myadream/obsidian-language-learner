<template>
    <div id="langr-search" @click="handleClick">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig">
            <!-- 查询区：词头 + 搜索行 -->
            <header class="query-zone">
                <div class="word-headline">
                    <span class="headline-text" :class="{ placeholder: !word }">{{ word || t("Word") }}</span>
                    <div class="history-nav">
                        <NButton size="tiny" quaternary :disabled="historyIndex <= 0" @click="switchHistory('prev')" :title="t('Search') + ' <'">
                            <template #icon>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="15 18 9 12 15 6" />
                                </svg>
                            </template>
                        </NButton>
                        <NButton size="tiny" quaternary :disabled="historyIndex >= lastHistory" @click="switchHistory('next')" :title="t('Search') + ' >'">
                            <template #icon>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </template>
                        </NButton>
                    </div>
                </div>

                <div class="query-row">
                    <NInput
                        class="search-input"
                        size="small"
                        type="text"
                        :placeholder="t('Search by word...')"
                        v-model:value="inputWord"
                        @keydown.enter="handleSearch"
                        clearable
                    >
                        <template #prefix>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </template>
                    </NInput>
                    <NButton size="small" type="primary" :title="t('Search')" :aria-label="t('Search')" @click="handleSearch">
                        <template #icon>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </template>
                    </NButton>
                </div>
            </header>
        </NConfigProvider>
        <div class="dict-area">
            <DictItem v-for="(cp, i) in components" :loading="loadings[i]" :name="cp.name" :id="cp.id" :key="i">
                <KeepAlive>
                    <Component @loading="loading" :is="cp.type" :word="word" v-show="shows[i]"></Component>
                </KeepAlive>
            </DictItem>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, getCurrentInstance, markRaw } from "vue";
import { NConfigProvider, NButton, NInput, darkTheme, GlobalThemeOverrides } from "naive-ui";

import DictItem from "./DictItem.vue";
import { t } from "@/lang/helper";
import PluginType from "@/plugin";
import { dicts } from "@dict/list";
import { playAudio } from "@/utils/helpers";
import { getThemeOverrides } from "@/styles/theme";

const plugin = getCurrentInstance().appContext.config.globalProperties.plugin as PluginType;

const themeConfig: GlobalThemeOverrides = getThemeOverrides(plugin.store.dark);

let components = ref([]);
let map: { [K in string]: number } = {};
let loadings = ref<boolean[]>([]);
let shows = ref<boolean[]>([]);
watch(() => plugin.store.dictsChange, () => {
    let collection = Object.keys(dicts)
        .map((dict: keyof typeof dicts) => {
            return {
                id: dict,
                priority: plugin.settings.dictionaries[dict].priority,
                name: dicts[dict].name,
            };
        })
        .filter((dict) => plugin.settings.dictionaries[dict.id].enable)
        // 只显示支持当前母语的词典
        .filter((dict) => dicts[dict.id].nativeLangs.includes(plugin.settings.native));
    collection.sort((a, b) => a.priority - b.priority);

    components.value = collection.map((dict) => {
        return {
            id: dict.id,
            name: dict.name,
            type: markRaw(dicts[dict.id].Cp),
        };
    });
    collection.forEach((v, i) => {
        map[v.id] = i;
    });
    loadings.value = Array(collection.length).fill(false);
    shows.value = Array(collection.length).fill(false);

}, {
    immediate: true
});

function loading({ id, loading, result }: { id: string, loading: boolean, result: boolean; }) {
    loadings.value[map[id]] = loading;
    shows.value[map[id]] = result;
}

// 切换明亮/黑暗模式
const theme = computed(() => {
    return plugin.store.dark ? darkTheme : null;
});

// 提供一个前进后退查询记录的功能
let history: string[] = [];
let lastHistory = ref(history.length - 1);
let historyIndex = ref(-1);
function switchHistory(direction: "prev" | "next") {
    historyIndex.value = Math.max(
        0,
        Math.min(historyIndex.value + (direction === "prev" ? -1 : 1), history.length - 1)
    );
    word.value = history[historyIndex.value];
    inputWord.value = history[historyIndex.value];
}
function appendHistory() {
    if (historyIndex.value < history.length - 1) {
        history = history.slice(0, historyIndex.value + 1);
    }
    history.push(word.value);
    lastHistory.value = history.length - 1;
    historyIndex.value++;
}

let inputWord = ref("");
let word = ref("");
const onSearch = async (evt: CustomEvent) => {
    let text = evt.detail.selection;
    word.value = text;
    appendHistory();
};

function handleSearch() {
    word.value = inputWord.value;
    appendHistory();
}

function handleClick(evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    if (target.hasClass("speaker")) {
        evt.preventDefault();
        evt.stopPropagation();
        let url = (target as HTMLAnchorElement).href;
        playAudio(url);

    }
    else if (target.tagName === "A") {
        evt.preventDefault();
        evt.stopPropagation();
        word.value = target.textContent;
        inputWord.value = target.textContent;
        appendHistory();
    }
}


onMounted(() => {
    addEventListener('obsidian-langr-search', onSearch);
});

onUnmounted(() => {
    removeEventListener('obsidian-langr-search', onSearch);
});
</script>

<style lang="scss">
#langr-search {
    height: 100%;
    width: 100%;
    overflow: hidden;
    font-size: 0.9em;
    user-select: text;
    display: flex;
    flex-direction: column;

    // ── 查询区：词头行 + 搜索行 ─────────────────────────────
    .query-zone {
        flex-shrink: 0;
        padding: var(--ll-space-2) var(--ll-space-3);
        background: var(--ll-surface-2);
        border-bottom: 1px solid var(--ll-border);
        display: flex;
        flex-direction: column;
        gap: var(--ll-space-1);
    }

    .word-headline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ll-space-2);
        min-height: 24px;

        .headline-text {
            font-size: 17px;
            font-weight: 700;
            color: var(--ll-text);
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;

            &.placeholder {
                font-size: 13px;
                font-weight: 500;
                color: var(--ll-text-3);
            }
        }

        .history-nav {
            display: flex;
            flex-shrink: 0;
            gap: 2px;

            svg {
                width: 13px;
                height: 13px;
                display: block;
            }
        }
    }

    .query-row {
        display: flex;
        align-items: center;
        gap: var(--ll-space-2);

        .search-input {
            flex: 1;
            min-width: 0;

            svg {
                width: 13px;
                height: 13px;
                display: block;
            }
        }

        > .n-button {
            flex-shrink: 0;

            svg {
                width: 14px;
                height: 14px;
                display: block;
            }
        }
    }

    .dict-area {
        flex: 1;
        overflow: auto;
    }
}

.is-mobile #langr-search {
    button:not(.fold-mask) {
        width: auto;
    }

    input[type='text'] {
        padding: 0;
    }
}
</style>
