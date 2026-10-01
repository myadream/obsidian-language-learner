<template>
    <div id="langr-data">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig">
            <NMessageProvider>
                <!-- 顶部命令条：搜索 / 排序 / 操作 -->
                <header class="command-strip">
                    <!-- 窄屏（右侧边栏）下折叠/展开筛选轨 -->
                    <button
                        type="button"
                        class="rail-toggle"
                        :class="{ active: railOpen }"
                        :aria-expanded="railOpen"
                        :title="t('Filters')"
                        :aria-label="t('Filters')"
                        @click="railOpen = !railOpen"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                    </button>

                    <SearchFilterPanel
                        v-model="searchParams"
                        @search="onSearchChange"
                    />

                    <div class="cmd-sort">
                        <span class="cmd-sort-label">{{ t("Sort") }}</span>
                        <NSelect
                            :value="sortValue"
                            :options="sortOptions"
                            size="small"
                            :consistent-menu-width="false"
                            @update:value="onSortChange"
                        />
                    </div>

                    <ActionButtons
                        :has-active-filters="hasAnyFilter"
                        @add-word="onAddWord"
                        @refresh="refresh"
                        @reset-filters="resetFilters"
                        @export="handleExport"
                    />
                </header>

                <!-- 主体：左筛选轨 + 右数据区 -->
                <div class="panel-body" :class="{ 'rail-open': railOpen }">
                    <aside class="filter-rail">
                        <section class="rail-section">
                            <div class="rail-title">{{ t("Status") }}</div>
                            <div class="rail-status-list">
                                <button
                                    type="button"
                                    class="rail-status-item"
                                    :class="{ active: searchParams.status === undefined }"
                                    @click="setStatus(undefined)"
                                >
                                    <span class="lbl">{{ t("All") }}</span>
                                </button>
                                <button
                                    v-for="(label, idx) in statusMap"
                                    :key="idx"
                                    type="button"
                                    class="rail-status-item"
                                    :class="[`s-${statusClass(idx)}`, { active: searchParams.status === idx }]"
                                    @click="setStatus(idx)"
                                >
                                    <span class="dot" aria-hidden="true"></span>
                                    <span class="lbl">{{ label }}</span>
                                    <svg v-if="searchParams.status === idx" class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </button>
                            </div>
                        </section>

                        <section class="rail-section">
                            <div class="rail-title">{{ t("Type") }}</div>
                            <NSelect
                                :value="searchParams.t"
                                @update:value="setType"
                                :options="typeOptions"
                                size="small"
                                :consistent-menu-width="false"
                            />
                        </section>

                        <section class="rail-section rail-tags">
                            <TagFilter
                                v-model:checked-tags="checkedTags"
                                v-model:mode="mode"
                                :tags="tags"
                            />
                        </section>

                        <div v-if="hasAnyFilter" class="rail-footer">
                            <NButton size="small" dashed block @click="resetFilters">
                                {{ t("Reset Filters") }}
                            </NButton>
                        </div>
                    </aside>

                    <main class="list-pane scroll-container" ref="scrollContainer">
                        <NSpin :show="loading">
                            <!-- 错误状态 -->
                            <div v-if="!loading && error" class="pane-state">
                                <div class="state-icon is-error">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                </div>
                                <div class="state-title">{{ t("Something went wrong") }}</div>
                                <div class="state-description">{{ error }}</div>
                                <div class="state-actions">
                                    <NButton type="primary" @click="retryLoad">
                                        {{ t("Retry") }}
                                    </NButton>
                                    <NButton @click="resetFilters">
                                        {{ t("Reset Filters") }}
                                    </NButton>
                                </div>
                            </div>

                            <!-- 空状态 -->
                            <div v-else-if="!loading && filteredData.length === 0" class="pane-state">
                                <div class="state-icon">
                                    <svg v-if="data.length === 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                                        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                                        <path d="M3 12A9 3 0 0 0 21 12" />
                                    </svg>
                                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                        <line x1="8.5" y1="8.5" x2="13.5" y2="13.5" />
                                        <line x1="13.5" y1="8.5" x2="8.5" y2="13.5" />
                                    </svg>
                                </div>
                                <div class="state-title">
                                    {{ data.length === 0 ? t("No words yet") : t("No matching words") }}
                                </div>
                                <div class="state-description">
                                    {{ data.length === 0 ? t("Start by adding your first word.") : t("No words match the selected tags.") }}
                                </div>
                                <div class="state-actions">
                                    <NButton v-if="data.length === 0" type="primary" @click="onAddWord">
                                        {{ t("Learning New Words") }}
                                    </NButton>
                                    <NButton v-if="hasAnyFilter" @click="resetFilters">
                                        {{ t("Reset Filters") }}
                                    </NButton>
                                </div>
                            </div>

                            <!-- 数据区 -->
                            <div v-else class="ledger-section">
                                <div class="pane-meta">
                                    <span class="meta-text">
                                        {{ t("Showing {0} of {1} words", data.length, totalCount) }}
                                    </span>
                                </div>

                                <WordCardList
                                    :data="data"
                                    @edit="handleEditWord"
                                />

                                <div v-if="!loading && hasMore && data.length > 0" class="load-more-section">
                                    <NSpin :show="loadingMore" size="small">
                                        <div class="load-more-text">
                                            {{ loadingMore ? t("Loading...") : t("Scroll down to load more") }}
                                        </div>
                                    </NSpin>
                                </div>

                                <div v-if="!loading && !hasMore && data.length > 0" class="no-more-section">
                                    <NText depth="3">
                                        {{ t("No more data") }}
                                    </NText>
                                </div>
                            </div>
                        </NSpin>
                    </main>
                </div>
            </NMessageProvider>
        </NConfigProvider>

        <LearnPanelModal @onChangeWord="onChangeWord" @on-change-show="onChangeShow" :show="showWordModal" :word="word"/>
    </div>
