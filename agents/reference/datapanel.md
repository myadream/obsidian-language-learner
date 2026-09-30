# DataPanel 页面架构

> **类型**：技术参考（现行有效）　**最后同步**：2026-09-30
> 入口 `src/views/DataPanel.vue`，子组件在 `src/component/DataPanel/`。设计令牌见 [ui-design-system.md](ui-design-system.md)；历史改造方案见 [../history/datapanel-plan.md](../history/datapanel-plan.md)。

## 页面结构（2026-09-30 v2.1：命令条 + 筛选轨 + 账本行）

```
#langr-data（flex column, 100% 高）
├── .command-strip               # 命令条（底边线）
│   ├── .rail-toggle             # 筛选轨折叠按钮（<760px 显示；视图停靠右侧边栏时用）
│   ├── SearchFilterPanel        # 词/义 NSelect 下拉 + 前缀图标搜索框（500ms 防抖；另一字段有值时橙点提示）
│   ├── .cmd-sort                # 「排序」标题 + NSelect（最新/最早，仅日期；持久化，旧状态排序偏好回落日期）
│   └── ActionButtons            # 刷新/导出/重置（图标按钮）+ 主操作「新增单词」
└── .panel-body（flex；.rail-open 类控制窄屏筛选轨显隐）
    ├── aside.filter-rail        # 左筛选轨（surface-2，216px；<760px 折叠，展开时转顶部横排）
    │   ├── 状态列表              # 全部 + 5 状态行：色点 + 选中态（--status-* 着色 + 勾）
    │   ├── 类型 NSelect          # 全部/单词/短语 下拉
    │   ├── TagFilter            # 标签复选清单 + And/Or tiny 下拉
    │   └── .rail-footer         # 有筛选时显示「重置筛选」dashed 按钮
    └── main.list-pane           # 滚动数据区
        ├── .pane-meta           # 「显示 X / 共 Y 个单词」
        ├── WordCardList         # 账本式数据行（列头 + 行：状态左缘色条 / 单词+释义+标签纵块 / 状态芯片 / 日期 / 记录数 / 悬停图标操作）
        ├── .load-more-section   # 触底 200px 内加载下一页（防抖 100ms，每页 20 条）
        ├── .no-more-section     # 没有更多
        └── .pane-state          # 空/错误状态（方形圆角图标块）
```

行内布局要点：释义作为单词下方的次行展示（无释义时行不留空洞），标签在词块内换行全部展示（无截断列）；<760px（右侧边栏停靠）隐藏列头/日期/记录列、操作按钮常显。

状态/类型/标签筛选都直接改 `searchParams` 并立即重查（`refetchFromFirstPage`）；`resetFilters` 同时清空搜索、排序与标签勾选，标签有变化时经 watch 重查、否则手动重查（避免双请求）。

## 数据流

- `expressions()` → `storage.DB().getAllExpressionSimple(ignores=true, sort, search, paginate)`
- `search` 组装：expression/meaning/status/t + 选中标签 `tags`；搜索输入经 SearchFilterPanel 内 500ms 防抖
- 分页：`currentPage` 0-based，初始加载替换 `data`，加载更多**追加**；`hasMore = data.length < response.total`；`totalCount` 驱动摘要行
- 标签筛选走后端：`watch([selectedTags, mode])` 触发重置 + 重查，受 `ready` 门闩保护
- 排序：sort 状态（status/date × asc/desc）持久化
- **死循环防护（历史坑）**：`tagsLoaded` + `ready` 两个标志保证标签集只加载一次、首载前的程序性赋值不触发 watch 重查（详见 DataPanel.vue 注释）

## 用户偏好

`localStorage["datapanel-prefs"]` 持久化排序与搜索参数（不含标签勾选）；`resetFilters` 同时重置内存与查询。

## 导出

`handleExport('csv'|'json')` 导出当前 `filteredData`（即 `data`，标签筛选已在后端生效）；CSV 含引号转义；走 Blob + 临时 `<a>` 下载。

## 子组件

| 组件 | 职责 | 主要 Props | 主要 Events |
|------|------|-----------|-------------|
| ActionButtons | 命令条右侧操作簇（图标按钮 + 分隔线 + primary 新增） | `hasActiveFilters` | addWord / refresh / resetFilters / export |
| SearchFilterPanel | 词/义 NSelect 下拉 + 单输入框（切换目标字段，另一字段有值时显示橙点提示） | `modelValue` | update:modelValue / search（内部 500ms 防抖） |
| TagFilter | 筛选轨标签清单（原生 checkbox 列表）+ And/Or 模式 | tags / checkedTags / mode | update:checkedTags / update:mode |
| WordCardList | 账本式数据行（列头 + TransitionGroup 行；词块=单词+释义+标签纵块；状态左缘色条；悬停显现图标操作（编辑铅笔/详情眼睛）；键盘可达 role=button；<760px 隐藏列头/日期/记录列、操作常显） | data | edit |
| ~~MobileWordList~~ | **已废弃**（未挂载的死代码，留待清理） | — | — |

数据行内部：状态芯片用 `.ll-status-chip.s-*` 类（方形小圆角，CSS 变量取色）；日期相对化（Today/Yesterday/星期/MM-DD）。

## 弹框（两个，约定相通）

| 弹框 | 用途 | 关键点 |
|------|------|--------|
| LearnPanelModal（`views/`） | 新增/编辑单词 | preset=dialog；方形弹框 + 顶部 2px 主色线 + closable；宽度 `min(640px, 94vw)`，<560px 压缩内边距；**提交/取消固定底栏**（`#action` 槽），内容区独立滚动；编辑态标题切 `t("Edit Word")`；表单体 LearnPanelForm 与侧边栏 LearnPanel 共用——分节式表单（无编号标题），状态选择器为分段色带（`--status-*`），类型为方形分段按钮，笔记/例句为卡片列表（头部添加 + 卡片右上角移除） |
| WordMoreModal（`component/`） | 查看笔记/例句 | preset=card；**单列纵向**（笔记 → 例句，细线分节），长内容 `overflow-wrap: anywhere`；`#header-extra` 复制全部，分节复制；例句中单词 `<mark>` 高亮（primary-soft 底）；空状态带图标 |

**弹框样式陷阱**：NModal 上的自定义 class（`word-more-modal` / `learn-panel-modal`）落在生成的 `.n-card` / `.n-dialog` 元素**自身**上，样式要写 `&.n-card` 或直接对 class 写，后代选择器 `.xxx .n-card` 永远不匹配。

## 样式与令牌

页面样式只引用 `--ll-*` / `--status-*`；过渡 180ms；深浅主题无需分支（变量自适应）。曾存在大量 `:global(body.dark-mode)` 分支——Obsidian 实际类名是 `.theme-dark`，且令牌化后已全部删除。
