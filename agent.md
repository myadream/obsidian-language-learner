# agent.md — 编码代理项目指南

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
pnpm test           # vitest run（100 用例）
pnpm run lint       # oxlint（.eslintrc 是遗留配置，勿参照）
```

验证约定：**`pnpm build` + `pnpm test` 双绿才算完成**。`tsc -noEmit` 有约 12 个存量错误（settings.ts:427、Indexed handler 的 date 类型、parser.ts 的 nlcst、vite.config.ts 模块解析），不作为门槛；新增代码不得引入新错误。

## 架构总览

```
src/
├── main.ts                  # 入口
├── plugin.ts                # Plugin 类：设置/命令/视图注册/queryWord 查词与自动发音
├── settings.ts              # MyPluginSettings + SettingTab；storage.drive 按驱动深合并
├── langs.ts                 # ★ 语言单一事实源（母语/外语/词典/翻译/发音都以它为准）
├── store.ts                 # Vue 全局 reactive store（主题/字号/词典变更信号等）
├── lang/                    # UI i18n（en/zh/zh-TW，跟随 Obsidian 界面语言）
├── utils/pronounce.ts       # ★ 发音：按文字体系判断母语词/外语词，选 TTS 参数
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

抽象契约 `storage/drive.ts`，三个实现统一行为，**参数序统一为 `getAllExpressionSimple(ignores, sort, search, paginate)`**：

| 驱动 | 文件 | 后端 | 要点 |
|------|------|------|------|
| indexed | drive/Indexed/ | Dexie 4 (IndexedDB)，schema **version(2)** | 句子索引用 `sentence`；句子读取用 `bulkGet` |
| sqlite | drive/sqlite3/ | sql.js（wasm 在仓库根） | `date` 列统一存 **UNIX 秒**，开库自动迁移旧 TEXT 日期；写入 1.5s 去抖落盘 + close 强制；忽略词用 `on conflict do update` |
| csv | drive/csv/ | vault 内 `<目录>/<库名>/*.csv` 五张表 | 内存操作 + 延迟回写；导入支持 json/csv，不支持 sqlite3 |

其他约定：
- `postIgnoreWords` 语义 = **upsert 保留原数据**（已存在的词仅置 status=0，不清释义/笔记）。
- API 驱动已从设置下拉移除（代码保留）；未知/残留 `api` 类型在 provider.register 回退 indexed。
- 所有驱动行为变更**先改契约测试**（`tests/storage/drive-contract.test.ts`，参数化跑三驱动），再改实现。

### 测试基建（tests/）

- vitest 5 + happy-dom + fake-indexeddb + 真实 sql.js WASM；`obsidian` 模块经 vitest alias 指向 `tests/setup/obsidian-stub.ts`（网络 API 走 `__net` 注入）。
- **陷阱**：Dexie 在模块导入时捕获 indexedDB 全局，因此 `tests/setup/setup.ts` 必须顶层同步 `import "fake-indexeddb/auto"`，不能放 beforeAll。
- 测试工具：`tests/setup/drive-factory.ts` 的 `makeDrive(type)`（内存 adapter + 独立 fake-IDB）。

## 平台与工程陷阱

- **Windows cmd shell**：`;` 分隔符会被当作参数传给 `pnpm exec`/vitest/tsc（报 "Unknown option"）；`node_modules/.bin/*` 不可直接执行（用 `pnpm exec`）；`node -e "多行脚本"` 常静默失败。每条命令单独执行最稳。
- 移动端：不要引入 `process.*`（vite define 已处理 NODE_ENV）；`fs/path` 等内置模块在 vite.config 中被 stub，新增依赖若引用需同样处理。
- 词典解析依赖 `obsidian.request`/`sanitizeHTMLToDom`，测试中由 stub 提供。

## 文档索引

| 文档 | 类型 | 说明 |
|------|------|------|
| [agents/README.md](agents/README.md) | 架构 | agents/ 目录的文档组织规则与索引 |
| [agents/DataPanel plan.md](agents/DataPanel%20plan.md) | 历史方案 | DataPanel 卡片化+无限滚动改造（已完结） |
| [agents/STATUS_COLORS.md](agents/STATUS_COLORS.md) | 技术参考 | 学习状态颜色系统（现行有效） |
