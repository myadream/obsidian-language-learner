<template>
    <div
        class="count-bar"
        :title="`${t('Unknown')} ${props.unknown} · ${t('Learning')} ${props.learn} · ${t('Ignore')} ${props.ignore}`"
        role="img"
        @click="changeUnit"
    >
        <div class="seg seg-unknown" :style="styleA">
            <span class="seg-name">{{ t("Unknown") }}</span>
            <span class="seg-val">{{ percent(props.unknown) }}</span>
        </div>
        <div class="seg seg-learn" :style="styleB">
            <span class="seg-name">{{ t("Learning") }}</span>
            <span class="seg-val">{{ percent(props.learn) }}</span>
        </div>
        <div class="seg seg-ignore" :style="styleC">
            <span class="seg-name">{{ t("Ignore") }}</span>
            <span class="seg-val">{{ percent(props.ignore) }}</span>
        </div>
        <div class="unit-hint" aria-hidden="true">
            <svg v-if="isPercent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="5" x2="5" y2="19" />
                <circle cx="6.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 9h16" />
                <path d="M4 15h16" />
                <path d="M10 3 8 21" />
                <path d="M16 3l-2 18" />
            </svg>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { t } from "@/lang/helper";

const props = defineProps({
    unknown: Number,
    learn: Number,
    ignore: Number,
});

let isPercent = ref(true);

function percent(num: number) {
    if (!isPercent.value) {
        return num;
    }
    let total = props.unknown + props.learn + props.ignore;
    let res = num / total;
    return ((Math.round(res * 1000) * 100) / 1000).toString() + "%";
}

function changeUnit() {
    isPercent.value = !isPercent.value;
}

let styleA = computed(() => {
    return { flex: props.unknown };
});
let styleB = computed(() => {
    return { flex: props.learn };
});
let styleC = computed(() => {
    return { flex: props.ignore };
});
</script>

<style lang="scss" scoped>
/* 计数条：未知(橙) / 在学(青) / 忽略(灰)，方形分段，点击切换数量与百分比 */
.count-bar {
    display: flex;
    align-items: stretch;
    height: 24px;
    max-width: 480px;
    width: 100%;
    cursor: pointer;
    font-size: 11px;
    color: var(--ll-text);
    border: 1px solid var(--ll-border);
    border-radius: var(--ll-radius-sm);
    overflow: hidden;
    background: var(--ll-surface-3);
    user-select: none;

    .seg {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 8px;
        box-sizing: border-box;
        transition: flex var(--ll-speed-slow) var(--ll-ease);

        .seg-name {
            font-weight: 600;
        }

        .seg-val {
            font-variant-numeric: tabular-nums;
        }
    }

    .seg-unknown {
        background-color: var(--ll-accent-soft);
        color: var(--ll-accent);
    }

    .seg-learn {
        background-color: var(--ll-primary-soft);
        color: var(--ll-primary);
    }

    .seg-ignore {
        background-color: rgba(148, 163, 184, 0.25);
        color: var(--ll-text-2);
    }

    .unit-hint {
        display: flex;
        align-items: center;
        padding: 0 6px;
        border-left: 1px solid var(--ll-border);
        color: var(--ll-text-3);
        flex-shrink: 0;
        background: var(--ll-surface-2);

        svg {
            width: 12px;
            height: 12px;
            display: block;
        }
    }
}
</style>
