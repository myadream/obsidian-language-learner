# 设计：内建间隔重复复习系统（移植 obsidian-spaced-repetition 业务流程）

日期：2026-10-01
状态：已批准（brainstorming 对话确认）

## 1. 背景与目标

本插件当前的"复习"是**单向导出**：`refreshReviewDb`（src/plugin.ts:301-368）把生词库写成 Spaced Repetition（下称 SR）插件兼容的 md 卡片文件，复习完全委托外部 SR 插件，进度只存在于 md 文件的 `<!--SR:due,interval,ease-->` 注释里，数据库内没有任何复习字段。

目标：把 SR 插件的调度业务流程搬进本插件，**复习在本插件内闭环**——生词库直接作为卡片来源，内建复习界面 + FSRS/SM-2 双算法调度，进度落在本插件自己的存储里；旧的"导出 md 委托外部插件"流程完全删除（SR 外部插件退役）。

**关键决策**（对话确认）：

| 决策点 | 结论 |
|---|---|
| 旧导出流程 | 完全删除，不做兼容开关 |
| 算法 | FSRS（ts-fsrs）+ SM-2 双算法可切换，默认 FSRS |
| 调度存储 | 数据库**独立关联表** `schedules`，`ExpressionInfo` 主表零改动 |
| 算法实现路线 | 方案 B'：自写精简调度器（SM-2 纯函数 + ts-fsrs 薄封装），以**上游单测期望值**为黄金用例保证等价 |
| 旧进度 | 提供设置页**手动一键迁移**（从 review_database.md 解析 `<!--SR:-->`），不自动迁移 |
| 导入导出 | JSON v2 全保真携带 schedule；CSV 维持词条级（限制已记录） |

上游源：`E:\opensource\obsidian\obsidian-spaced-repetition`（v1.15.4，MIT）。算法语义以其 `src/scheduling/` 为准。

## 2. 范围

**做**：调度算法层、schedules 关联表（5 驱动中的 4 个 + api 弃用处理）、复习队列服务、ReviewView（Obsidian ItemView + Vue）、JSON 导入导出升级、SR 进度手动迁移、设置项增删、旧业务删除、测试。

**不做**（YAGNI，接缝保留）：
- 负载均衡 due-date 直方图（调度函数保留可选 histogram 参数，v1 传 undefined）
- deck 树 / bury / cram 模式 / 每日新卡上限
- 复习历史日志与 Stat 统计打通、DataPanel 到期徽标
- SR 笔记复习（frontmatter `sr-due/sr-interval/sr-ease`）——本插件无笔记复习实体

## 3. 模块结构

```
src/review/
├── types.ts            # WordSchedule、ReviewResponse、ReviewScheduleRecord
├── sm2.ts              # SM-2 纯函数（值对象进出，显式 now 参数，无 Moment）
├── fsrs.ts             # ts-fsrs 薄封装：参数构建 / 评分映射 / Card ↔ WordSchedule 转换
├── migrate.ts          # SM-2 → FSRS 进度换算公式（词的算法与当前设置不一致时用）
├── scheduler.ts        # 装配层：scheduleWord / previewSchedule 统一入口，按词与设置选算法
├── review-service.ts   # 队列构建（join 分桶）、评分落库、当日到期回插
└── migrate-from-sr.ts  # 解析 review_database.md 的 <!--SR:--> 注释 → WordSchedule
```

src/views/ 新增 `ReviewView.ts`（ItemView 包装，沿用 StatView 惯例）+ `ReviewPanel.vue`（Vue 界面）。

上游**不搬**的部分：PageRank 笔记链接图、md 注释序列化（CommentParser/formatScheduleAsSRHtmlComment）、deck 树/bury/cram、笔记复习、全部 UI、i18n `t()`。

## 4. 数据模型

### 4.1 WordSchedule（src/review/types.ts）

```ts
type ReviewResponse = "again" | "hard" | "good" | "easy";
type AlgorithmType = "FSRS" | "SM-2";

interface WordSchedule {
  algorithm: AlgorithmType;  // 生成该记录的算法
  due: number;               // UNIX 秒
  interval: number;          // 天（可为小数）
  // SM-2 专用
  ease?: number;             // 初始 250，下限 130
  // FSRS 专用
  stability?: number;
  difficulty?: number;       // 1-10
  state?: number;            // ts-fsrs State: 0 New / 1 Learning / 2 Review / 3 Relearning
  reps?: number;
  lapses?: number;
  lastReview?: number;       // UNIX 秒
}

interface ReviewScheduleRecord {
  expression: string;        // 关联键，与 expressions.expression 精确相等
  schedule: WordSchedule;
}
```

