# AGENTS.md — 编码代理项目指南

本文件是编码代理（AI assistant）在本仓库工作的入口文档。目录级专题文档位于 `agents/`，索引见 [agents/README.md](agents/README.md)。

## 项目概况

Obsidian 语言学习插件（Language Learner 的 fork）：在笔记中标注/查词/管理生词、阅读模式、复习（间隔重复 via Obsidian spaced repetition 插件格式）、统计。

- **技术栈**：TypeScript + Vue 3（Composition API）+ naive-ui + Vite 8（lib 模式，CJS 产物）+ pnpm
- **运行环境**：Obsidian 桌面端与移动端（Electron / Capacitor），无 Node 运行时依赖
- **产物**：仓库根目录的 `main.js`、`styles.css`、`sql-wasm.wasm`（`outDir: ./`，emptyOutDir 关闭）

## 常用命令

```bash
pnpm build          # 生产构建（验证改动的主要手段）
pnpm dev            # watch 模式
pnpm test           # vitest run（170 用例）
pnpm run lint       # oxlint（.eslintrc 是遗留配置，勿参照）
npx vite --config playground/vite.config.ts   # UI 调试 playground → http://localhost:5199/playground/index.html
```

UI 改动先在 playground 里过一遍再进 Obsidian：它用真实组件 + 假数据（`playground/fake-plugin.ts`，含长含义/空笔记例句/缺词等边界种子）在浏览器渲染 DataPanel、编辑/新增弹框与单词详情弹框，明暗主题可切换，模块加载错误显示在页内 `#pg-errors`。**注意：playground 页面禁用了全部过渡动画（后台标签页 rAF 节流会让 NModal 过渡卡在半途，截图与几何探针全部失真），此规则不可删。**

验证约定：**`pnpm build` + `pnpm test` 双绿才算完成**。`tsc -noEmit` 有约 7 个 src 存量错误（Indexed handler 的 date 类型、csv handle 的 then 回调、parser.ts 的 nlcst；另有 vite/vitest.config 模块解析），不作为门槛；新增代码不得引入新错误。

## 架构总览

```
src/
├── main.ts                  # 入口（导入 main.css → tokens/statusColors/stalin 三个全局样式）
├── plugin.ts                # Plugin 类：设置/命令/视图注册/queryWord 查词与自动发音
├── settings.ts              # MyPluginSettings + SettingTab；storage.drive 按驱动深合并
├── langs.ts                 # ★ 语言单一事实源（母语/外语/词典/翻译/发音都以它为准）
├── store.ts                 # Vue 全局 reactive store（主题/字号/词典变更信号等）
├── lang/                    # UI i18n（en/zh/zh-TW，跟随 Obsidian 界面语言；见 agents/reference/i18n.md）
├── styles/                  # ★ 设计令牌与共享主题（见 agents/reference/ui-design-system.md）
│   ├── tokens.css           #   --ll-* 令牌（品牌/语义/图表/圆角/间距/动效/阴影，含暗色覆盖）
│   └── theme.ts             #   getThemeOverrides(dark)：naive-ui 共享主题
├── statusColors.ts/.css     # ★ 学习状态色（TS/CSS 双轨；见 agents/reference/status-colors.md）
├── utils/pronounce.ts       # ★ 发音：按文字体系判断母语词/外语词，选 TTS 参数
├── views/                   # 五个 Obsidian 视图（见 agents/reference/views.md）
│   ├── DataPanel.vue        #   单词本（详见 agents/reference/datapanel.md）
│   ├── ReadingArea.vue      #   阅读模式（划词/分页/音频/笔记）
│   ├── Stat.vue             #   统计（KPI + 7 日趋势 + 环形图）
│   ├── SearchPanel.vue      #   查词面板（词典折叠分区）
│   ├── LearnPanelForm.vue   #   ★ 新词表单：侧边栏与弹框双入口共用
│   └── LearnPanelModal.vue  #   新增/编辑单词弹框
├── component/               # 跨视图组件（WordMoreModal / AudioPlayer / DataPanel/*）
├── dictionary/              # 词典引擎（saladict 风格抓取+解析）
│   ├── list.ts              # 注册表：nativeLangs 元数据 + description(native)
│   └── youdao/cambridge/hjdict/deepl/
└── storage/                 # ★ 存储层（见下）
tests/                       # vitest（契约测试为核心）
```

