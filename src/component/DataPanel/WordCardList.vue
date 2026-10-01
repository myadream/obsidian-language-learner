<template>
    <div class="word-ledger">
        <!-- 列头（宽屏） -->
        <div class="ledger-head" aria-hidden="true">
            <span class="col-word">{{ t("Word") }}</span>
            <span class="col-status">{{ t("Status") }}</span>
            <span class="col-date">{{ t("Added Date") }}</span>
            <span class="col-records">{{ t("Notes") }}</span>
            <span class="col-actions"></span>
        </div>

        <!-- 数据行 -->
        <TransitionGroup name="rows" tag="div" class="ledger-body">
            <div
                v-for="item in data"
                :key="item.expr"
                class="ledger-row"
                role="button"
                tabindex="0"
                @click="handleRowClick(item)"
                @keydown.enter.prevent="handleRowClick(item)"
            >
                <!-- 状态色边 -->
                <span class="row-edge" :class="`s-${statusClass(item.statusIndex)}`" aria-hidden="true"></span>

                <!-- 单词 + 释义 + 标签（纵向块：释义缺省时不留空列） -->
                <div class="row-main">
                    <span class="row-word" :title="item.expr">{{ item.expr }}</span>
                    <span v-if="item.meaning" class="row-meaning" :title="item.meaning">{{ item.meaning }}</span>
                    <span v-if="item.tags && item.tags.length > 0" class="row-tags">
                        <span v-for="(tag, i) in item.tags" :key="i" class="row-tag">#{{ tag }}</span>
                    </span>
                </div>

                <!-- 状态芯片 -->
                <span class="ll-status-chip" :class="`s-${statusClass(item.statusIndex)}`">
                    <span class="status-dot" aria-hidden="true"></span>
                    {{ item.status }}
                </span>

                <!-- 日期 -->
                <span class="row-date" :title="item.date">{{ formatDate(item.date) }}</span>

                <!-- 笔记/例句计数 -->
                <div class="row-records">
                    <span v-if="item.noteNum > 0" class="record" :title="t('Notes')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {{ item.noteNum }}
                    </span>
                    <span v-if="item.senNum > 0" class="record" :title="t('Sentences')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        {{ item.senNum }}
                    </span>
                </div>

                <!-- 行内操作：图标按钮，悬停显现（窄屏/触屏常显） -->
                <div class="row-actions">
                    <NButton
                        size="tiny"
                        quaternary
                        :title="t('Pronounce')"
                        :aria-label="t('Pronounce')"
                        @click.stop="pronounce(item.expr)"
                    >
                        <template #icon>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            </svg>
                        </template>
                    </NButton>
                    <NButton
                        size="tiny"
                        quaternary
                        :title="t('Edit')"
                        :aria-label="t('Edit')"
                        @click.stop="handleEdit(item)"
                    >
                        <template #icon>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                        </template>
                    </NButton>
                </div>
            </div>
        </TransitionGroup>

        <!-- 展开详情模态框 -->
        <WordMoreModal
            :word="currentWord?.expr || ''"
            :show="showModal"
            @update:show="showModal = false"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, getCurrentInstance } from 'vue';
import { NButton } from 'naive-ui';
import { t } from '@/lang/helper';
import { StatusClassMap } from '@/statusColors';
import WordMoreModal from '@/component/WordMoreModal.vue';
import { speakWord } from '@/utils/pronounce';
import type PluginType from '@/plugin';
import { moment } from 'obsidian';

interface Row {
    expr: string;
    status: string;
    statusIndex: number;
    meaning: string;
    tags: string[];
    date: string;
    senNum: number;
    noteNum: number;
}

const props = defineProps<{
    data: Row[];
}>();

const emit = defineEmits<{
    (e: 'edit', item: Row): void;
}>();

const plugin = getCurrentInstance()?.appContext.config.globalProperties.plugin as PluginType;

// 行内发音：沿用全局母语/外语/口音配置
const pronounce = (expr: string) => {
    speakWord(expr, {
        native: plugin.settings.native,
        foreign: plugin.settings.foreign,
        accent: plugin.settings.review_prons,
    });
};

const showModal = ref(false);
const currentWord = ref<Row | null>(null);

const handleEdit = (item: Row) => {
    emit('edit', item);
};

const handleViewDetails = (item: Row) => {
    currentWord.value = item;
    showModal.value = true;
};

// 行点击处理：点击行本身也能查看详情
const handleRowClick = (item: Row) => {
    handleViewDetails(item);
};

// 状态 → CSS 类名（颜色由 --status-* 变量提供，自动适配明暗主题）
const statusClass = (statusIndex: number) => {
    return StatusClassMap[statusIndex] || 'ignore';
};

// 格式化日期显示
const formatDate = (dateStr: string) => {
    if (!dateStr) return '';

    const date = moment(dateStr, 'YYYY-MM-DD');
    const now = moment();
    const diffDays = now.diff(date, 'days');

    // 如果是今天，显示"Today"
    if (diffDays === 0) {
        return t('Today');
    }
    // 如果是昨天，显示"Yesterday"
    else if (diffDays === 1) {
        return t('Yesterday');
    }
    // 如果是本周内，显示星期几
    else if (diffDays < 7) {
        return date.format('ddd');
    }
    // 否则显示简短日期
    else {
        return date.format('MM/DD');
    }
};
</script>