**无 schedule 记录 = 新卡**。孤儿调度记录（词已删除）无害，不做级联删除。

### 4.2 各驱动的 schedules 存储

| 驱动 | 落点 |
|---|---|
| indexed | Dexie `version(3)`：`schedules: "&expression, due"`；upgrade 为空操作（新表）；运行时存对象 |
| sqlite | 开库路径 `CREATE TABLE IF NOT EXISTS schedules(expression TEXT PRIMARY KEY, algorithm TEXT NOT NULL, due INTEGER NOT NULL, interval REAL NOT NULL, ease REAL, stability REAL, difficulty REAL, state INTEGER, reps INTEGER, lapses INTEGER, last_review INTEGER)`；写入 `ON CONFLICT(expression) DO UPDATE`；主表 DDL 与 user_version 不动 |
| csv | 目录第六个文件 `schedules.csv`，列 `Expression,Algorithm,Due,Interval,Ease,Stability,Difficulty,State,Reps,Lapses,LastReview`（可选字段留空）；缺文件视为空表，首次写入创建；损坏行跳过（沿用现有容错） |
| tedb | 新增一个 JSON 文档，镜像 tags/notes 表的组织方式；schemaless |
| api | 已弃用（不接下拉）：读返回空、写静默忽略，仅满足抽象类 |

## 5. 驱动契约变更（storage/drive.ts）

新增四方法（`getAllSchedules` 兼作导出数据源，不设单独 exportSchedules）：

```ts
getSchedule(expression: string): Promise<WordSchedule | undefined>;
putSchedule(expression: string, schedule: WordSchedule): Promise<void>;   // upsert
getAllSchedules(): Promise<ReviewScheduleRecord[]>;
importSchedules(items: ReviewScheduleRecord[]): Promise<void>;
```

`importSchedules` 语义与 `importData` 对齐：indexed **清空重建**（完整恢复），csv/sqlite/tedb **按 expression 覆盖合并**。契约测试（tests/storage/drive-contract.test.ts）参数化覆盖：round-trip、upsert 覆盖、import 语义、孤儿记录无害。**先改契约测试再改实现**（AGENTS.md 约定）。

## 6. 调度算法（方案 B'）

### 6.1 SM-2（src/review/sm2.ts，移植上游 `osr/note-scheduling.ts` 的 osrSchedule 语义）

输入：`(response, schedule | undefined, now, settings)`；delay = `max(0, (now - due) / 86400)` 天（新卡无 delay）：

- **Easy**：`ease += 20`；`interval = (interval + delay) * ease / 100`；`interval *= easyBonus`
- **Good**：`interval = (interval + delay / 2) * ease / 100`
- **Hard**：`ease = max(130, ease - 20)`；`interval = max(1, (interval + delay / 4) * lapseFactor)`
- **Again**：`ease = max(130, ease - 20)`；`interval = 0`（立即回队列）
- clamp 到 `review_maximum_interval`；interval round 到 0.1 天；`due = now + interval * 86400`
- 新卡首评（上游 `SRAlgorithmOsr.cardGetNewSchedule`，`initialInterval = 1.0`）：`ease = review_sm2_base_ease`、interval 初值 1.0 天、delay = 0，代入上方同公式——Good → 2.5 天，Easy → (1×2.7)×1.3 = 3.51 → 3.5 天，Hard → 1 天，Again → 0
- 无 Moment：纯 UNIX 秒/天数浮点运算

### 6.2 FSRS（src/review/fsrs.ts，ts-fsrs@^5 薄封装）

- 参数：`fsrs({ request_retention: review_fsrs_retention, maximum_interval: review_maximum_interval, enable_short_term: true })`，19 个权重用 ts-fsrs 默认值
- 评分映射：again/hard/good/easy → `Rating.Again/2/3/4`
- 新卡：`createEmptyCard(now)` → `scheduler.next(card, now, grade)`
- 已有卡：`WordSchedule → CardInput`（FSRS 字段直转；SM-2 旧记录先经 §6.3 换算）→ `scheduler.next`
- 输出映射回 `WordSchedule`：due/stability/difficulty/state/reps/lapses/lastReview/scheduled_days→interval

