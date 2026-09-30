<template>
    <div id="langr-reading" ref="reading" style="height: 100%">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig"
            style="height: 100%; display: flex; flex-direction: column">
            <!-- 顶部阅读工具栏：笔记 / 本页词汇进度 / 完成阅读 -->
            <header class="reading-topbar">
                <button class="notes-toggle" @click="activeNotes = true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    {{ t("Jot down Notes") }}
                </button>

                <div v-if="plugin.settings.word_count" class="topbar-count">
                    <CountBar :unknown="unknown" :learn="learn" :ignore="ignore" />
                </div>

                <NButton v-if="page * pageSize < totalLines" class="finish-reading" type="primary" secondary size="small" @click="addIgnores">
                    {{ t("Complete reading and proceed to the next page") }}
                </NButton>
                <NButton v-else class="finish-reading" type="primary" secondary size="small" @click="addIgnores">
                    {{ t("Complete reading") }}
                </NButton>
            </header>

            <!-- 音频媒体条（存在音频时） -->
            <div v-if="audioSource" class="audio-strip">
                <AudioPlayer
                    :audio-source="audioSource"
                    @loaded="onAudioLoaded"
                    @error="onAudioError"
                />
            </div>

            <!-- 阅读正文：限宽居中栏 -->
            <div class="text-area" :style="{
                    fontSize: store.fontSize,
                    fontFamily: store.fontFamily,
                    lineHeight: store.lineHeight,
                }" v-html="renderedText" />

            <!-- 底部分页栏 -->
            <footer class="reading-statusbar">
                <NPagination class="status-pagination" v-model:page="page" v-model:page-size="pageSize"
                    :item-count="totalLines" show-size-picker :page-sizes="pageSizes" :page-slot="pageSlot" />
            </footer>

            <NDrawer v-model:show="activeNotes" :placement="'bottom'" :close-on-esc="true" :auto-focus="true"
                :on-after-enter="afterNoteEnter" :on-after-leave="afterNoteLeave" to="#langr-reading"
                :default-height="250" resizable>
                <NDrawerContent title="Notes">
                    <div class="note-area">
                        <NInput class="note-input" v-model:value="notes" type="textarea" :autosize="{ minRows: 5 }" />
                        <div class="note-rendered" @mouseover="onMouseOver" ref="renderedNote"></div>
                    </div>
                </NDrawerContent>
            </NDrawer>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import {
    ref,
    Ref,
    getCurrentInstance,
    computed,
    watch,
    onMounted,
    onUnmounted,
    watchEffect,
} from "vue";
import {
    NButton,
    NPagination,
    NConfigProvider,
    darkTheme,
    NDrawer,
    NDrawerContent,
    NInput,
    GlobalThemeOverrides,
} from "naive-ui";
import { MarkdownRenderer, Platform, normalizePath } from "obsidian";
import PluginType from "@/plugin";
import { t } from "@/lang/helper";
import { useEvent } from "@/utils/use";
import store from "@/store";
import { getThemeOverrides } from "@/styles/theme";
import { ReadingView } from "./ReadingView";
import CountBar from "./CountBar.vue";
import AudioPlayer from "@/component/AudioPlayer.vue";

let vueThis = getCurrentInstance();
let view = vueThis.appContext.config.globalProperties.view as ReadingView;
let plugin = view.plugin as PluginType;
let contentEl = view.contentEl as HTMLElement;
const submitLoading = ref(false);

// 切换明亮/黑暗模式
const theme = computed(() => {
    return store.dark ? darkTheme : null;
});

const themeConfig: GlobalThemeOverrides = {
    ...getThemeOverrides(store.dark),
    Drawer: {
        bodyPadding: "8px 12px",
        headerPadding: "4px 6px",
        titleFontWeight: "700",
    },
};

// 音频源处理 - 保留原始路径，让 AudioPlayer 组件处理路径转换
// getFileCache 在文件刚同步、索引未就绪时可能返回 null，判空避免挂载崩溃导致白屏
let frontMatter = plugin.app.metadataCache.getFileCache(view.file)?.frontmatter;
let audioSource = (frontMatter?.["langr-audio"] || "") as string;

// ~/ 开头为库内绝对路径，统一解析为跨平台资源 URL（桌面 app://local/，移动端 capacitor）
if (audioSource.startsWith("~/")) {
    audioSource = plugin.app.vault.adapter.getResourcePath(
        normalizePath(audioSource.slice(2))
    );
}

// 音频事件处理
function onAudioLoaded() {
    console.log("Audio loaded successfully");
}

function onAudioError(error: ErrorEvent) {
    console.error("Audio loading failed:", error);
}

// 记笔记
let activeNotes = ref(false);
let notes = ref("");
async function afterNoteEnter() {
    notes.value = await view.readContent("notes", true);
}
async function afterNoteLeave() {
    view.writeContent("notes", notes.value);
}

let renderedNote = ref<HTMLElement>();
watchEffect(async (clean) => {
    if (!renderedNote.value) return;
    // 第 4 参必须传 Component（view 即所在 ItemView），否则嵌入内容注册的
    // 全局事件无法随视图卸载清理，Obsidian 会告警内存泄漏
    await MarkdownRenderer.renderMarkdown(
        notes.value,
        renderedNote.value,
        view.file.path,
        view
    );
    clean(() => {
        renderedNote.value?.empty();
    });
});