<style lang="scss" scoped>
.word-ledger {
    width: 100%;

    // ── 列头 ────────────────────────────────────────────────
    .ledger-head {
        display: flex;
        align-items: center;
        gap: var(--ll-space-3);
        padding: var(--ll-space-2) var(--ll-space-4) var(--ll-space-2) calc(var(--ll-space-4) + 3px);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ll-text-3);
        border-bottom: 1px solid var(--ll-border);

        .col-word { flex: 1; min-width: 0; }
        .col-status { flex: 0 0 86px; }
        .col-date { flex: 0 0 72px; text-align: right; }
        .col-records { flex: 0 0 64px; text-align: right; }
        .col-actions { flex: 0 0 52px; }
    }

    // ── 数据行 ──────────────────────────────────────────────
    .ledger-row {
        display: flex;
        // 固定列（状态/日期/记录/操作）与单词行顶对齐：
        // 含义换行后行高不一，垂直居中会让状态芯片看起来脱离单词行
        align-items: flex-start;
        gap: var(--ll-space-3);
        padding: var(--ll-space-2) var(--ll-space-4) var(--ll-space-2) calc(var(--ll-space-4) + 3px);
        border-bottom: 1px solid var(--ll-border);
        cursor: pointer;
        position: relative;
        min-height: 44px;
        box-sizing: border-box;
        transition: background-color var(--ll-speed) var(--ll-ease);

        &:hover {
            background: var(--ll-surface-2);

            .row-word {
                color: var(--ll-primary-strong);
            }

            .row-actions {
                opacity: 1;
                pointer-events: auto;
            }
        }

        &:focus-visible {
            outline: 2px solid var(--ll-primary);
            outline-offset: -2px;
        }

        // 左缘状态色条：2px 方形
        .row-edge {
            position: absolute;
            left: 0;
            top: 6px;
            bottom: 6px;
            width: 2px;
            background: var(--ll-border);

            @each $s in ignore learning familiar known learned {
                &.s-#{$s} {
                    background: var(--status-#{$s}-main);
                }
            }
        }

        // 单词 / 释义 / 标签 纵向块
        .row-main {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;

            .row-word {
                font-size: 14px;
                font-weight: 600;
                color: var(--ll-text);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                transition: color var(--ll-speed) var(--ll-ease);
            }

            // 含义随内容换行展示（nowrap 会把整行撑出容器并截断长释义）
            .row-meaning {
                font-size: 12px;
                line-height: 1.55;
                color: var(--ll-text-3);
                white-space: normal;
                overflow-wrap: anywhere;
                word-break: break-word;
            }

            // 标签随内容换行，全部展示
            .row-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-top: 1px;

                .row-tag {
                    font-size: 11px;
                    line-height: 1;
                    padding: 2px 5px;
                    border-radius: var(--ll-radius-xs);
                    background: var(--ll-surface-3);
                    color: var(--ll-text-2);
                    white-space: nowrap;
                }
            }
        }

        .row-date {
            flex: 0 0 72px;
            text-align: right;
            font-size: 12px;
            color: var(--ll-text-3);
            font-variant-numeric: tabular-nums;
        }

        .row-records {
            flex: 0 0 64px;
            display: flex;
            justify-content: flex-end;
            gap: var(--ll-space-2);

            .record {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                font-size: 11.5px;
                color: var(--ll-text-3);
                font-variant-numeric: tabular-nums;

                svg {
                    width: 12px;
                    height: 12px;
                    flex-shrink: 0;
                }
            }
        }

        // 行内操作：方形图标按钮，悬停显现
        .row-actions {
            flex: 0 0 52px;
            display: flex;
            justify-content: flex-end;
            gap: 2px;
            opacity: 0;
            pointer-events: none;
            transition: opacity var(--ll-speed) var(--ll-ease);

            .n-button {
                --n-padding: 0 4px;
            }

            svg {
                width: 14px;
                height: 14px;
                display: block;
            }
        }
    }

    // 状态芯片：方形小圆角（静态语义徽标）
    .ll-status-chip {
        flex: 0 0 86px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        padding: 4px 8px;
        border-radius: var(--ll-radius-xs);
        border: 1px solid transparent;
        white-space: nowrap;
        box-sizing: border-box;
        justify-content: center;

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            flex-shrink: 0;
        }

        @each $s in ignore learning familiar known learned {
            &.s-#{$s} {
                color: var(--status-#{$s}-main);
                background: var(--status-#{$s}-bg);
                border-color: var(--status-#{$s}-border);
            }
        }
    }
}

// 行过渡动画（TransitionGroup）：轻微淡入，不做位移
.rows-enter-active,
.rows-leave-active {
    transition: opacity 0.2s ease;
}

.rows-enter-from,
.rows-leave-to {
    opacity: 0;
}

.rows-move {
    transition: transform 0.2s ease;
}

// ── 窄屏（右侧边栏停靠）：收起次要列，操作常显 ──────────────
@media (max-width: 760px) {
    .word-ledger {
        .ledger-head {
            display: none;
        }

        .ledger-row {
            .col-date,
            .row-date,
            .col-records,
            .row-records {
                display: none;
            }

            .row-actions {
                opacity: 1;
                pointer-events: auto;
            }
        }
    }
}

@media (prefers-reduced-motion: reduce) {
    .rows-enter-active,
    .rows-leave-active,
    .rows-move {
        transition: none;
    }
}
</style>