</template>

<script setup lang="ts">
import {moment, Notice} from "obsidian";
import {
    ref,
    computed,
    watch,
    getCurrentInstance,
    onMounted,
    onBeforeUnmount,
} from "vue";
import {
    NConfigProvider,
    NButton,
    NSelect,
    NSpin,
    NText,
    GlobalThemeOverrides,
    darkTheme,
    NMessageProvider,
} from "naive-ui";
import {t} from "@/lang/helper";

import type PluginType from "@/plugin";
import LearnPanelModal from "@/views/LearnPanelModal.vue";
import { getThemeOverrides } from "@/styles/theme";
import { StatusClassMap } from "@/statusColors";

// 导入拆分的子组件
import ActionButtons from "@/component/DataPanel/ActionButtons.vue";
import SearchFilterPanel from "@/component/DataPanel/SearchFilterPanel.vue";
import TagFilter from "@/component/DataPanel/TagFilter.vue";
import WordCardList from "@/component/DataPanel/WordCardList.vue";

const plugin = getCurrentInstance().appContext.config.globalProperties
    .plugin as PluginType;

const themeConfig = computed<GlobalThemeOverrides>(() =>
    getThemeOverrides(plugin.store.dark)
);

const loading = ref(true);
const error = ref<string | null>(null);
const retryCount = ref(0);
const scrollContainer = ref<HTMLElement | null>(null);
const loadingMore = ref(false);
const currentPage = ref(0);
const pageSize = ref(20);
const hasMore = ref(true); // 是否还有更多数据
const totalCount = ref(0); // 服务器端符合条件的总数（含未加载页）

// 用户偏好设置的键名
const PREFS_KEY = 'datapanel-prefs';

