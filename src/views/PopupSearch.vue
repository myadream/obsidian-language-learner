<template>
    <div id="popup-search" ref="popup" :style="style" style="">
        <header class="pop-handle" ref="handle">
            <span class="grip-dots" aria-hidden="true">
                <i></i><i></i><i></i>
            </span>
            <div class="empty" />
            <div class="pin-button" @click="pin" ref="pinBtn" :title="pinned ? 'Unpin' : 'Pin'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                </svg>
            </div>
        </header>
        <div class="pop-body">
            <SearchPanel />
        </div>
    </div>
</template>

<script setup lang='ts'>
import { ref, watch } from 'vue';
import { useDraggable } from "@vueuse/core";
import store from "@/store";
import SearchPanel from "./SearchPanel.vue";

const props = defineProps<{
    x?: number,
    y?: number,
}>();


let popup = ref(null);
let handle = ref(null);
let { x, y, style } = useDraggable(popup, {
    handle,
    initialValue: {
        x: 50,
        y: 50,
    },
    preventDefault: true,
});

watch([() => props.x, () => props.y,], ([newX, newY]) => {
    if (!pinned.value) {
        x.value = newX;
        y.value = newY;
    }
});

let pinned = ref(false);
let pinBtn = ref<HTMLElement>(null);
function pin() {
    pinned.value = !pinned.value;
    if (pinned.value) {
        pinBtn.value.addClass("pinned");
        store.searchPinned = true;
    } else {
        pinBtn.value.removeClass("pinned");
        store.searchPinned = false;
    }
    window.getSelection().collapseToStart();
}

defineExpose({
    pinned
})

</script>

<style lang="scss">
#popup-search {
    position: fixed;
    border-radius: var(--ll-radius-md);
    background-color: var(--background-secondary);
    border: 1px solid var(--ll-border);
    z-index: 1000;
    touch-action: none;
    box-shadow: var(--shadow-l);
    overflow: hidden;

    .pop-handle {
        height: 22px;
        background-color: var(--ll-surface-3);
        border-bottom: 1px solid var(--ll-border);
        cursor: move;
        display: flex;
        align-items: center;

        &:active {
            cursor: grab;
        }

        .grip-dots {
            display: flex;
            align-items: center;
            gap: 3px;
            padding-left: 10px;

            i {
                width: 3px;
                height: 3px;
                border-radius: 50%;
                background: var(--ll-text-3);
                display: block;
            }
        }

        .empty {
            flex: 1
        }


        .pin-button {
            margin-right: 4px;
            display: flex;
            align-items: center;
            cursor: pointer;
            width: 20px;
            height: 20px;
            justify-content: center;
            border-radius: var(--ll-radius-xs);
            color: var(--ll-text-2);

            svg {
                width: 12px;
                height: 12px;
                display: block;
                transition: transform var(--ll-speed) var(--ll-ease);
            }

            &:hover {
                color: var(--ll-text);
                background-color: var(--ll-hover);
            }

            &:hover.pinned,
            &.pinned {
                color: var(--ll-primary);

                svg {
                    transform: rotate(45deg);
                }
            }
        }
    }

    .pop-body {
        width: 450px;

        #langr-search {
            max-height: 500px;
        }
    }
}

.is-mobile #popup-search {
    .pop-body {
        width: 350px;

        #langr-search {
            max-height: 300px;
        }
    }
}
</style>
