<template>
    <section class="dict-item" :class="{ open: isOpen, expand: isExpand, loading: isLoading }">
        <header class="dict-item-header" @click="onOpen">
            <div :class="['dict-icon', props.id]"></div>
            <span class="dict-name">{{ props.name }}</span>
            <div class="dict-loading" style="padding-left: 20px">
                {{ t("Loading...") }}
            </div>
            <div class="empty-area"></div>
            <button :aria-label="props.name">
                <svg class="fold-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
        </header>
        <div class="dict-item-body">
            <article>
                <slot></slot>
            </article>
            <button class="fold-mask" @click="onExpand" :aria-label="t('Details')">
                <svg class="fold-mask-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, watch, getCurrentInstance, toRef } from "vue";
import { Platform } from "obsidian";
import PluginType from "@/plugin";
import { getRGB } from "@/utils/style";
import { t } from "@/lang/helper";

const plugin = getCurrentInstance().appContext.config.globalProperties
    .plugin as PluginType;
let defaultHeight = toRef(plugin.store, "dictHeight");

let isOpen = ref(false);
let isExpand = ref(false);
let isLoading = ref(false);

const props = defineProps<{
    loading: boolean;
    name: string;
    id: string;
}>();

watch(
    () => props.loading,
    (loading) => {
        isLoading.value = loading;
        if (loading) {
            isOpen.value = false;
            isExpand.value = false;
        } else {
            isOpen.value = true;
        }
    }
);

function onOpen() {
    if (isOpen.value) {
        isOpen.value = false;
        isExpand.value = false;
    } else {
        isOpen.value = true;
    }
}

function onExpand() {
    isExpand.value = true;
}

// react to theme change
let bgRGB = Platform.isMobileApp ?
    getRGB(".workspace-drawer.mod-left", "background-color") :
    getRGB(".workspace-leaf", "background-color");
let makeRGBA = (rgb: typeof bgRGB, alpha: number) =>
    `rgba(${rgb.R},${rgb.G},${rgb.B}, ${alpha})`;
let bgRGBA1 = ref(makeRGBA(bgRGB, 0));
let bgRGBA2 = ref(makeRGBA(bgRGB, 0.5));
let bgRGBA3 = ref(makeRGBA(bgRGB, 1));
setTimeout(() => {
    // 有时加载太慢，workspace的颜色还没出来，所以强制刷新一次
    let bgRGB = Platform.isMobileApp ?
        getRGB(".workspace-drawer.mod-left", "background-color") :
        getRGB(".workspace-leaf", "background-color");
    bgRGBA1.value = makeRGBA(bgRGB, 0);
    bgRGBA2.value = makeRGBA(bgRGB, 0.5);
    bgRGBA3.value = makeRGBA(bgRGB, 1);
}, 5000);
watch(
    () => plugin.store.themeChange,
    () => {
        bgRGB = Platform.isMobileApp ?
            getRGB(".workspace-drawer.mod-left", "background-color") :
            getRGB(".workspace-leaf", "background-color");
        bgRGBA1.value = makeRGBA(bgRGB, 0);
        bgRGBA2.value = makeRGBA(bgRGB, 0.5);
        bgRGBA3.value = makeRGBA(bgRGB, 1);
    }
);
</script>

<style lang="scss">
.dict-item {
    header.dict-item-header {
        display: flex;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 100;
        border-top: 1px solid var(--ll-border);
        background-color: v-bind(bgRGBA3);
        height: 32px;
        cursor: pointer;
        padding: 0 var(--ll-space-2);
        transition: background-color var(--ll-speed) var(--ll-ease);

        &:hover {
            background-color: var(--ll-hover);

            // hover 时不透明背景失效，回退为纯色底
            &:not(:hover) {
                background-color: v-bind(bgRGBA3);
            }
        }

        .dict-icon {
            height: 18px;
            width: 18px;
            background-size: cover;
            flex-shrink: 0;
        }

        .dict-name {
            padding-left: var(--ll-space-2);
            line-height: 20px;
            font-weight: 600;
            font-size: 12px;
            color: var(--ll-text-2);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .dict-loading {
            font-size: 12px;
            color: var(--ll-text-3);
        }

        .empty-area {
            flex: 1;
        }

        button {
            color: var(--ll-text-2);
            width: 22px;
            height: 22px;
            background: 0 0;
            border: none;
            padding: 0;
            cursor: pointer;
            box-shadow: none;
            border-radius: var(--ll-radius-xs);

            &:hover {
                box-shadow: none;
                color: var(--ll-primary);
            }

            &:focus-visible {
                outline: 2px solid var(--ll-primary);
                outline-offset: -2px;
            }

            .fold-arrow {
                width: 15px;
                height: 15px;
                display: block;
                transition: transform 0.3s var(--ll-ease);
            }
        }
    }

    .dict-item-body {
        position: relative;
        overflow: hidden;
        padding-top: var(--ll-space-2);
        transition: max-height 1s cubic-bezier(0, 1, 0, 1);
        padding-left: var(--ll-space-3);
        padding-right: var(--ll-space-3);

        .fold-mask {
            position: absolute;
            left: 0;
            bottom: 0;
            width: 100%;
            height: 50px;
            z-index: 10;
            padding: 0;
            border: none;
            box-shadow: none;
            background: linear-gradient(v-bind(bgRGBA1) 40%,
                    v-bind(bgRGBA2) 60%,
                    v-bind(bgRGBA3) 100%);
            cursor: pointer;

            .fold-mask-arrow {
                position: absolute;
                z-index: 10;
                bottom: 6px;
                left: 50%;
                transform: translateX(-50%);
                width: 16px;
                height: 16px;
                color: var(--ll-text-2);
                margin: 0 auto;
            }
        }
    }

    &:not(.open) {
        .fold-mask {
            display: none;
        }

        .dict-item-body {
            max-height: 10px;
        }
    }

    &.expand {
        .fold-mask {
            display: none;
        }

        .dict-item-body {
            max-height: 5000px;
            transition: max-height 2s ease-in-out;
        }
    }

    &.open {
        header button .fold-arrow {
            transform: rotate(180deg);
        }
    }

    &.open:not(.expand) {
        .dict-item-body {
            max-height: v-bind(defaultHeight);
        }
    }

    &:not(.loading) {
        .dict-loading {
            display: none;
        }
    }
}
</style>