// 保存用户偏好
const savePrefs = () => {
    const prefs = {
        sort: {
            field: sortParams.value.field,
            order: sortParams.value.order
        },
        search: {
            expression: searchParams.value.expression,
            meaning: searchParams.value.meaning,
            status: searchParams.value.status,
            t: searchParams.value.t
        }
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

// 加载用户偏好
const loadPrefs = () => {
    try {
        const saved = localStorage.getItem(PREFS_KEY);
        if (saved) {
            const prefs = JSON.parse(saved);
            if (prefs.sort?.field && prefs.sort?.order) {
                // 旧偏好可能存有已移除的状态排序，统一回落到日期
                sortParams.value.field = 'date';
                sortParams.value.order = prefs.sort.order === 'asc' ? 'asc' : 'desc';
            }
            if (prefs.search) {
                searchParams.value = {
                    expression: prefs.search.expression || '',
                    meaning: prefs.search.meaning || '',
                    status: prefs.search.status,
                    t: prefs.search.t
                };
            }
        }
    } catch (error) {
        console.error('Failed to load preferences:', error);
    }
};

// 切换明亮/黑暗模式
const theme = computed(() => {
    return plugin.store.dark ? darkTheme : null;
});

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

const showWordModal = ref(false);
const word = ref({})

const statusMap = [
    t("Ignore"),
    t("Learning"),
    t("Familiar"),
    t("Known"),
    t("Learned"),
];

// 状态 → CSS 类名（颜色由 --status-* 变量提供）
const statusClass = (statusIndex: number) => {
    return StatusClassMap[statusIndex] || 'ignore';
};

// 类型选项（筛选轨分段按钮）
const typeOptions = [
    { label: t("All"), value: undefined },
    { label: t("Word"), value: "WORD" },
    { label: t("Phrase"), value: "PHRASE" }
];

// 排序选项（仅按日期；状态排序已移除）
const sortOptions = computed(() => [
    { label: t("Newest first"), value: "date:desc" },
    { label: t("Oldest first"), value: "date:asc" },
]);

// 搜索和筛选状态
const searchParams = ref({
    expression: '',
    meaning: '',
    status: undefined as number | undefined,
    t: undefined as string | undefined
});

// 排序状态（仅支持按日期先后）
const sortParams = ref({
    field: 'date' as const,
    order: 'desc' as 'asc' | 'desc'
});

// 窄屏（右侧边栏停靠）下筛选轨的展开状态
const railOpen = ref(false);

const sortValue = computed(() => `${sortParams.value.field}:${sortParams.value.order}`);

// 改变显示新增显示状态
const onChangeShow = (state: boolean) => {
    showWordModal.value = state
}

const onChangeWord = () => {
    expressions();
}

const onAddWord = () => {
    word.value = {
        expression: null,
        meaning: null,
        status: 0,
        t: "WORD",
        tags: [],
        notes: [],
        sentences: [],
    };
    showWordModal.value = true;
}

// 卡片编辑处理
const handleEditWord = async (item: Row) => {
    // 列表与库可能短暂不同步（如刚被其他端删除），查不到时兜底为空表单而不是 undefined
    word.value = (await plugin.storage.DB()?.getExpression(item.expr)) ?? {
        expression: item.expr,
        meaning: null,
        status: 1,
        t: "WORD",
        tags: [],
        notes: [],
        sentences: [],
        connections: [],
    };
    showWordModal.value = true;
};

const emptySearch = () => ({
    expression: '',
    meaning: '',
    status: undefined,
    t: undefined
});

// 重置搜索和筛选（含标签）
const resetFilters = () => {
    const tagsWillChange = selectedTags.value.length > 0;
    const searchChanged =
        hasActiveFilters.value ||
        sortParams.value.field !== 'date' ||
        sortParams.value.order !== 'desc';

    searchParams.value = emptySearch();
    sortParams.value = { field: 'date', order: 'desc' };
    checkedTags.value = tags.value.map(() => false);
    savePrefs();

    // 标签变化会经下方 watch 触发重查；仅搜索/排序变化时这里手动重查
    if (!tagsWillChange && searchChanged) {
        refetchFromFirstPage();
    }
};

// 检查是否有激活的搜索/筛选条件
const hasActiveFilters = computed(() => {
    return Boolean(
        searchParams.value.expression ||
        searchParams.value.meaning ||
        searchParams.value.status !== undefined ||
        searchParams.value.t
    );
});

// 含标签在内的全部筛选条件（驱动命令条与筛选轨的重置按钮）
const hasAnyFilter = computed(() => hasActiveFilters.value || selectedTags.value.length > 0);

// 筛选轨：状态 / 类型
const setStatus = (idx: number | undefined) => {
    if (searchParams.value.status === idx) return;
    searchParams.value.status = idx;
    savePrefs();
    refetchFromFirstPage();
};

const setType = (value: string | undefined) => {
    if (searchParams.value.t === value) return;
    searchParams.value.t = value;
    savePrefs();
    refetchFromFirstPage();
};

// 搜索变化处理（防抖已在 SearchFilterPanel 中处理）
const onSearchChange = () => {
    savePrefs();
    refetchFromFirstPage();
};

const refetchFromFirstPage = () => {
    currentPage.value = 0;
    data.value = [];
    hasMore.value = true;
    expressions();
};

// 排序变化
const onSortChange = (value: string) => {
    const [field, order] = value.split(':') as ['date', 'asc' | 'desc'];
    if (sortParams.value.field === field && sortParams.value.order === order) return;
    sortParams.value.field = field;
    sortParams.value.order = order;
    savePrefs();
    refetchFromFirstPage();
};

// 兼容文件同步后的数据库未重新打开读取数据问题
const refresh = async () => {
    if (loading.value) {
        return;
    }

    loading.value = true

    // 重新注册数据库
    await plugin.storage.reRegister(plugin.settings.storage.storage_type);

    await expressions();
};

const expressions = async () => {
    // 如果是初始加载（currentPage为0），显示全局loading
    const isInitialLoad = currentPage.value === 0;
    if (isInitialLoad) {
        loading.value = true;
    }
    error.value = null;

    try {
        // 构建搜索参数
        const search: any = {};
        if (searchParams.value.expression) {
            search.expression = searchParams.value.expression;
        }
        if (searchParams.value.meaning) {
            search.meaning = searchParams.value.meaning;
        }
        if (searchParams.value.status !== undefined) {
            search.status = searchParams.value.status;
        }
        if (searchParams.value.t) {
            search.t = searchParams.value.t;
        }

        // 添加标签搜索（选中的标签）
        const selectedTagsArray = selectedTags.value;
        if (selectedTagsArray.length > 0) {
            search.tags = selectedTagsArray;
        }

        // 构建排序参数 - 映射字段名
        const sort: any = {};
        const fieldMapping: Record<string, string> = {
            'status': 'status',
            'date': 'date'
        };

        if (sortParams.value.field) {
            const mappedField = fieldMapping[sortParams.value.field] || sortParams.value.field;
            sort[mappedField] = sortParams.value.order;
        }

        // 传递真实的分页参数给后端
        const paginate = {
            page: currentPage.value,  // 当前页码（0-based）
            pageSize: pageSize.value  // 每页大小
        };

        let response = await plugin.storage.DB().getAllExpressionSimple(
            true,  // ignores
            sort,   // sort
            Object.keys(search).length > 0 ? search : undefined,  // search（包含标签）
            paginate  // 传递分页参数
        );

        // 处理数据
        const newData = response.data.map((entry: any): Row => {
            let date = moment(entry.date);

            return {
                expr: entry.expression,
                status: statusMap[entry.status],
                statusIndex: entry.status, // 添加状态索引用于颜色映射
                meaning: entry.meaning,
                tags: entry.tags,
                noteNum: entry.note_num,
                senNum: entry.sen_num,
                date: date.format("YYYY-MM-DD"),
            };
        });

        // 如果是初始加载，替换所有数据；否则追加新数据
        if (isInitialLoad) {
            data.value = newData;
        } else {
            data.value = [...data.value, ...newData];
        }

        // 更新总数与 hasMore 状态
        totalCount.value = response.total;
        hasMore.value = data.value.length < response.total;

        // 只加载一次标签集（即使为空）。
        // 历史死循环：此前用 `tags.value.length === 0` 判断，标签集为空的用户
        // 每次加载都会重新赋值 tags/checkedTags（新数组引用），
        // 触发下方 watch → 回调再次 expressions() → 无限循环反复重载页面
        if (!tagsLoaded) {
            tagsLoaded = true;
            tags.value = await plugin.storage.DB().getTags();
            // Array(n) 是稀疏数组，map 不会执行，必须用 fill
            checkedTags.value = Array(tags.value.length).fill(false);
        }
    } catch (err) {
        console.error("Failed to load expressions:", err);
        error.value = t("Failed to load data. Please try again.");
        data.value = [];
        new Notice(t("Failed to load data"));
    } finally {
        loading.value = false;
        loadingMore.value = false;
    }
}

// 重试加载数据
const retryLoad = () => {
    retryCount.value++;
    expressions();
};

// 导出数据
const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = filteredData.value;

    if (format === 'csv') {
        exportToCSV(dataToExport);
    } else if (format === 'json') {
        exportToJSON(dataToExport);
    }
};

// 导出为 CSV
const exportToCSV = (data: Row[]) => {
    if (data.length === 0) {
        new Notice(t("No data to export"));
        return;
    }

    // CSV 头部
    const headers = ['Expression', 'Meaning', 'Tags', 'Status', 'Date', 'Notes Count', 'Sentences Count'];

    // CSV 数据
    const csvData = data.map(row => [
        `"${row.expr}"`,
        `"${(row.meaning || '').replace(/"/g, '""')}"`,
        `"${row.tags.join(', ')}"`,
        `"${row.status}"`,
        `"${row.date}"`,
        row.noteNum,
        row.senNum
    ]);

    // 组合 CSV
    const csv = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
    ].join('\n');

    // 创建 Blob 并下载
    downloadFile(csv, 'word-data.csv', 'text/csv;charset=utf-8;');
    new Notice(`${t("Words exported successfully")}: ${data.length} ${t("words").toLowerCase()}`);
};

