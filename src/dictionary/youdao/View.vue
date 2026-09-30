<template>
    <div id="youdao">
        <h2>{{ word }}</h2>
        <div class="pronunces">
            <span class="pron" v-for="i in prons.length" @click="playAudio(prons[i - 1].url)">{{
                prons[i - 1].phsym
            }}</span>
        </div>
        <div class="meaning" style="margin-bottom: 10px;" v-html="meaningHTML"></div>
        <div class="translation" v-html="translationHTML" />
        <div class="youdao-tabs">
            <div class="tab-glider" :style="{ transform: `translateX(${tabIndex * 100}%)` }"></div>
            <button v-for="sub in tabsList" :key="sub"
                class="youdao-tab-item" :class="{ active: curPanel === sub }"
                @click="curPanel = sub">
                {{ sub }}
            </button>
        </div>
        <Collins class="collins" v-if="curPanel === '柯林斯'" :mydata="collins" />
        <div class="discrimination" v-else-if="curPanel === '辨析'" v-html="discriminationHTML"></div>
        <div class="word-group" v-else-if="curPanel === '词组'" v-html="wordGroupHTML"></div>
        <div class="rel-word" v-else-if="curPanel === '同根词'" v-html="relWordHTML"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

import Collins from "./YDCollins.vue"
import { search, YoudaoResultLex } from "./engine"
import { useLoading } from "@dict/uses"
import { playAudio } from "@/utils/helpers"

// import Plugin from "../plugin"
// const plugin: Plugin = getCurrentInstance().appContext.config.globalProperties.plugin

const props = defineProps<{
    word: string,
}>()

const emits = defineEmits<{
    (event: "loading", status: { id: string, loading: boolean, result: boolean }): void
}>()

let word = ref("")
let meaningHTML = ref("")
let translationHTML = ref("")
let prons = ref([])
const tabsList = ['柯林斯', '辨析', '词组', '同根词']
let curPanel = ref("柯林斯")
const tabIndex = computed(() => tabsList.indexOf(curPanel.value))
let collins = ref([{}])
let discriminationHTML = ref("")
let wordGroupHTML = ref("")
let relWordHTML = ref("")

async function onSearch(): Promise<boolean> {
    let res = await search(props.word)
    if (!res) {
        return false;
    }
    let result = res.result as YoudaoResultLex;
    word.value = result.title;
    meaningHTML.value = result.basic;
    translationHTML.value = result.translation;
    prons.value = result.prons;
    collins.value = result.collins;
    discriminationHTML.value = result.discrimination;
    wordGroupHTML.value = result.wordGroup;
    relWordHTML.value = result.relWord;

    await nextTick();
    return true;
}

useLoading(() => props.word, "youdao", onSearch, emits);

</script>

<style lang="scss">
#youdao {
    .youdao-tabs {
        position: relative;
        display: flex;
        align-items: center;
        background-color: var(--background-modifier-form-field, var(--background-secondary-alt, rgba(128, 128, 128, 0.12)));
        padding: 3px;
        border-radius: var(--radius-s, 6px);
        margin: 8px 0 10px 0;
        user-select: none;

        .tab-glider {
            position: absolute;
            top: 3px;
            bottom: 3px;
            left: 3px;
            width: calc((100% - 6px) / 4);
            background-color: var(--interactive-accent, #7f6df2);
            border-radius: var(--radius-xs, 4px);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
            z-index: 0;
        }

        .youdao-tab-item {
            position: relative;
            z-index: 1;
            flex: 1;
            padding: 4px 6px;
            font-size: 0.82em;
            font-weight: 500;
            text-align: center;
            border: none;
            background: transparent;
            color: var(--text-muted);
            border-radius: var(--radius-xs, 4px);
            cursor: pointer;
            box-shadow: none;
            transition: color 0.18s ease, font-weight 0.18s ease;

            &:hover:not(.active) {
                color: var(--text-normal);
                box-shadow: none;
            }

            &.active {
                color: var(--text-on-accent, #ffffff);
                font-weight: 600;
                background: transparent;
                box-shadow: none;
            }
        }
    }
    h2 {
        font-size: 1.3em;
        font-weight: 700;
    }

    .pron {
        margin-right: 15px;
        color: deeppink;
        font-size: 1.1em;
        cursor: pointer;
    }

    .meaning ul {
        padding-left: 0;
    }

    h1,
    h2,
    h3,
    h4 {
        margin-top: 0.2em;
        margin-bottom: 0.2em;
    }

    p {
        margin-top: 0.2em;
        margin-bottom: 0.2em;
    }

    ul {
        padding-left: 20px;
        margin-top: 0.2em;
        margin-bottom: 0.2em;
    }

    ul,
    ol,
    li {
        list-style-type: none;
    }

    .collins {
        h4 {

            span,
            em {
                margin-right: 5px;
            }
        }

        .collinsMajorTrans .additional {
            color: lightsalmon;
        }

        .exampleLists {
            margin: 5px 0 5px 0px;
            padding-left: 20px;
            border-left: 1px solid #d9d9d9
        }

        .collinsOrder {
            float: left;
            margin-left: -15px;
        }
    }

    .discrimination {
        .title {
            font-size: 1.2em;
            font-weight: bold;
        }

        .wordGroup {
            margin-left: 10px;
        }

        .wt-container {
            margin-top: 0.5em;
        }
    }
}

.theme-light #youdao {

    .collins .collinsMajorTrans,
    .discrimination .wt-container {
        background-color: #c7e2ef;
    }
}

.theme-dark #youdao {

    .collins .collinsMajorTrans,
    .discrimination .wt-container {
        background-color: #282a36;
    }
}
</style>