### 语言系统（langs.ts）

8 种语言：`zh / zh-TW / en / jp / kr / fr / de / es`。**代码沿用历史取值 jp、kr（不是 ja/ko），勿改**。`LangDef` 携带：DeepL 代码、BCP-47、有道 dictvoice `le=` 参数、文字体系（han/kana/hangul/latin）、Cambridge 变体。

- 词典可用性：youdao/hjdict 仅中文母语（`nativeLangs`），cambridge 支持 zh/zh-TW/en，deepl 全部。SearchPanel 与设置页按此过滤。
- 发音（utils/pronounce.ts）：`detectWordLang` 判定词属母语还是外语 → 英语走 dictvoice `type=0/1`（美/英音，复用 review_prons 设置），其他语言走 `le=` 参数；失败回退 Web Speech。

### 存储层（storage/）

抽象契约 `storage/drive.ts`，各实现统一行为，**参数序统一为 `getAllExpressionSimple(ignores, sort, search, paginate)`**：

| 驱动 | 文件 | 后端 | 要点 |
|------|------|------|------|
| indexed | drive/Indexed/ | Dexie 4 (IndexedDB)，schema **version(2)** | 句子索引用 `sentence`；句子读取用 `bulkGet` |
| sqlite | drive/sqlite3/ | sql.js（wasm 在仓库根） | `date` 列统一存 **UNIX 秒**，开库自动迁移旧 TEXT 日期；写入 1.5s 去抖落盘 + close 强制；忽略词用 `on conflict do update` |
| csv | drive/csv/ | vault 内 `<目录>/<库名>/*.csv` 五张表 | 内存操作 + 延迟回写 |
| tedb | drive/tedb/ | @qiyangxy/tedb-electron-storage（桌面端专用，未接入 provider 下拉） | 每文档一个 JSON 文件、即时落盘；查询与 CSV 驱动同构 |

其他约定：
- `postIgnoreWords` 语义 = **upsert 保留原数据**（已存在的词仅置 status=0，不清释义/笔记）。
- API 驱动已从设置下拉移除（代码保留）；未知/残留 `api` 类型在 provider.register 回退 indexed。
- 所有驱动行为变更**先改契约测试**（`tests/storage/drive-contract.test.ts`，参数化跑三驱动），再改实现。

### 导入/导出（storage/transfer.ts）

**驱动只面对数据，文件格式统一在外层**：驱动实现 `exportData(): ExpressionInfo[]` / `importData(items)` 纯数据接口；JSON/CSV/SQLite3 的解析与序列化只发生在 `storage/transfer.ts`（`importFromFile` / `exportToFile`），因此任何驱动都可用任意格式互导。

- 统一 JSON 格式 `{version, exported_at, data[]}`（date 为 UNIX 秒）；导入兼容旧裸数组、`{data:[]}`、IndexedDB 旧版 Dexie dump（自动联表还原句子）。
- CSV 列固定 `Expression,Meaning,Status,Type,Tags,Date`（仅词条级，不含笔记/例句），Date 兼容 UNIX 秒与文本日期。
- SQLite3 文件（本插件 schema）只作导入源：`uitils.ts` 的 `extractAllDataFromDatabase` 供 sqlite 驱动导出与 transfer 解析共用；`loadSqlJs` 统一 wasm 加载。
- 导入语义由驱动决定：indexed 为清空重建（完整恢复），csv/sqlite/tedb 为按 expression 覆盖合并；`postExpression(payload, date?)` 第二参数供导入保留原始时间。
- 导出 UI 在设置页（ExportFormatModal 选 JSON/CSV）；DataPanel 里的"导出 CSV/JSON"是**视图级**导出（当前筛选列表），与数据库导入导出无关。

### 测试基建（tests/）