### 6.3 SM-2 → FSRS 换算（src/review/migrate.ts，移植上游 sm2ScheduleToFsrsCard / easeToDifficulty）

- ease → difficulty（上游 `easeToDifficulty`，LEGACY 130–370）：ease 缺省 → `5.5`；否则 `normalized = (clamp(ease,130,370) - 130) / 240`，`difficulty = clamp(10 - normalized * 9, 1, 10)`（ease 130 → 10，370 → 1，越易忘 difficulty 越高）
- 完整换算（上游 `sm2ScheduleToFsrsCard`）：`interval = max(1, round(schedule.interval ?? 1))`；`stability = max(0.1, interval)`；`due` 照用（缺省 now）；`lastReview = due - interval 天`；`elapsed_days = max(0, now - lastReview 天数)`；`scheduled_days = interval`；`reps = max(1, round(log2(interval + 1)))`；`lapses = 0`；`state = Review(2)`
- **触发时机**：设置切到 FSRS 后，评分遇到 `schedule.algorithm === "SM-2"` 的词时先换算再调度（上游同款行为，进度不丢）；反向（FSRS→SM-2）不支持，遇 FSRS 记录在 SM-2 模式下按 due/interval 近似调度（due 照用，ease 缺省 baseEase），spec 级已知限制。

### 6.4 scheduler.ts 装配

```ts
scheduleWord(current: WordSchedule | undefined, response: ReviewResponse, now: number): WordSchedule;
previewAll(current: WordSchedule | undefined, now: number): Record<ReviewResponse, WordSchedule>;  // 按钮预览
```

读 `review_algorithm` 设置选算法；词的 `schedule.algorithm` 与设置不一致时走 §6.3。`now` 显式传参（可测试性优于上游的 globalDateProvider）。

## 7. 复习服务与流程（src/review/review-service.ts）

1. **队列**：`getAllExpressionSimple` + `getAllSchedules` 按 expression 内存 join → 分桶：新卡（无记录）/ 已到期（`due ≤ now`）/ 未来。队列 = 到期（due 升序）+ 新卡（date 升序）。与 DataPanel 全量加载模式一致，不动驱动查询。
2. **正面**：单词大字 + 发音按钮（复用 utils/pronounce）
3. **背面**：释义、标签、笔记、例句（例句中单词大小写不敏感高亮，样式用 `--ll-*` 令牌）
4. **评分**：Again/Hard/Good/Easy 四按钮，各键显示 `previewAll` 的间隔预览（`review_show_interval` 可关）；快捷键 Space 显示答案、1-4 评分
5. **落库**：`scheduleWord` → `putSchedule` → 若新 due 在当日之内（FSRS 短期 / SM-2 Again）回插队尾
6. **完成页**：本次复习张数；调度计算抛错的词跳过并在完成页计数报告（不中断会话）

UI：`ReviewPanel.vue` 状态机 loading → front → back → done；NConfigProvider 合并 `getThemeOverrides(dark)`；评分按钮为 NButton，颜色语义用 `--status-*`/令牌。入口：命令 `langr-review-open`（"开始复习"）+ ribbon 图标；`registerView(REVIEW_VIEW_TYPE, ...)` + `activateView` 惯例。i18n 三语言（en/zh/zh-TW）同步加键。

## 8. 导入导出（storage/transfer.ts）

- **JSON v2**：`{version: 2, exported_at, data[]}`，词条条目新增可选 `schedule` 字段。导出 = `exportData()` + `getAllSchedules()` 按 expression 内存合并；导入 = 拆分，词条走既有 `importData`，调度走 `importSchedules`（语义随驱动）。v1/v0 旧文件（裸数组、`{data:[]}`、旧 Dexie dump）照常导入，无 schedule 视为新卡——完全向后兼容。
- **CSV**（数据库级）：维持五列词条级，不含调度；导入后相关词按新卡处理。作为已记录限制。
- 驱动**视图级**导出（DataPanel 内）与调度无关，不动。

## 9. SR 进度迁移（src/review/migrate-from-sr.ts，手动一键）

