<template>
    <NMessageProvider>
        <NModal
            :show="show"
            @update:show="$emit('update:show', $event)"
            :mask-closable="true"
            :closable="true"
            :preset="'card'"
            :title="word || t('Word Details')"
            :style="{ width: '80%', maxWidth: '860px', maxHeight: '85vh' }"
            :segmented="{ content: 'soft', footer: 'soft' }"
            class="word-more-modal"
        >
        <template #header-extra>
            <NButton
                v-if="notes.length > 0 || sentences.length > 0"
                size="small"
                quaternary
                @click="copyAll"
            >
                <template #icon>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                </template>
                {{ t("Copy All") }}
            </NButton>
        </template>

        <!-- 加载状态 -->
        <NSpin :show="loading">
            <!-- 空状态 -->
            <div
                v-if="!loading && notes.length === 0 && sentences.length === 0"
                class="empty-state"
            >
                <div class="empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                </div>
                <div class="empty-text">{{ t('No notes or sentences for this word') }}</div>
            </div>

            <!-- 内容区域：单列纵向（笔记 → 例句） -->
            <div v-else class="word-more-content">
                <!-- Notes 部分 -->
                <div v-if="notes.length > 0" class="section notes-section">
                    <div class="section-header">
                        <h3>{{ t("Notes") }}</h3>
                        <div class="sec-spacer"></div>
                        <NButton
                            size="tiny"
                            quaternary
                            @click="copyNotes"
                        >
                            <template #icon>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            </template>
                            {{ t("Copy") }}
                        </NButton>
                    </div>
                    <div class="notes-list">
                        <div
                            v-for="(note, index) in notes"
                            :key="index"
                            class="note-item"
                        >
                            <p class="note-text">{{ note }}</p>
                        </div>
                    </div>
                </div>

                <!-- Sentences 部分 -->
                <div v-if="sentences.length > 0" class="section sentences-section">
                    <div class="section-header">
                        <h3>{{ t("Sentences") }}</h3>
                        <div class="sec-spacer"></div>
                        <NButton
                            size="tiny"
                            quaternary
                            @click="copySentences"
                        >
                            <template #icon>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            </template>
                            {{ t("Copy") }}
                        </NButton>
                    </div>
                    <div class="sentences-list">
                        <div
                            v-for="(sen, index) in sentences"
                            :key="sen.id || sen.sentence || index"
                            class="sentence-item"
                        >
                            <p
                                class="sentence-text"
                                v-html="sen.sentence"
                            ></p>
                            <p
                                v-if="sen.trans"
                                class="sentence-trans"
                                v-html="sen.trans"
                            ></p>
                            <p
                                v-if="sen.origin"
                                class="sentence-origin"
                                v-html="sen.origin"
                            ></p>
                        </div>
                    </div>
                </div>
            </div>
        </NSpin>

        <template #footer>
            <NSpace justify="end">
                <NButton @click="$emit('update:show', false)">
                    {{ t("Close") }}
                </NButton>
            </NSpace>
        </template>
        </NModal>
    </NMessageProvider>
</template>

<script setup lang='ts'>
import { ref, watch } from 'vue';
import { NModal, NButton, NSpace, NSpin, useMessage, NMessageProvider } from 'naive-ui';
import { getCurrentInstance } from 'vue';
import PluginType from "@/plugin";
import { t } from '@/lang/helper';

const plugin = getCurrentInstance().appContext.config.globalProperties.plugin as PluginType;
const message = useMessage();

const props = defineProps<{
    word: string;
    show: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:show', value: boolean): void;
}>();

const sentences = ref<any[]>([]);
const notes = ref<string[]>([]);
const loading = ref(false);

async function load() {
    if (!props.word) {
        sentences.value = [];
        notes.value = [];
        return;
    }

    loading.value = true;

    try {
        const data = await plugin.storage.DB().getExpression(props.word);

        notes.value = data?.notes || [];
        sentences.value = (data?.sentences || []).map((sen: any) => ({
            ...sen,
            sentence: highlight(sen.sentence || '', props.word)
        }));
    } catch (error) {
        console.error("[WordMoreModal] Failed to load word details:", error);
        sentences.value = [];
        notes.value = [];
        message.error(t("Failed to load word details"));
    } finally {
        loading.value = false;
    }
}

// 同时监听 word 和 show，确保正确加载
watch([() => props.word, () => props.show], ([newWord, newShow]) => {
    if (newShow && newWord) {
        load();
    }
}, { immediate: true });

function highlight(text: string, word: string) {
    if (!text || !word) return text;

    try {
        // 转义特殊字符
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exprRegex = new RegExp(`(${escapedWord})`, 'gi');
        return text.replace(exprRegex, '<mark>$1</mark>');
    } catch (error) {
        console.error("Highlight error:", error);
        return text;
    }
}

// 复制功能
function copyNotes() {
    const text = notes.value.join('\n\n');
    copyToClipboard(text, t("Notes copied"));
}

function copySentences() {
    const text = sentences.value
        .map(sen => {
            let parts = [sen.sentence?.replace(/<mark>|<\/mark>/g, '')];
            if (sen.trans) parts.push(sen.trans);
            if (sen.origin) parts.push(sen.origin);
            return parts.join('\n');
        })
        .join('\n\n');
    copyToClipboard(text, t("Sentences copied"));
}