// 导出为 JSON
const exportToJSON = (data: Row[]) => {
    if (data.length === 0) {
        new Notice(t("No data to export"));
        return;
    }

    const jsonData = data.map(row => ({
        expression: row.expr,
        meaning: row.meaning,
        tags: row.tags,
        status: row.status,
        statusIndex: row.statusIndex,
        date: row.date,
        notesCount: row.noteNum,
        sentencesCount: row.senNum
    }));

    const json = JSON.stringify(jsonData, null, 2);
    downloadFile(json, 'word-data.json', 'application/json;charset=utf-8;');
    new Notice(`${t("Words exported successfully")}: ${data.length} ${t("words").toLowerCase()}`);
};

// 下载文件辅助函数
const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

onMounted(async () => {
    loadPrefs(); // 加载用户偏好
    await expressions();
    ready = true;
    setupInfiniteScroll();
});

onBeforeUnmount(() => {
    cleanupInfiniteScroll();
});

let data = ref<Row[]>([]);

let mode = ref("and");
let tags = ref<string[]>([]);
let checkedTags = ref<boolean[]>([]);
let tagsLoaded = false;
/** 初始加载完成前，tags/checkedTags 的程序性赋值不应触发重查 */
let ready = false;

// 根据标签筛选数据（优化：缓存选中的标签数组）
const selectedTags = computed(() => {
    return tags.value.filter((tag, i) => checkedTags.value[i]);
});