1. 解析 `review_database` 设置指向的 md：逐 `#word` 卡片块提取 expression 与 `<!--SR:...-->` 调度段；**两种格式都认**——SM-2 `!YYYY-MM-DD,interval,ease`（多段取该块最后一段）与 FSRS `!fsrs,ISOdue,interval,stability,difficulty,state,reps,lapses,learningSteps,ISOlastReview`（learningSteps 丢弃），正则移植自上游 `src/data/constants.ts`
2. 按 expression 与数据库**精确匹配**，命中 → `putSchedule`；未命中（词已删）跳过计数
3. 入口：设置页按钮「从 SR 文件迁移复习进度」→ 弹框确认路径（默认取 `review_database` 设置值）→ 执行 → Notice 报告匹配/跳过/无 SR 记录数；可重复执行（覆盖写）

## 10. 设置项变更（src/settings.ts）

新增（复习分组）：

| 键 | 默认 | 说明 |
|---|---|---|
| `review_algorithm` | `"FSRS"` | FSRS / SM-2 下拉 |
| `review_fsrs_retention` | `0.9` | FSRS 期望保留率 |
| `review_sm2_base_ease` | `250` | SM-2 初始 ease |
| `review_sm2_easy_bonus` | `1.3` | Easy 加成 |
| `review_sm2_lapse_factor` | `0.5` | Hard/Again 缩减系数 |
| `review_maximum_interval` | `36525` | 最大间隔天数 |
| `review_show_interval` | `true` | 评分按钮间隔预览 |

保留改义：`review_database`（旧导出目标 → **SR 迁移源路径**，文案更新）。
删除：`review_delimiter`（含设置 UI 与 locale）。
语义收窄：`auto_refresh_db` 只刷新 word 文本库（useLearn.ts:166-168 与 plugin.ts `refreshTextDB` 去掉 review 分支）。
不动：`review_prons`。

## 11. 删除清单（旧复习业务）

- `plugin.ts`：`refreshReviewDb`（301-368）、命令 `langr-refresh-review-database`、`refreshTextDB` 的 review 分支、`registerLeftClick` 的 `.sr-modal-content` 监听（537-552）
- 驱动契约与 5 处实现的 `getExpressionAfter`（含 `==word==` 高亮逻辑）、`ReviewWord` 类型（storage/interface.ts:69-78）、drive-contract 测试对应用例（227-249）、migration.test.ts:48 回归点改为等价新断言
- locale 死字符串（如 en.ts:135-136 "Last review sync"）与所有导出相关文案

## 12. 依赖

- 新增运行时依赖 `ts-fsrs@^5`（纯 TS，无 Node 内置模块，移动端安全；不引用 fs/path，无需 vite stub）
- **无 moment**（方案 B' 全程 UNIX 秒）
- playground：`fake-plugin.ts` 增加 fake 调度/存储服务，挂载 Review 面板供浏览器调试（遵守 playground 禁动画约定）

## 13. 测试计划

| 文件 | 覆盖 |
|---|---|
| tests/review/sm2.test.ts | 上游黄金用例逐条转录（四分支、delay 半算、ease 下限、clamp、round、新卡） |
| tests/review/fsrs.test.ts | 固定时钟确定性、参数映射、WordSchedule↔Card 往返、§6.3 换算公式 |
| tests/review/migrate-from-sr.test.ts | 两种注释格式黄金例、多段取末、无记录/无匹配边界 |
| tests/storage/drive-contract.test.ts | schedules 四方法（round-trip/upsert/import 语义/孤儿无害）；删 getExpressionAfter 用例 |
| tests/storage/transfer.test.ts | JSON v2 round-trip 含 schedule；v1/v0 旧格式回归；CSV 词条级限制 |
| tests/storage/（sqlite 迁移） | 老库开库自动建 schedules 表 |
| tests/ui/review-view.test.ts | 挂 ReviewPanel（mock service）：front→back→评分→putSchedule 断言、预览文案、完成页 |

验收门槛：**`pnpm build` + `pnpm test` 双绿**；tsc 存量 7 错误不新增；UI 经 playground 过一遍后进 Obsidian 实测。

## 14. 错误处理

- 调度计算抛错（如 ts-fsrs 收到非法字段）：该词跳过、完成页计数报告，会话不中断
- 迁移：文件缺失/无 SR 记录/全部未匹配 → Notice 明确提示，不写库
- CSV `schedules.csv` 损坏行跳过；缺文件建表
- 未知 `schedule.algorithm` 值（未来版本）：按 SM-2 近似处理并 console.warn