function copyAll() {
    const parts: string[] = [];

    if (notes.value.length > 0) {
        parts.push(`=== ${t("Notes")} ===`);
        parts.push(notes.value.join('\n\n'));
    }

    if (sentences.value.length > 0) {
        if (parts.length > 0) parts.push('');
        parts.push(`=== ${t("Sentences")} ===`);
        parts.push(
            sentences.value
                .map(sen => {
                    let senParts = [sen.sentence?.replace(/<mark>|<\/mark>/g, '')];
                    if (sen.trans) senParts.push(sen.trans);
                    if (sen.origin) senParts.push(sen.origin);
                    return senParts.join('\n');
                })
                .join('\n\n')
        );
    }

    const text = parts.join('\n\n');
    copyToClipboard(text, t("All content copied"));
}

function copyToClipboard(text: string, successMsg: string) {
    navigator.clipboard.writeText(text).then(() => {
        message.success(successMsg);
    }).catch(() => {
        message.error(t("Failed to copy"));
    });
}
</script>

<style lang="scss">
// 注意：word-more-modal 这个 class 落在 NModal(preset=card) 生成的 .n-card 元素自身上，
// 因此直接对元素本身写布局，卡片内部做弹性滚动
.word-more-modal {
    &.n-card {
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        overflow: hidden;
        border-radius: var(--ll-radius-md);
        border-top: 2px solid var(--ll-primary);
    }

    .n-card__content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;

        // NSpin 容器需要有最小高度
        .n-spin {
            min-height: 100%;
            display: flex;
        }

        // NSpin 内容容器
        .n-spin-content {
            min-height: 120px;
            width: 100%;
            display: flex;
            flex-direction: column;
        }

        // 自定义滚动条样式
        &::-webkit-scrollbar {
            width: 6px;
        }

        &::-webkit-scrollbar-track {
            background: transparent;
        }

        &::-webkit-scrollbar-thumb {
            background-color: var(--ll-border);
            border-radius: 3px;

            &:hover {
                background-color: var(--ll-border-strong);
            }
        }

        // Firefox 滚动条
        scrollbar-width: thin;
        scrollbar-color: var(--ll-border) transparent;
    }

    .n-card__header {
        .n-card-header__main {
            font-size: 16px;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .n-button svg {
            width: 14px;
            height: 14px;
            display: block;
        }
    }

    .n-card__footer {
        flex-shrink: 0;
    }
}
</style>

<style lang="scss" scoped>
// 空状态样式：方形图标块
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ll-space-3);
    padding: 40px 20px;
    min-height: 140px;
    width: 100%;
    text-align: center;

    .empty-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: var(--ll-radius-md);
        color: var(--ll-text-3);
        background: var(--ll-surface-2);
        border: 1px solid var(--ll-border);

        svg {
            width: 26px;
            height: 26px;
        }
    }

    .empty-text {
        font-size: 14px;
        color: var(--ll-text-2);
        line-height: 1.6;
        text-align: center;
    }
}

// 内容区域：单列纵向（笔记 → 例句），长内容自动换行
.word-more-content {
    min-height: 120px;
    width: 100%;

    .section {
        min-width: 0;

        // 多节时纵向留白分隔
        & + .section {
            margin-top: var(--ll-space-4);
            padding-top: var(--ll-space-3);
            border-top: 1px solid var(--ll-border);
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: var(--ll-space-2);
            margin-bottom: var(--ll-space-3);
            padding-bottom: var(--ll-space-2);
            border-bottom: 1px solid var(--ll-border);

            h3 {
                margin: 0;
                font-size: 12px;
                color: var(--ll-text-2);
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
            }

            .sec-spacer {
                flex: 1;
            }

            .n-button svg {
                width: 13px;
                height: 13px;
                display: block;
            }
        }
    }

    .notes-list {
        .note-item {
            padding: var(--ll-space-3);
            margin-bottom: var(--ll-space-2);
            background: var(--ll-surface-2);
            border-radius: var(--ll-radius-xs);
            border-left: 2px solid var(--ll-primary);

            &:last-child {
                margin-bottom: 0;
            }

            .note-text {
                white-space: pre-line;
                word-break: break-word;
                overflow-wrap: anywhere;
                margin: 0;
                line-height: 1.6;
                user-select: text;
            }
        }
    }

    .sentences-list {
        .sentence-item {
            padding: var(--ll-space-3);
            margin-bottom: var(--ll-space-2);
            background: var(--ll-surface-2);
            border-radius: var(--ll-radius-xs);
            border: 1px solid var(--ll-border);

            &:last-child {
                margin-bottom: 0;
            }

            p {
                margin: 6px 0;
                line-height: 1.6;
                user-select: text;
                word-break: break-word;
                overflow-wrap: anywhere;

                &:first-child {
                    font-style: italic;
                    color: var(--ll-text);

                    mark {
                        font-weight: 600;
                        font-style: normal;
                        background-color: var(--ll-primary-soft);
                        color: var(--ll-primary-strong);
                        padding: 1px 4px;
                        border-radius: var(--ll-radius-xs);
                    }
                }
            }

            .sentence-trans {
                color: var(--ll-text-2);
                font-size: 0.95em;
            }

            .sentence-origin {
                color: var(--ll-text-3);
                font-size: 0.9em;
            }
        }
    }
}
</style>