function onMouseOver(e: MouseEvent) {
    let target = e.target as HTMLElement;
    if (target.hasClass("internal-link")) {
        app.workspace.trigger("hover-link", {
            event: e,
            source: "preview",
            hoverParent: { hoverPopover: null },
            targetEl: target,
            linktext: target.getAttr("href"),
            soursePath: view.file.path,
        });
    }
}

// 拆分文本
let lines = view.text.split("\n");
let segments = view.divide(lines);

let article = lines.slice(segments["article"].start, segments["article"].end);
let totalLines = article.length;

// 计数
let unknown = ref(0);
let learn = ref(0);
let ignore = ref(0);
let countChange = ref(true);
let refreshCount = () => {
    countChange.value = !countChange.value;
};

if (plugin.settings.word_count) {
    watch(
        [countChange],
        async () => {
            [unknown.value, learn.value, ignore.value] =
                await plugin.parser.countWords(article.join("\n"));
        },
        { immediate: true }
    );

    onMounted(() => {
        addEventListener("obsidian-langr-refresh", refreshCount);
    });
    onUnmounted(() => {
        removeEventListener("obsidian-langr-refresh", refreshCount);
    });
}

// 分页渲染文本

const pageSizes = [
    { label: `1 ${t("paragraph")} / ${t("page")}`, value: 2 },
    { label: `2 ${t("paragraph")} / ${t("page")}`, value: 4 },
    { label: `4 ${t("paragraph")} / ${t("page")}`, value: 8 },
    { label: `8 ${t("paragraph")} / ${t("page")}`, value: 16 },
    { label: `16 ${t("paragraph")} / ${t("page")}`, value: 32 },
    { label: `${t("All")}`, value: Number.MAX_VALUE },
];

const pageSlot = Platform.isMobileApp ? 5 : null;

let dp = plugin.settings.default_paragraphs;
let pageSize = dp === "all" ? ref(Number.MAX_VALUE) : ref(parseInt(dp));
let page = view.lastPos
    ? ref(Math.ceil(view.lastPos / pageSize.value))
    : ref(1);

let renderedText = ref("");
let psChange = ref(true); // 标志pageSize的改变
let refreshHandle = ref(true);

// pageSize变化应该使page同时进行调整以尽量保持原阅读位置
// 同时page和pageSize的改变都应该引起langr-pos的改变，但应只修改一次
// 因此引入psChange这个变量
watch([pageSize], async ([ps], [prev_ps]) => {
    let oldPage = page.value;
    page.value = Math.ceil(((page.value - 1) * prev_ps + 1) / ps);
    if (oldPage === page.value) {
        psChange.value = !psChange.value;
    }
});

watch(
    [page, psChange, refreshHandle],
    async ([p, pc], [prev_p, prev_pc]) => {
        let start = (p - 1) * pageSize.value;
        let end =
            start + pageSize.value > totalLines
                ? totalLines
                : start + pageSize.value;

        renderedText.value = await plugin.parser.parse(
            article.slice(start, end).join("\n")
        );

        if (p !== prev_p || pc != prev_pc) {
            plugin.frontManager.setFrontMatter(
                view.file,
                "langr-pos",
                `${(p - 1) * pageSize.value + 1}`
            );
        }
    },
    { immediate: true }
);

// 设置阅读文字样式

// 添加无视单词
async function addIgnores() {
    submitLoading.value = true;

    let ignores = contentEl.querySelectorAll(
        ".word.new"
    ) as unknown as HTMLElement[];
    let ignore_words: Set<string> = new Set();
    ignores.forEach((el) => {
        ignore_words.add(el.textContent.toLowerCase());
    });

    await plugin.storage.DB().postIgnoreWords([...ignore_words]);

    // this.setViewData(this.data)
    refreshHandle.value = !refreshHandle.value;
    dispatchEvent(new CustomEvent("obsidian-langr-refresh-stat"));

    if (page.value * pageSize.value < totalLines) {
        page.value++;
    }

    refreshCount();

    submitLoading.value = false;
}

let reading = ref(null);
let prevEl: HTMLElement = null;
if (plugin.constants.platform === "mobile") {
    useEvent(reading, "click", (e) => {
        let target = e.target as HTMLElement;
        if (target.hasClass("word") || target.hasClass("phrase")) {
            e.preventDefault();
            e.stopPropagation();
            if (prevEl) {
                let selectSpan = view.wrapSelect(prevEl, target);
                if (selectSpan) {
                    plugin.queryWord(
                        selectSpan.textContent,
                        selectSpan,
                        { x: e.pageX, y: e.pageY }
                    );
                }
                prevEl = null;
            } else {
                prevEl = target;
            }
        } else {
            view.removeSelect();
            prevEl = null;
        }

    });
} else {
    useEvent(reading, "pointerdown", (e) => {
        let target = e.target as HTMLElement;
        if (target.hasClass("word") || target.hasClass("phrase") || target.hasClass("select")) {
            prevEl = target;
        }
    });
    useEvent(reading, "pointerup", (e) => {
        let target = e.target as HTMLElement;
        if (target.hasClass("word") || target.hasClass("phrase") || target.hasClass("select")) {
            e.preventDefault();
            e.stopPropagation();
            if (prevEl) {
                let selectSpan = view.wrapSelect(prevEl, target);
                if (selectSpan) {
                    plugin.queryWord(
                        selectSpan.textContent,
                        selectSpan,
                        { x: e.pageX, y: e.pageY }
                    );
                }
                prevEl = null;
            }
        } else {
            view.removeSelect();
        }
    });
}

