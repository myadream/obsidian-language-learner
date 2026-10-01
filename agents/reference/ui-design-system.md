# UI 设计系统

> **类型**：技术参考（现行有效）　**最后同步**：2026-10-01（与 src/styles/、各视图核对一致）
> 跨模块约定见根目录 [AGENTS.md](../../AGENTS.md)；状态色细节见 [status-colors.md](status-colors.md)；DataPanel 页面落地见 [datapanel.md](datapanel.md)。

## 设计原则

2026-09-30 全量 UI 重设计确立的方向：

- **扁平化（Flat Design）**：无重渐变、无叠层阴影，仅保留层级提示阴影；150–200ms 过渡
- **内容优先**：融入 Obsidian 界面，不与宿主抢视觉；表面/文字/边框全部映射 Obsidian 原生变量
- **明暗主题自动适配**：一切颜色经 CSS 变量解析，组件代码禁止写死色值
- **SVG 图标**：内联 stroke SVG（Lucide 风格路径，24 viewBox / stroke-width 2），**禁止 emoji 作图标**
- **方形圆角（2026-09-30 v2 确立）**：所有盒型元素使用小圆角倒角（2–6px），**禁止胶囊/椭圆造型**；`--ll-radius-full` 只允许用于真正的圆形元素（状态圆点、图例点、加载圈）
- **无障碍**：可交互元素有可见焦点环与键盘操作；`prefers-reduced-motion` 降级动画

## 色板

| 角色 | 亮色 | 暗色 | 令牌 |
|------|------|------|------|
| 主色（品牌青绿 Teal） | `#0d9488` | `#2dd4bf` | `--ll-primary` |
| 主色加深（hover/强调文字） | `#0f766e` | `#5eead4` | `--ll-primary-strong` |
| 行动强调（橙） | `#ea580c` | `#fb923c` | `--ll-accent` |
| 语义 success/warning/danger/info | 见 tokens.css | 见 tokens.css | `--ll-success` 等 |

## 设计令牌（src/styles/tokens.css）

全部以 `--ll-*` 前缀定义在 `:root`，`.theme-dark` 整体覆盖暗色值（Obsidian 在 body 上切换主题类）。

| 分组 | 变量 | 说明 |
|------|------|------|
| 品牌 | `--ll-primary` / `-strong` / `-suppl` / `-soft` | `-soft` 是 12%（暗 16%）透明度的底色，用于 hover 底、选中底、mark 高亮 |
| 强调 | `--ll-accent` / `-soft` | 行动点（生词计数条等） |
| 表面 | `--ll-surface` / `-2` / `-3` | 映射 `--background-primary/secondary/secondary-alt` |
| 线与文字 | `--ll-border` / `-strong`、`--ll-text` / `-2` / `-3`、`--ll-hover` | 映射 Obsidian 对应变量 |
| 圆角 | `--ll-radius-xs/sm/md/lg/full` | 2/3/4/6/999px；**full 仅限真圆点**（见设计原则） |
| 间距 | `--ll-space-1..6` | 4/8/12/16/24/32px |
| 动效 | `--ll-speed`(180ms) / `-slow`(280ms) / `--ll-ease` | 统一过渡时长与缓动 |
| 阴影 | `--ll-shadow-1` / `-2` | 仅 hover/浮层用 |
| 图表 | `--ll-chart-primary` / `-secondary` | 折线/环形图系列色 |

**使用规则**：组件样式一律引用令牌或 `--status-*`；确需新令牌先加进 tokens.css（含暗色值），不要在组件里私定颜色。

## naive-ui 共享主题（src/styles/theme.ts)

`getThemeOverrides(dark)` 返回 `GlobalThemeOverrides`：主色/语义色/圆角/字号与令牌一致；**common.borderRadius 3px**，并显式覆盖 Button/Card/Dialog/Input/Tag/Pagination/Drawer 圆角（Drawer 为 0 直角），保证 naive-ui 组件全局方形观感。**每个视图的 `NConfigProvider` 都必须合并它**：

```ts
const themeConfig = computed<GlobalThemeOverrides>(() => getThemeOverrides(plugin.store.dark));
// 视图有专属覆盖时展开合并：
const themeConfig = { ...getThemeOverrides(store.dark), Drawer: { ... } };
```