// 根据标签筛选数据（现在用于显示筛选结果提示）
const filteredData = computed(() => {
    return data.value; // 标签筛选已移到后端，前端直接显示所有数据
});

// 监听标签变化，重新加载数据（从后端获取）
watch([selectedTags, mode], () => {
    if (!ready) return;
    // 标签筛选改变时重置并重新加载
    refetchFromFirstPage();
}, { deep: true });

// 防抖函数
const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number
): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

// 检查是否滚动到底部
const checkScrollBottom = () => {
    if (!scrollContainer.value) return;

    const container = scrollContainer.value;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // 当滚动到距离底部 200px 时触发加载
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceToBottom < 200 && !loadingMore.value && !loading.value && hasMore.value) {
        loadMore();
    }
};

// 防抖版本的滚动检查
const debouncedCheckScroll = debounce(checkScrollBottom, 100);

// 加载更多数据（调用后端获取下一页）
const loadMore = async () => {
    if (loadingMore.value || loading.value || !hasMore.value) return;

    loadingMore.value = true;
    currentPage.value++;

    try {
        await expressions();
    } catch (err) {
        console.error("Failed to load more:", err);
        currentPage.value--; // 回退页码
    }
};

// 设置无限滚动
const setupInfiniteScroll = () => {
    if (scrollContainer.value) {
        scrollContainer.value.addEventListener('scroll', debouncedCheckScroll);
    }
};