</script>

<style lang="scss">
#langr-reading {
    user-select: none;

    // ── 顶部工具栏：笔记 / 进度 / 完成阅读 ───────────────────
    .reading-topbar {
        display: flex;
        align-items: center;
        gap: var(--ll-space-3);
        flex-wrap: wrap;
        padding: var(--ll-space-2) var(--ll-space-4);
        border-bottom: 1px solid var(--ll-border);
        flex-shrink: 0;

        .notes-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            border: 1px solid var(--ll-border);
            border-radius: var(--ll-radius-sm);
            color: var(--ll-text-2);
            cursor: pointer;
            padding: 4px 12px;
            font-size: 13px;
            transition: color var(--ll-speed) var(--ll-ease),
                border-color var(--ll-speed) var(--ll-ease),
                background-color var(--ll-speed) var(--ll-ease);

            svg {
                width: 14px;
                height: 14px;
                display: block;
            }

            &:hover {
                color: var(--ll-primary);
                border-color: var(--ll-primary);
                background: var(--ll-primary-soft);
            }

            &:focus-visible {
                outline: 2px solid var(--ll-primary);
                outline-offset: 1px;
            }
        }

        // 本页词汇掌握进度：阅读中持续可见
        .topbar-count {
            flex: 1 1 220px;
            min-width: 180px;
            display: flex;
            justify-content: center;
        }

        .finish-reading {
            flex-shrink: 0;
            margin-left: auto;
        }

        button {
            width: auto;
        }
    }

    // ── 音频媒体条 ──────────────────────────────────────────
    .audio-strip {
        flex-shrink: 0;
        padding: var(--ll-space-2) var(--ll-space-4);
        background: var(--ll-surface-2);
        border-bottom: 1px solid var(--ll-border);
    }

    // ── 阅读正文：限宽居中栏 ─────────────────────────────────
    .text-area {
        flex: 1;
        overflow: auto;
        width: 100%;
        max-width: 46rem;
        margin: 0 auto;
        padding: var(--ll-space-5) var(--ll-space-4) var(--ll-space-6);
        box-sizing: border-box;
        touch-action: none;

        span.word {
            user-select: contain;
            border: 1px solid transparent;
            cursor: pointer;
            border-radius: var(--ll-radius-xs);
            transition: border-color var(--ll-speed) var(--ll-ease);

            &:hover {
                border-color: var(--ll-primary);
            }
        }

        span.phrase {
            background-color: transparent;
            padding-top: 3px;
            padding-bottom: 3px;
            cursor: pointer;
            border: 1px solid transparent;
            border-radius: var(--ll-radius-xs);
            transition: border-color var(--ll-speed) var(--ll-ease);

            &:hover {
                border-color: var(--ll-primary);
            }
        }

        span.stns {
            border: 1px solid transparent;
        }

        span {
            .ignore {
                background-color: var(--status-ignore-bg);
            }

            .learning {
                background-color: var(--status-learning-bg);
            }

            .familiar {
                background-color: var(--status-familiar-bg);
            }

            .known {
                background-color: var(--status-known-bg);
            }

            .learned {
                background-color: var(--status-learned-bg);
            }
        }

        span.other {
            user-select: text;
        }

        .select {
            background-color: var(--ll-primary-soft);
            padding-top: 3px;
            padding-bottom: 3px;
            cursor: pointer;
            border: 1px solid transparent;
            border-radius: var(--ll-radius-xs);

            &:hover {
                border-color: var(--ll-primary);
            }
        }
    }

    // ── 底部分页栏：居中紧凑 ────────────────────────────────
    .reading-statusbar {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ll-space-2) var(--ll-space-4);
        border-top: 1px solid var(--ll-border);
        flex-shrink: 0;

        .status-pagination {
            justify-content: center;
        }
    }

    .note-area {
        display: flex;
        height: 100%;
        width: 100%;
        gap: var(--ll-space-2);

        .note-input {
            flex: 1;
        }

        .note-rendered {
            border: 1px solid var(--ll-border);
            border-radius: var(--ll-radius-sm);
            flex: 1;
            padding: var(--ll-space-2);
            overflow: auto;
            user-select: text;
        }
    }
}

.is-mobile #langr-reading {
    .reading-topbar {
        // 窄屏：进度条独占一行
        .topbar-count {
            flex-basis: 100%;
            order: 3;
        }
    }

    .reading-statusbar {
        padding-bottom: 48px;
    }
}
</style>
