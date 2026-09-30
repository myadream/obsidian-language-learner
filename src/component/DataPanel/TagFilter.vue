<template>
    <div class="tag-filter" v-if="tags.length > 0">
        <div class="rail-head">
            <span class="rail-head-title">{{ t("Tags") }}</span>
            <NSelect
                class="mode-select"
                :value="mode"
                @update:value="updateMode"
                :options="modeOptions"
                size="tiny"
                :consistent-menu-width="false"
            />
        </div>

        <div class="tag-check-list">
            <label
                v-for="(tag, i) in tags"
                :key="i"
                class="tag-check"
            >
                <input
                    type="checkbox"
                    class="tag-checkbox"
                    :checked="checkedTags[i]"
                    @change="updateTag(i, ($event.target as HTMLInputElement).checked)"
                />
                <span class="tag-name" :title="'#' + tag">#{{ tag }}</span>
            </label>
        </div>
    </div>
</template>

<script setup lang="ts">
import { NSelect } from 'naive-ui';
import { t } from '@/lang/helper';

const props = defineProps<{
    tags: string[];
    checkedTags: boolean[];
    mode: 'and' | 'or';
}>();

const emit = defineEmits<{
    (e: 'update:checkedTags', value: boolean[]): void;
    (e: 'update:mode', value: 'and' | 'or'): void;
}>();

const modeOptions = [
    { label: t('And'), value: 'and' },
    { label: t('Or'), value: 'or' }
];

const updateTag = (index: number, value: boolean) => {
    // 检查值是否真的改变了
    if (props.checkedTags[index] === value) return;

    // 创建新的数组
    const newCheckedTags = [...props.checkedTags];
    newCheckedTags[index] = value;

    // 发出更新事件
    emit('update:checkedTags', newCheckedTags);
};

const updateMode = (value: 'and' | 'or') => {
    // 检查值是否真的改变了
    if (props.mode === value) return;

    // 发出更新事件
    emit('update:mode', value);
};
</script>

<style lang="scss" scoped>
.tag-filter {
    .rail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ll-space-2);
        margin-bottom: var(--ll-space-2);

        .rail-head-title {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--ll-text-3);
        }

        .mode-select {
            width: 72px;
            flex-shrink: 0;
        }
    }

    .tag-check-list {
        display: flex;
        flex-direction: column;
        gap: 1px;
        max-height: 220px;
        overflow-y: auto;
    }

    .tag-check {
        display: flex;
        align-items: center;
        gap: var(--ll-space-2);
        padding: 3px var(--ll-space-1);
        border-radius: var(--ll-radius-sm);
        cursor: pointer;
        transition: background-color var(--ll-speed) var(--ll-ease);

        &:hover {
            background: var(--ll-hover);
        }

        &:has(.tag-checkbox:focus-visible) {
            outline: 2px solid var(--ll-primary);
            outline-offset: -2px;
        }

        .tag-checkbox {
            width: 13px;
            height: 13px;
            margin: 0;
            flex-shrink: 0;
            accent-color: var(--ll-primary);
            cursor: pointer;
        }

        .tag-name {
            font-size: 12.5px;
            color: var(--ll-text-2);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
        }

        &:hover .tag-name {
            color: var(--ll-text);
        }
    }
}
</style>