已接入：DataPanel、ReadingArea、SearchPanel、LearnPanelForm（经 useLearn.themeOverrides）、LearnPanelModal、WordMoreModal（继承宿主 provider）。

## 状态色系统

见 [status-colors.md](status-colors.md)。要点：`statusColors.ts`（JS 内联场景）与 `statusColors.css`（CSS 变量）双轨同步维护；Learned 状态 = 品牌青绿；表单里的状态选择器与单词卡状态芯片都走 CSS 变量类。

## 组件级约定

- **SVG 图标**：内联 `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">`（Lucide 风格路径），放在 NButton 里用 `<template #icon>`。**图标 svg 必须写显式 `width`/`height` 属性**（配组件 CSS 双保险）——naive-ui 只约束 `.n-button__icon` 容器尺寸、不管 slot 内 svg，宿主环境 CSS 不可控，漏写会以 300×150 默认尺寸渲染（曾以「图标缺失」形式暴露）。
- **原生 `<button>` 图标按钮必须重置宿主按钮样式**：Obsidian 全局 `button` 规则带 `inline-flex + padding(4px 12px) + height(var(--input-height))`，而 svg 的 UA 默认 `overflow:hidden` 使其作为 flex 子项 `min-width` 塌为 0——固定小尺寸的原生按钮（发音/删除/折叠等）不写 `padding: 0; box-sizing: border-box;` 且 svg 不加 `flex-shrink: 0` 的话，图标会被挤压成色块甚至完全消失（2026-10-01 打包后发音图标消失的根因；naive-ui NButton 自带 padding 不受影响，所以只出现在自绘按钮上）。
- **发音按钮**：volume-2 图标（speaker + 两道弧），`t("Pronounce")` 作 title/aria-label，点击调 `speakWord`（utils/pronounce，全局母语/外语/口音配置）；朗读例句前剥 HTML 标签。现有三处：WordCardList 行内、WordMoreModal 单词旁、WordMoreModal 每条例句旁。
- **长文本单元格禁止 nowrap**：`white-space: nowrap` 的文本会把 flex 链各层 min-content 撑到整行文本宽（`min-width: 0` 挡不住 intrinsic 贡献），曾有列表释义列把整个页面撑出横向滚动。长释义/备注一律换行：`white-space: normal + overflow-wrap: anywhere`（数据行内单词本体可保留单行省略）。
- **v-html 内容的样式**：scoped 样式打不中 `v-html` 注入的节点（无 data-v 属性），相关规则（如 `<mark>` 高亮）必须放**非 scoped 块**并手动命名空间限定（参考 WordMoreModal 末尾 `.word-more-modal .sentence-text mark`）。
- **SCSS `&.class` 嵌套提升特异性**：`&.sentence-card { .x {} }` 编译为 `.item-card.sentence-card .x`（多一个类），媒体查询里的覆盖规则若少写前缀会被基础规则压制且不报错——覆盖选择器必须与被覆盖者同级（实例：LearnPanelForm 例句翻译/出处 <560px 单列规则）。
- **图表颜色**：SVG 表现属性（`stroke="var(--x)"`）**不解析 CSS 变量**，系列色必须经内联 `:style` 传入（CustomChart 的路径/圆点/渐变 stop、DonutChart 的扇区均如此）。
- **弹框**：详见 [datapanel.md](datapanel.md) 的弹框节；关键陷阱——`NModal` 上的自定义 class 落在生成的 `.n-card` / `.n-dialog` 元素**自身**，写样式用 `&.n-card` / 元素自身选择器，不要写后代 `.xxx .n-card`。
- **空状态**：方形圆角底（radius-md）+ 居中 SVG 图标 + 一句说明 + 动作按钮，参考 DataPanel `.pane-state`；详情类弹框的空状态放在内容头部信息（如 WordMoreModal hero）之下，保证标题信息始终可见。
- **状态芯片**：圆点 + 文字的方形小圆角徽标（radius-xs，静态语义徽标，不是可点 pill），样式见 WordCardList 的 `.ll-status-chip`（SCSS `@each` 展开 `--status-*`）。
- **编号分节头**：~~编号分节~~（2026-09-30 v2.1 按用户反馈移除数字前缀）→ 分节统一为「大写小标题 + 底部细线」，操作类节（添加笔记/例句）头部右侧放添加按钮（LearnPanelForm `.form-sec`、WordMoreModal `.section-header`）。**用户偏好：列表筛选用下拉而非分段切换；分节标题不加数字前缀。**

