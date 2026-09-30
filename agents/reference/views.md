# 视图层架构（views/）

> **类型**：技术参考（现行有效）　**最后同步**：2026-09-30
> 视图代码在 `src/views/`，通用组件在 `src/component/`。UI 视觉规范见 [ui-design-system.md](ui-design-system.md)。

## 挂载模型

每个 Obsidian 视图（ItemView 子类）在 `onOpen` 时用 `createApp(<Xxx>.vue)` 挂载到 `container`，并通过 `app.config.globalProperties` 注入 `plugin` / `view` 两个对象；组件内用 `getCurrentInstance().appContext.config.globalProperties` 取回。卸载时 `vueapp.unmount()`。**这不是单例 store 的替代**：跨视图信号走 `src/store.ts`（reactive）+ window 自定义事件。

插件启动时还会在 `document.body` 上挂一个常驻 Vue 根 `Global.vue`（`.langr-app` 容器），承载划词弹窗 `PopupSearch`。

## 视图清单

| 视图类型常量 | ItemView 类 | 根组件 | 功能 |
|--------------|-------------|--------|------|
| `SEARCH_PANEL_VIEW` | SearchPanelView | SearchPanel.vue | 查词面板：查询区两级（当前词词头 + 历史前进/后退、输入查词），词典列表（DictItem 折叠分区） |
| `LEARN_PANEL_VIEW` | LearnPanelView | LearnPanel.vue | 侧边栏新词表单（LearnPanelForm + 自带提交按钮经 `#action` 槽） |
| `DATA_PANEL_VIEW` | DataPanelView | DataPanel.vue | 单词本（见 [datapanel.md](datapanel.md)） |
| `READING_VIEW_TYPE` | ReadingView | ReadingArea.vue | 阅读模式 |
| `STAT_VIEW_TYPE` | StatView | Stat.vue | 统计仪表盘（总览带 + 非对称网格：7 日趋势大图 + 双环形图） |

## 事件总线（window CustomEvent）

| 事件 | 载荷 | 方向 |
|------|------|------|
| `obsidian-langr-search` | `detail.selection`（词）、`detail.target`（命中的 DOM） | 阅读页划词 → LearnPanel/PopupSearch 填词 |
| `obsidian-langr-refresh` | `detail.{expression,type,status}` | 提交单词后 → 阅读页刷新高亮 |
| `obsidian-langr-refresh-stat` | 无 | 任何数据变更 → Stat 重查、ReadingArea 重计词 |

监听用 `addEventListener` + 对应 `onUnmounted` 清理（Global 里的 PopupSearch 用 `@vueuse/core` 的 `onClickOutside`/`onKeyStroke`）。

## LearnPanelForm 的双入口

`LearnPanelForm.vue` 被**侧边栏**（LearnPanel.vue，提交按钮经 `#action` 槽插在表单尾部）与**弹框**（LearnPanelModal.vue，提交/取消在弹框底栏 `#action`）共用。共享逻辑在 `useLearn.ts`：表单 model、校验 rules、标签异步搜索（tagSearch）、`submit()`（提交 → `postExpression` → 广播 refresh 事件 → 可选自动刷新文本库）。改动表单结构时两个入口都要验证。

## ReadingArea 要点

- 正文经 `plugin.parser.parse()` 产出带 `span.word/.phrase/.stns` 的 HTML（v-html 渲染），状态类 `ignore/learning/familiar/known/learned` 由 `--status-*` 变量着色
- 桌面端 pointerdown/up 选词、移动端两次 click 组合选区（`constants.platform` 分支）
- 分页：段落页（`langr-pos` frontmatter 记忆位置）+ 底部居中 NPagination；顶栏为「笔记 + 本页词汇进度（CountBar，点击切换数量/百分比）+ 完成阅读」；音频存在时独立成条；笔记抽屉（NDrawer，双栏输入/渲染）
- 「完成阅读」把本页 `.word.new` 批量 `postIgnoreWords`（upsert 语义）

## 通用组件（src/component/）

| 组件 | 用途 |
|------|------|
| WordMoreModal | 单词详情弹框（笔记/例句/复制，见 datapanel.md） |
| AudioPlayer | 阅读页音频播放器（自动重试/缓冲状态文案，见 i18n.md 词条清单） |
| WordMore.vue | 已废弃（无引用） |
| DataPanel/* | 见 [datapanel.md](datapanel.md) |
