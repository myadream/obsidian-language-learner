<template>
    <div class="learn-panel-form">
        <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
            <NForm
                :model="model"
                label-placement="top"
                label-width="auto"
                :rules="rules"
                class="word-form"
            >
                <!-- 词条：表达式 + 类型 -->
                <section class="form-sec">
                    <div class="sec-head">
                        <span class="sec-title">{{ t("Word") }}</span>
                    </div>
                    <div class="sec-body form-row">
                        <NFormItem class="field-grow" :show-label="false" path="expression">
                            <NInput
                                size="medium"
                                v-model:value="model.expression"
                                :placeholder="t('A word or a phrase')"
                                @input="onExpressionInput"
                            />
                        </NFormItem>

                        <div class="type-segmented" role="radiogroup" :aria-label="t('Type')">
                            <button
                                type="button"
                                class="type-item"
                                :class="{ active: model.t === 'WORD' }"
                                role="radio"
                                :aria-checked="model.t === 'WORD'"
                                @click="model.t = 'WORD'"
                            >
                                {{ t("Word") }}
                            </button>
                            <button
                                type="button"
                                class="type-item"
                                :class="{ active: model.t === 'PHRASE' }"
                                role="radio"
                                :aria-checked="model.t === 'PHRASE'"
                                @click="model.t = 'PHRASE'"
                            >
                                {{ t("Phrase") }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 释义 -->
                <section class="form-sec">
                    <div class="sec-head">
                        <span class="sec-title">{{ t("Meaning") }}</span>
                    </div>
                    <div class="sec-body">
                        <NFormItem :show-label="false" path="meaning">
                            <NInput
                                size="medium"
                                v-model:value="model.meaning"
                                :placeholder="t('A short definition')"
                                type="textarea"
                                :autosize="{ minRows: 2, maxRows: 4 }"
                            />
                        </NFormItem>
                    </div>
                </section>

                <!-- 状态：分段色带选择器 -->
                <section class="form-sec">
                    <div class="sec-head">
                        <span class="sec-title">{{ t("Status") }}</span>
                    </div>
                    <div class="sec-body">
                        <div class="status-strip" role="radiogroup" :aria-label="t('Status')">
                            <button
                                v-for="(s, i) in statusOptions"
                                :key="i"
                                type="button"
                                class="strip-item"
                                :class="[`s-${statusClassMap[i]}`, { active: model.status === i }]"
                                role="radio"
                                :aria-checked="model.status === i"
                                @click="model.status = i"
                            >
                                <span class="strip-color" aria-hidden="true"></span>
                                {{ s }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 标签 -->
                <section class="form-sec">
                    <div class="sec-head">
                        <span class="sec-title">{{ t("Tags") }}</span>
                    </div>
                    <div class="sec-body">
                        <NFormItem :show-label="false" path="tags">
                            <NSelect
                                size="medium"
                                v-model:value="model.tags"
                                filterable
                                multiple
                                tag
                                :placeholder="t('Input or select some tags')"
                                :loading="tagLoading"
                                :options="tagOptions"
                                @search="tagSearch"
                            />
                        </NFormItem>
                    </div>
                </section>

                <!-- 笔记：卡片列表 + 头部添加 -->
                <section class="form-sec">
                    <div class="sec-head">
                        <span class="sec-title">{{ t("Notes") }}</span>
                        <div class="sec-spacer"></div>
                        <NButton size="tiny" quaternary @click="addNote">
                            <template #icon>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </template>
                            {{ t("Add Note") }}
                        </NButton>
                    </div>
                    <div class="sec-body item-list">
                        <div v-for="(note, i) in model.notes" :key="`note-${i}`" class="item-card">
                            <NInput
                                size="medium"
                                type="textarea"
                                :placeholder="t('Write a new note')"
                                v-model:value="model.notes[i]"
                                :autosize="{ minRows: 1, maxRows: 5 }"
                            />
                            <button
                                type="button"
                                class="item-remove"
                                :title="t('Remove')"
                                :aria-label="t('Remove')"
                                @click="removeNote(i)"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 例句：卡片列表（原文 / 翻译 / 来源） + 头部添加 -->
                <section class="form-sec">
                    <div class="sec-head">
                        <span class="sec-title">{{ t("Sentences") }}</span>
                        <div class="sec-spacer"></div>
                        <NButton size="tiny" quaternary @click="addSentence">
                            <template #icon>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </template>
                            {{ t("Add Sentence") }}
                        </NButton>
                    </div>
                    <div class="sec-body item-list">
                        <div v-for="(sen, i) in model.sentences" :key="`sen-${i}`" class="item-card sentence-card">
                            <button
                                type="button"
                                class="item-remove"
                                :title="t('Remove')"
                                :aria-label="t('Remove')"
                                @click="removeSentence(i)"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>

                            <NFormItem
                                :show-label="false"
                                :show-feedback="false"
                                :path="`sentences[${i}].sentence`"
                                :rule="sourceRule"
                            >
                                <NInput
                                    size="medium"
                                    type="textarea"
                                    v-model:value="model.sentences[i].sentence"
                                    :placeholder="t('Origin sentence')"
                                    :autosize="{ minRows: 2, maxRows: 4 }"
                                />
                            </NFormItem>
                            <div class="sentence-meta">
                                <NFormItem
                                    :show-feedback="false"
                                    :show-label="false"
                                    :path="`sentences[${i}].trans`"
                                >
                                    <NInput
                                        size="medium"
                                        type="textarea"
                                        v-model:value="model.sentences[i].trans"
                                        :placeholder="t('Translation (Optional)')"
                                        :autosize="{ minRows: 1, maxRows: 3 }"
                                    />
                                </NFormItem>
                                <NFormItem
                                    :show-feedback="false"
                                    :show-label="false"
                                    :path="`sentences[${i}].origin`"
                                >
                                    <NInput
                                        size="medium"
                                        type="textarea"
                                        v-model:value="model.sentences[i].origin"
                                        :placeholder="t('Origin (Optional)')"
                                        :autosize="{ minRows: 1, maxRows: 3 }"
                                    />
                                </NFormItem>
                            </div>
                        </div>
                    </div>
                </section>
            </NForm>

            <slot name="action"></slot>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import { PropType, computed, watch } from "vue";
import {
    NConfigProvider,
    NForm,
    NFormItem,
    NInput,
    NSelect,
    NButton,
    darkTheme
} from "naive-ui";
import { t } from "@/lang/helper";
import { useLearn } from "./useLearn";
import store from "@/store";
import { StatusClassMap } from "@/statusColors";
import { ExpressionInfo } from "@/storage/interface";

const props = defineProps({
    model: {
        type: Object as PropType<ExpressionInfo>,
        required: true
    }
});

const {
    rules,
    sourceRule,
    statusOptions,
    themeOverrides,
    tagOptions,
    tagLoading,
    tagSearch
} = useLearn();

// 状态索引 → CSS 类名（分段色带颜色走 --status-* 变量）
const statusClassMap = StatusClassMap;

// Theme logic
const theme = computed(() => {
    return store.dark ? darkTheme : null;
});

// 确保笔记/例句始终是数组（旧数据字段可能为 null）
watch(
    () => props.model,
    (m) => {
        if (!Array.isArray(m.notes)) m.notes = [];
        if (!Array.isArray(m.sentences)) m.sentences = [];
    },
    { immediate: true }
);

// 笔记增删
const addNote = () => {
    props.model.notes.push("");
};
const removeNote = (index: number) => {
    props.model.notes.splice(index, 1);
};

// 例句增删
const addSentence = () => {
    props.model.sentences.push({ sentence: "", trans: "", origin: "" });
};
const removeSentence = (index: number) => {
    props.model.sentences.splice(index, 1);
};

// 输入单词时自动转小写
const onExpressionInput = (value: string) => {
    if (value && props.model.t === 'WORD') {
        props.model.expression = value.toLowerCase();
    }
};
</script>

<style lang="scss">
.learn-panel-form {
    padding: var(--ll-space-2) 0;

    .word-form {
        .n-form-item {
            margin-bottom: 0;

            &:last-child {
                margin-bottom: 0;
            }
        }
    }

    // ── 分节（无编号标题 + 底部细线） ────────────────────────
    .form-sec {
        & + .form-sec {
            margin-top: var(--ll-space-4);
        }

        .sec-head {
            display: flex;
            align-items: center;
            gap: var(--ll-space-2);
            margin-bottom: var(--ll-space-3);
            padding-bottom: 6px;
            border-bottom: 1px solid var(--ll-border);

            .sec-title {
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: var(--ll-text-2);
            }

            .sec-spacer {
                flex: 1;
            }
        }
    }

    // 表达式 + 类型同行（窄屏自动换行）
    .form-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ll-space-3);
        align-items: flex-start;

        .field-grow {
            flex: 1 1 180px;
            min-width: 0;
        }
    }

    // 类型：方形分段按钮
    .type-segmented {
        display: flex;
        flex-shrink: 0;
        border: 1px solid var(--ll-border);
        border-radius: var(--ll-radius-sm);
        overflow: hidden;
        background: var(--ll-surface-2);

        .type-item {
            padding: 0 var(--ll-space-3);
            height: 34px;
            border: none;
            background: transparent;
            color: var(--ll-text-2);
            font-size: 13px;
            cursor: pointer;
            transition: background-color var(--ll-speed) var(--ll-ease),
                color var(--ll-speed) var(--ll-ease);

            & + .type-item {
                border-left: 1px solid var(--ll-border);
            }

            &:hover {
                color: var(--ll-text);
                background: var(--ll-hover);
            }

            &:focus-visible {
                outline: 2px solid var(--ll-primary);
                outline-offset: -2px;
            }

            &.active {
                background: var(--ll-primary-soft);
                color: var(--ll-primary-strong);
                font-weight: 600;
            }
        }
    }

    // 状态：分段色带（每段顶部 3px 状态色条）
    .status-strip {
        display: flex;
        width: 100%;
        border: 1px solid var(--ll-border);
        border-radius: var(--ll-radius-sm);
        overflow: hidden;
        background: var(--ll-surface-2);

        .strip-item {
            flex: 1;
            min-width: 0;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 8px 4px 7px;
            border: none;
            background: transparent;
            color: var(--ll-text-2);
            font-size: 12.5px;
            cursor: pointer;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            transition: background-color var(--ll-speed) var(--ll-ease),
                color var(--ll-speed) var(--ll-ease);

            & + .strip-item {
                border-left: 1px solid var(--ll-border);
            }

            .strip-color {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: var(--ll-text-3);
                opacity: 0.35;
                transition: opacity var(--ll-speed) var(--ll-ease);
            }

            &:hover {
                color: var(--ll-text);
                background: var(--ll-hover);
            }

            &:focus-visible {
                outline: 2px solid var(--ll-primary);
                outline-offset: -2px;
            }

            @each $s in ignore learning familiar known learned {
                &.s-#{$s} {
                    .strip-color {
                        background: var(--status-#{$s}-main);
                    }

                    &.active {
                        color: var(--status-#{$s}-main);
                        background: var(--status-#{$s}-bg);

                        .strip-color {
                            opacity: 1;
                        }
                    }
                }
            }
        }
    }

    // ── 笔记 / 例句卡片列表 ─────────────────────────────────
    .item-list {
        display: flex;
        flex-direction: column;
        gap: var(--ll-space-2);
    }

    .item-card {
        position: relative;
        background: var(--ll-surface-2);
        border: 1px solid var(--ll-border);
        border-radius: var(--ll-radius-sm);
        padding: var(--ll-space-2);
        padding-right: 36px;
        box-sizing: border-box;

        // 移除按钮：卡片右上角
        .item-remove {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            background: transparent;
            border-radius: var(--ll-radius-xs);
            color: var(--ll-text-3);
            cursor: pointer;
            transition: color var(--ll-speed) var(--ll-ease),
                background-color var(--ll-speed) var(--ll-ease);

            svg {
                width: 13px;
                height: 13px;
                display: block;
            }

            &:hover {
                color: var(--ll-danger);
                background: var(--ll-hover);
            }

            &:focus-visible {
                outline: 2px solid var(--ll-primary);
                outline-offset: -2px;
            }
        }

        &.sentence-card {
            padding: var(--ll-space-3);
            padding-right: 36px;

            .n-form-item {
                margin-bottom: var(--ll-space-3) !important;
                width: 100%;

                &:last-child {
                    margin-bottom: 0 !important;
                }

                .n-form-item-blank {
                    width: 100%;
                }

                .n-input {
                    width: 100%;
                    margin: 0;
                    --n-color: transparent;
                }
            }

            // 翻译 / 来源并排（窄屏收为单列）
            .sentence-meta {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--ll-space-3);

                .n-form-item {
                    margin-bottom: 0 !important;
                }
            }
        }
    }

    // 输入框样式
    .n-input,
    .n-select {
        transition: box-shadow var(--ll-speed) var(--ll-ease),
            border-color var(--ll-speed) var(--ll-ease);

        &:focus-within {
            box-shadow: 0 0 0 2px var(--ll-primary-soft);
        }
    }

    // 文本域样式
    .n-input__textarea-el {
        line-height: 1.6;
    }

    // ── 窄屏适配（侧边栏 / 小窗） ────────────────────────────
    @media (max-width: 560px) {
        .sentence-card .sentence-meta {
            grid-template-columns: 1fr;
        }
    }
}
</style>
