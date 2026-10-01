<template>
    <div class="action-buttons">
        <NDropdown :options="exportOptions" @select="handleExport">
            <NButton
                size="small"
                quaternary
                :title="t('Export')"
                :aria-label="t('Export')"
            >
                <template #icon>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </template>
            </NButton>
        </NDropdown>

        <NButton
            v-if="hasActiveFilters"
            size="small"
            quaternary
            type="warning"
            :title="t('Reset Filters')"
            :aria-label="t('Reset Filters')"
            @click="$emit('resetFilters')"
        >
            <template #icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </template>
        </NButton>

        <div class="cmd-divider" aria-hidden="true"></div>

        <NButton
            type="primary"
            size="small"
            @click="$emit('addWord')"
        >
            <template #icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </template>
            {{ t("Learning New Words") }}
        </NButton>
    </div>
</template>

<script setup lang="ts">
import { NButton, NDropdown } from 'naive-ui';
import { t } from '@/lang/helper';
import type { DropdownMixedOption } from 'naive-ui';

defineProps<{
    hasActiveFilters: boolean;
}>();

const emit = defineEmits<{
    (e: 'addWord'): void;
    (e: 'resetFilters'): void;
    (e: 'export', format: 'csv' | 'json'): void;
}>();

const exportOptions: DropdownMixedOption[] = [
    {
        label: t('Export as CSV'),
        key: 'csv'
    },
    {
        label: t('Export as JSON'),
        key: 'json'
    }
];

const handleExport = (format: string) => {
    emit('export', format as 'csv' | 'json');
};
</script>

<style lang="scss" scoped>
.action-buttons {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;

    .cmd-divider {
        width: 1px;
        height: 16px;
        background: var(--ll-border);
        margin: 0 var(--ll-space-2);
    }

    svg {
        width: 15px;
        height: 15px;
        display: block;
    }
}
</style>
