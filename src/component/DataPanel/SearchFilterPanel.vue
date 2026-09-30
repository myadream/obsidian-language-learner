<template>
    <div class="search-filter-panel">
        <div class="keyword-search">
            <NSelect
                class="field-select"
                :value="segment"
                @update:value="segment = $event"
                :options="segmentOptions"
                size="small"
                :consistent-menu-width="false"
            />

            <NInput
                class="keyword-input"
                size="small"
                :value="modelValue[segment]"
                @update:value="(val) => updateField(segment, val)"
                :placeholder="segment === 'expression' ? t('Search by word...') : t('Search by meaning...')"
                clearable
            >
                <template #prefix>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </template>
            </NInput>

            <!-- 另一字段已有筛选值时的提示点 -->
            <span
                v-if="otherFieldValue"
                class="other-field-dot"
                :title="`${otherFieldLabel}: ${otherFieldValue}`"
            ></span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { NInput, NSelect } from 'naive-ui';
import { t } from '@/lang/helper';

const props = defineProps<{
    modelValue: {
        expression: string;
        meaning: string;
        status: number | undefined;
        t: string | undefined;
    };
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: typeof props.modelValue): void;
    (e: 'search'): void;
}>();

// 当前搜索的目标字段：单词 或 释义（下拉切换）
const segment = ref<'expression' | 'meaning'>('expression');

const segmentOptions = computed(() => [
    { label: t('Word'), value: 'expression' },
    { label: t('Meaning'), value: 'meaning' },
]);

const otherField = computed(() => segment.value === 'expression' ? 'meaning' : 'expression');
const otherFieldValue = computed(() => props.modelValue[otherField.value]);
const otherFieldLabel = computed(() => otherField.value === 'expression' ? t('Word') : t('Meaning'));

// 防抖搜索
let searchTimeout: NodeJS.Timeout | null = null;

const updateField = (field: 'expression' | 'meaning', value: string) => {
    // 检查值是否真的改变了
    if (props.modelValue[field] === value) return;

    // 发出更新事件
    const newValue = {
        ...props.modelValue,
        [field]: value
    };
    emit('update:modelValue', newValue);

    // 触发搜索（带防抖）
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
        emit('search');
    }, 500);
};
</script>

<style lang="scss" scoped>
.search-filter-panel {
    flex: 1 1 240px;
    max-width: 440px;
    min-width: 0;
}

.keyword-search {
    display: flex;
    align-items: center;
    gap: var(--ll-space-2);
    min-width: 0;

    .field-select {
        flex-shrink: 0;
        width: 92px;
    }

    .keyword-input {
        flex: 1;
        min-width: 0;

        svg {
            width: 13px;
            height: 13px;
            display: block;
        }
    }

    .other-field-dot {
        width: 6px;
        height: 6px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--ll-accent);
    }
}
</style>