// 清理无限滚动
const cleanupInfiniteScroll = () => {
    if (scrollContainer.value) {
        scrollContainer.value.removeEventListener('scroll', debouncedCheckScroll);
    }
};

// 监听 scrollContainer 变化，重新设置滚动监听
watch(scrollContainer, (newContainer) => {
    if (newContainer) {
        setupInfiniteScroll();
    }
});
</script>

<style lang="scss">
#langr-data {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;

    // ── 顶部命令条 ───────────────────────────────────────────
    .command-strip {
        display: flex;
        align-items: center;
        gap: var(--ll-space-2);
        flex-wrap: wrap;
        padding: var(--ll-space-2) var(--ll-space-4);
        background: var(--ll-surface);
        border-bottom: 1px solid var(--ll-border);
        flex-shrink: 0;

        // 筛选轨折叠按钮：仅窄屏显示
        // （padding/box-sizing/svg flex-shrink 显式声明，防宿主全局 button 规则挤压图标）
        .rail-toggle {
            display: none;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            padding: 0;
            box-sizing: border-box;
            flex-shrink: 0;
            border: 1px solid var(--ll-border);
            border-radius: var(--ll-radius-sm);
            background: var(--ll-surface);
            color: var(--ll-text-2);
            cursor: pointer;
            transition: color var(--ll-speed) var(--ll-ease),
                border-color var(--ll-speed) var(--ll-ease),
                background-color var(--ll-speed) var(--ll-ease);

            svg {
                width: 14px;
                height: 14px;
                display: block;
                flex-shrink: 0;
            }

            &:hover {
                color: var(--ll-text);
                background: var(--ll-hover);
            }

            &:focus-visible {
                outline: 2px solid var(--ll-primary);
                outline-offset: 1px;
            }

            &.active {
                color: var(--ll-primary-strong);
                border-color: var(--ll-primary);
                background: var(--ll-primary-soft);
            }
        }

        .cmd-sort {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;

            .cmd-sort-label {
                font-size: 12px;
                color: var(--ll-text-3);
                white-space: nowrap;
            }

            .n-select {
                min-width: 128px;
            }
        }
    }

    // ── 主体：筛选轨 + 数据区 ────────────────────────────────
    .panel-body {
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .filter-rail {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        width: 216px;
        overflow-y: auto;
        background: var(--ll-surface-2);
        border-right: 1px solid var(--ll-border);

        .rail-section {
            padding: var(--ll-space-3) var(--ll-space-3) var(--ll-space-2);

            & + .rail-section {
                border-top: 1px solid var(--ll-border);
            }
        }

        .rail-title {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--ll-text-3);
            margin-bottom: var(--ll-space-2);
        }

        .rail-status-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .rail-status-item {
            display: flex;
            align-items: center;
            gap: var(--ll-space-2);
            width: 100%;
            padding: 5px var(--ll-space-2);
            border: none;
            border-radius: var(--ll-radius-sm);
            background: transparent;
            color: var(--ll-text-2);
            font-size: 13px;
            text-align: left;
            cursor: pointer;
            transition: background-color var(--ll-speed) var(--ll-ease),
                color var(--ll-speed) var(--ll-ease);

            .dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--ll-text-3);
                flex-shrink: 0;
            }

            .lbl {
                flex: 1;
                min-width: 0;
            }

            .check {
                width: 13px;
                height: 13px;
                flex-shrink: 0;
            }

            &:hover {
                background: var(--ll-hover);
                color: var(--ll-text);
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

            // 各状态选中态：圆点与文字取状态色
            @each $s in ignore learning familiar known learned {
                &.s-#{$s} .dot {
                    background: var(--status-#{$s}-main);
                }

                &.s-#{$s}.active {
                    color: var(--status-#{$s}-main);
                    background: var(--status-#{$s}-bg);
                }
            }
        }

        .rail-tags {
            flex: 1;
        }

        .rail-footer {
            padding: var(--ll-space-3);
            border-top: 1px solid var(--ll-border);
            margin-top: auto;
        }
    }

    // ── 数据区 ──────────────────────────────────────────────
    .list-pane {
        flex: 1;
        min-width: 0;
        overflow-y: auto;
        position: relative;
        background: var(--ll-surface);
    }

    .pane-meta {
        padding: var(--ll-space-2) var(--ll-space-4);
        border-bottom: 1px solid var(--ll-border);

        .meta-text {
            font-size: 12px;
            color: var(--ll-text-3);
            font-variant-numeric: tabular-nums;
        }
    }

    // 空 / 错误状态：方形图标块（内容优先，弱装饰）
    .pane-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 72px 20px;
        text-align: center;

        .state-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 56px;
            height: 56px;
            margin-bottom: var(--ll-space-4);
            border-radius: var(--ll-radius-md);
            color: var(--ll-primary);
            background: var(--ll-primary-soft);

            svg {
                width: 26px;
                height: 26px;
            }

            &.is-error {
                color: var(--ll-danger);
                background: transparent;
                border: 1px solid var(--ll-danger);
            }
        }

        .state-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--ll-text);
            margin-bottom: var(--ll-space-2);
        }

        .state-description {
            font-size: 13px;
            line-height: 1.6;
            color: var(--ll-text-3);
            margin-bottom: var(--ll-space-5);
            max-width: 420px;
        }

        .state-actions {
            display: flex;
            justify-content: center;
            gap: var(--ll-space-3);
        }
    }

    // 加载更多
    .load-more-section {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--ll-space-4);

        .load-more-text {
            font-size: 13px;
            color: var(--ll-text-3);
            text-align: center;
        }
    }

    // 没有更多数据
    .no-more-section {
        display: flex;
        justify-content: center;
        padding: var(--ll-space-4);
        font-size: 13px;
        color: var(--ll-text-3);
    }

    // ── 窄屏：视图可能停靠在右侧边栏（约 300px 宽），
    //    筛选轨折叠进命令条按钮，数据区独占宽度 ─────────────────
    @media (max-width: 760px) {
        .command-strip .rail-toggle {
            display: flex;
        }

        .panel-body {
            flex-direction: column;
            overflow-y: auto;

            // 折叠态：隐藏筛选轨
            .filter-rail {
                display: none;
            }

            // 展开态：筛选轨转为顶部横排块
            &.rail-open .filter-rail {
                display: flex;
                width: auto;
                flex-shrink: 0;
                max-height: 50vh;
                overflow: visible;
                border-right: none;
                border-bottom: 1px solid var(--ll-border);

                .rail-status-list {
                    flex-direction: row;
                    flex-wrap: wrap;
                }

                .rail-status-item {
                    width: auto;
                }
            }
        }

        .list-pane {
            overflow: visible;
        }
    }
}
</style>