## 2026-09-30 v2 全量布局重设计（方形圆角 + 结构推翻）

在令牌层面把圆角刻度改为 2/3/4/6px（naive-ui 3px），并**不参考旧结构**重做了所有页面与弹框布局：

| 模块 | 旧结构 | 新结构 |
|------|--------|--------|
| DataPanel | 顶部工具栏 + 筛选卡 + 卡片网格 | 命令条（筛选轨折叠按钮[窄屏] + 词/义**下拉**搜索 + 「排序」标题下拉[仅日期] + 操作）+ 左筛选轨（状态色点列表/类型**下拉**/标签清单）+ **账本式数据行**（单词+释义+标签纵块、状态左缘色条、悬停图标操作）；<760px 筛选轨折叠进按钮、行收窄 |
| Stat | KPI 卡行 + 图表卡 + 双环形纵排 | 总览带（三大数字 + 忽略/在学比例条）+ 非对称网格（左趋势大图、右双环形纵列） |
| ReadingArea | 功能区两行 + 底部分页栏 | 顶栏（笔记 + **本页词汇进度条居中** + 完成阅读）+ 独立音频条 + 限宽居中正文 + 底部居中分页栏 |
| CountBar | 胶囊分段条 | 方形分段条（段内名称+数值、右端单位切换提示图标） |
| SearchPanel | 单行工具栏（历史+输入+按钮） | 查询区两级：词头行（当前词大字 + 历史导航）+ 搜索行（前缀图标输入 + 图标主按钮） |
| PopupSearch | 主色拖拽条 | 中性拖拽条（握把点 + Lucide 图钉，方形卡片带边框） |
| LearnPanelForm | 标准纵向表单（radio 圆点） | **分节式表单**（词条/释义/状态/标签/笔记/例句，细线分节**无编号**）；类型为方形分段按钮、状态为分段色带；笔记/例句为**卡片头式卡片**（2026-10-01：类型图标 + 「笔记/例句 N」序号 + 垃圾桶删除在卡片头，输入区全宽；例句翻译/出处带小标签并排、窄屏单列；点「添加」自动滚动定位新卡片） |
| LearnPanelModal | dialog 圆角卡 | 方形 dialog + 顶部 2px 主色线 + 大写小标题 + closable、无 (i) 图标；宽度 `min(640px, 94vw)`，<560px 压缩内边距；提交仍固定底栏 |
| WordMoreModal | 双栏并排（已废弃） | **单词档案**（2026-10-01：内容区顶部 hero＝大号单词 + 发音 + 含义，标题固定「单词详情」）+ 单列纵向（笔记 → 例句，细线分节无编号，每条例句带发音按钮），长内容 `overflow-wrap: anywhere` |

## 交付前检查清单

- [ ] 新样式只引用 `--ll-*` / `--status-*` / Obsidian 变量，无写死色值
- [ ] 明暗两套主题下检查对比度（正文 ≥ 4.5:1）
- [ ] 可交互元素：cursor、hover 反馈（150–300ms）、可见焦点环、键盘可达
- [ ] 动画尊重 `prefers-reduced-motion`
- [ ] 图标全部 SVG（带显式 width/height），无 emoji
- [ ] 原生 `<button>` 图标按钮已重置宿主样式：`padding: 0` + `box-sizing: border-box` + svg `flex-shrink: 0`
- [ ] 长文本单元格（释义/笔记）换行展示，无 `white-space: nowrap` 截断
- [ ] UI 改动用 playground（根 AGENTS.md 常用命令）在明暗两种主题下过一遍截图再交付
- [ ] `pnpm build` 后抽查 styles.css 是否包含新选择器（防止样式入口问题）