- vitest 5 + happy-dom + fake-indexeddb + 真实 sql.js WASM；`obsidian` 模块经 vitest alias 指向 `tests/setup/obsidian-stub.ts`（网络 API 走 `__net` 注入）。
- **陷阱**：Dexie 在模块导入时捕获 indexedDB 全局，因此 `tests/setup/setup.ts` 必须顶层同步 `import "fake-indexeddb/auto"`，不能放 beforeAll。
- 测试工具：`tests/setup/drive-factory.ts` 的 `makeDrive(type)`（内存 adapter + 独立 fake-IDB）；导入/导出与跨驱动互导见 `tests/storage/transfer.test.ts`。
- **组件测试**（`tests/ui/`，如 `word-detail-and-form.test.ts`）：`@vue/test-utils` 挂真实组件，plugin 经 `global.config.globalProperties` 注入；NModal 内容用 `stubs: { teleport: true }` 留在组件树内；`useMessage` 需要外层 NMessageProvider，测试里 vi.mock 掉；发音走 vi.mock `@/utils/pronounce` 断言调用参数。

### UI 设计系统（styles/）

扁平化 · 青绿主色（亮 `#0d9488`/暗 `#2dd4bf`）· 橙色强调；表面/文字/边框全部映射 Obsidian 变量，明暗主题自动适配。**完整规范见 [agents/reference/ui-design-system.md](agents/reference/ui-design-system.md)**，要点：

- `styles/tokens.css`：全部 `--ll-*` 令牌（品牌色/语义色/图表色/圆角/间距/动效/阴影），`.theme-dark` 覆盖暗色值。**组件样式禁止写死色值，一律引用令牌或 `--status-*`。**
- `styles/theme.ts`：`getThemeOverrides(dark)` 返回共享 naive-ui `GlobalThemeOverrides`；**每个视图的 NConfigProvider 都应合并它**，保证组件观感统一。
- **陷阱**：SVG 表现属性（`stroke="var(--x)"`）不解析 CSS 变量，图表系列色必须经内联 `:style` 传入（见 CustomChart/DonutChart）。
- **陷阱**：NModal 自定义 class 落在生成的 `.n-card`/`.n-dialog` 元素自身，样式用 `&.n-card` 写，后代选择器不匹配。
 - **陷阱**：scoped 样式打不中 `v-html` 注入的节点（无 data-v 属性），相关规则须放非 scoped 块并命名空间限定；按钮内 svg 必须写显式 width/height（naive-ui 不管 slot 内尺寸）；**原生 `<button>` 图标按钮必须 `padding: 0; box-sizing: border-box;` 且 svg 加 `flex-shrink: 0`**（Obsidian 全局 button 规则 + svg 的 UA overflow:hidden 会把小按钮里的图标挤到消失）；长文本单元格禁 `white-space: nowrap`（会把整条 flex 链 min-content 撑爆、页面横向溢出）。细节见 [agents/reference/ui-design-system.md](agents/reference/ui-design-system.md) 组件级约定。
- 全局样式入口是 `src/main.css`，由 `src/main.ts` 导入；直接 import 各分文件不会进产物。

### UI 国际化（lang/）

`helper.ts` 的 `t()` 每次调用动态解析：`localStorage["language"]` → `navigator.language`（BCP-47 基础码回退）→ en。**流程与陷阱见 [agents/reference/i18n.md](agents/reference/i18n.md)**，核心两条：en.ts 是 `keyof` 类型源（缺键 .ts 报错）；`.vue` 不在 tsc 检查范围（缺键静默显示英文），新增文案三语言文件同步加。

## 平台与工程陷阱

- **Windows cmd shell**：`;` 分隔符会被当作参数传给 `pnpm exec`/vitest/tsc（报 "Unknown option"）；`node_modules/.bin/*` 不可直接执行（用 `pnpm exec`）；`node -e "多行脚本"` 常静默失败。每条命令单独执行最稳。
- 移动端：不要引入 `process.*`（vite define 已处理 NODE_ENV）；`fs/path` 等内置模块在 vite.config 中被 stub，新增依赖若引用需同样处理。
- 词典解析依赖 `obsidian.request`/`sanitizeHTMLToDom`，测试中由 stub 提供。

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
