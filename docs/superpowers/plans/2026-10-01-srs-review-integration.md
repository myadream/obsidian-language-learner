# 内建间隔重复复习系统 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 obsidian-spaced-repetition 的调度业务流程移植进本插件：FSRS/SM-2 双算法、schedules 关联表、内建 ReviewView 复习闭环，完全替换旧的"导出 md 委托外部 SR 插件"流程。

**Architecture:** 纯函数算法层（`src/review/`，显式 now 参数、UNIX 秒，无 Moment）→ 装配层 scheduler → 业务层 ReviewService（内存 join 分桶）→ 独立 `schedules` 关联表（5 驱动，主表零改动）→ Vue ReviewView。上游黄金用例锁定算法等价性。

**Tech Stack:** TypeScript + Vue 3 + naive-ui（既有）；新增运行时依赖 `ts-fsrs@^5`；vitest + happy-dom + fake-indexeddb + makeDrive 测试基建（既有）。

**Spec:** `docs/superpowers/specs/2026-10-01-srs-review-integration-design.md`（commit 4bf22bb）

## Global Constraints

- 门槛：`pnpm build` + `pnpm test` 双绿；tsc 存量 7 错误不新增
- 时间一律 UNIX **秒**；调度函数显式 `now` 参数，禁用 Moment/全局时钟
- Windows cmd：命令逐条执行，禁止 `;` 链与 `node_modules/.bin/*` 直执行（用 `pnpm exec`）
- 驱动行为变更先改契约测试再改实现（AGENTS.md）
- 组件样式禁写死色值，只用 `--ll-*`/`--status-*` 令牌；视图 NConfigProvider 合并 `getThemeOverrides(plugin.store.dark)`
- i18n 三语言文件（en/zh/zh-TW）同步加键；en.ts 是 keyof 类型源
- 新依赖不得引用 Node 内置模块（fs/path/process）
- `ExpressionInfo` 主表字段零改动；无 schedule 记录 = 新卡；孤儿调度记录无害、不做级联删除
- 上游参考源：`E:\opensource\obsidian\obsidian-spaced-repetition`（只读参考，不 import 其代码路径）

## Review Focus

1. **CSV 老目录缺 `schedules.csv`**（存量用户升级后第一次复习）→ 视为空表、全部新卡，首次评分自动建文件；不得抛错。（Task 4 测试钉死）
2. **孤儿调度记录**（词已删但 schedule 还在）→ 不出现在复习队列，导入导出不报错。（Task 4 + Task 6 测试钉死）
3. **跨算法旧记录**（SR 迁移来的 SM-2 记录遇到 FSRS 设置，或反向）→ 评分时先换算再调度，进度不丢、不崩溃。（Task 3 测试钉死）
4. **调度计算抛错**（如损坏的 schedule 字段）→ 跳过该词、完成页计数提示，复习会话不中断。（Task 10 组件测试钉死）
5. **旧 JSON 导入文件**（v1/裸数组/旧 Dexie dump，无 schedule 字段）→ 正常导入、相关词按新卡。（Task 5 测试钉死）

---

### Task 1: 类型 + SM-2 纯函数（上游黄金用例）

**Files:**
- Create: `src/review/types.ts`
- Create: `src/review/sm2.ts`
- Test: `tests/review/sm2.test.ts`

**Interfaces（Produces，后续任务依赖）:**

```ts
// src/review/types.ts
export type ReviewResponse = "again" | "hard" | "good" | "easy";
export type AlgorithmType = "FSRS" | "SM-2";
export interface WordSchedule {
  algorithm: AlgorithmType;
  due: number;          // UNIX 秒
  interval: number;     // 天
  ease?: number;        // SM-2
  stability?: number; difficulty?: number; state?: number;
  reps?: number; lapses?: number; lastReview?: number;  // FSRS，UNIX 秒
}
export interface ReviewScheduleRecord { expression: string; schedule: WordSchedule; }
export interface ReviewSettings {
  algorithm: AlgorithmType; fsrsRetention: number;
  sm2BaseEase: number; sm2EasyBonus: number; sm2LapseFactor: number; maximumInterval: number;
}
```

```ts
// src/review/sm2.ts
export function sm2Next(
  current: Pick<WordSchedule, "interval" | "ease"> | undefined,
  response: ReviewResponse, now: number,
  params: { baseEase: number; easyBonus: number; lapseFactor: number; maximumInterval: number },
): WordSchedule
```

- [ ] **Step 1: Write the failing test** `tests/review/sm2.test.ts`

固定 `now = 1700000000`。用例（全部断言 `algorithm === "SM-2"` 且只填 SM-2 字段）：

```ts
const P = { baseEase: 250, easyBonus: 1.3, lapseFactor: 0.5, maximumInterval: 36525 };
// 新卡（current = undefined，interval 初值 1.0、ease 初值 baseEase、delay 0）
new + good  → { interval: 2.5,  ease: 250, due: now + 2.5 * 86400 }
new + easy  → { interval: 3.5,  ease: 270 }
new + hard  → { interval: 1,    ease: 230 }
new + again → { interval: 0,    ease: 230 }
// 已有卡 { interval: 10, ease: 250 }，now === due（delay 0）
good  → { interval: 25,   ease: 250 }
easy  → { interval: 35.1, ease: 270 }   // 10*2.7*1.3
hard  → { interval: 5,    ease: 230 }
again → { interval: 0,    ease: 230 }
// 延迟 10 天（due = now - 10*86400，interval 10 ease 250）
good → 50；easy → 70.2；hard → 6.3；again → 0
// ease 下限：ease 130 + again → ease 仍 130
// clamp：interval 30000 + easy（delay 0）→ interval 36525
// round 0.1：任取产生小数用例断言 Math.round(i*10)/10
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/review/sm2.test.ts`，Expected: FAIL（模块不存在）
- [ ] **Step 3: Implement** — `types.ts` 照 Interfaces 原样；`sm2Next` 按spec §6.1 分支公式：`delay = current ? max(0, (now - current.due)/86400) : 0`（注意 current 需含 due，参数类型放宽为 `Pick<WordSchedule,"interval"|"ease"|"due"> | undefined`）； Again/Good/Hard/Easy 四分支 → clamp maximumInterval → `Math.round(interval*10)/10` → `{algorithm:"SM-2", due: now + interval*86400, interval, ease}`
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS
- [ ] **Step 5: Commit** — `git add src/review/types.ts src/review/sm2.ts tests/review/sm2.test.ts` + `git commit -m "feat(review): SM-2 调度纯函数与类型（上游黄金用例)"`

### Task 2: ts-fsrs 封装 + SM-2→FSRS 迁移

**Files:**
- Modify: `package.json`（pnpm add ts-fsrs）
- Create: `src/review/fsrs.ts`
- Create: `src/review/migrate.ts`
- Test: `tests/review/fsrs.test.ts`

**Interfaces:**
- Consumes: `WordSchedule`/`ReviewResponse`（Task 1）
- Produces:

```ts
// src/review/fsrs.ts
export function fsrsNext(
  current: WordSchedule | undefined, response: ReviewResponse, now: number,
  params: { requestRetention: number; maximumInterval: number },
): WordSchedule
// src/review/migrate.ts
export function easeToDifficulty(ease: number | undefined): number
export function sm2ToFsrs(current: WordSchedule, now: number): WordSchedule
```

- [ ] **Step 1: Install dependency** — `pnpm add ts-fsrs`
- [ ] **Step 2: Write the failing test** `tests/review/fsrs.test.ts`

固定 `now`（UNIX 秒，内部转 Date）。断言：

```ts
// 新卡各评分：algorithm "FSRS"、state === 2（Review）、reps === 1、stability > 0、due > now、lapses === 0、无 ease 字段
// 确定性：同输入两次调用结果 deep equal
// 已有卡 { stability: 5, difficulty: 5, state: 2, reps: 3, lapses: 0,
//          lastReview: now-5d, due: now+5d, interval: 5 } + good → stability > 5, reps === 4
// clamp：maximumInterval: 36525 生效（构造 interval 40000 的卡，结果 interval ≤ 36525）
// easeToDifficulty：undefined → 5.5；130 → 10；370 → 1；250 → 5.5
// sm2ToFsrs({algorithm:"SM-2", due: now+10d, interval: 10, ease: 250}, now) →
//   { algorithm:"FSRS", due 不变, interval: 10, stability: 10, difficulty: 5.5,
//     lastReview: now（= due − interval）, reps: 3, lapses: 0, state: 2 }
// sm2ToFsrs ease undefined → difficulty 5.5；ease 130 → difficulty 10
```

- [ ] **Step 3: Run to verify fail** — `pnpm exec vitest run tests/review/fsrs.test.ts`，Expected: FAIL
- [ ] **Step 4: Implement**
  - `fsrsNext`：`fsrs({ request_retention, maximum_interval, enable_short_term: true })`；评分映射 again/hard/good/easy → `Rating.Again/2/3/4`；新卡 `createEmptyCard(new Date(now*1000))`；已有卡 `WordSchedule → CardInput`（due/lastReview 秒→Date，stability/difficulty/state/reps/lapses 直转）→ `scheduler.next(card, nowDate, grade)`；输出映射回 `WordSchedule`（`scheduled_days → interval`，Date→秒）
  - `easeToDifficulty`/`sm2ToFsrs`：spec §6.3 公式逐行实现
- [ ] **Step 5: Run to verify pass** — 同 Step 3，Expected: PASS
- [ ] **Step 6: Commit** — `git add package.json pnpm-lock.yaml src/review/fsrs.ts src/review/migrate.ts tests/review/fsrs.test.ts` + `git commit -m "feat(review): ts-fsrs 封装与 SM-2→FSRS 迁移公式"`

### Task 3: scheduler 装配（跨算法换算）

**Files:**
- Create: `src/review/scheduler.ts`
- Test: `tests/review/scheduler.test.ts`

**Interfaces:**
- Consumes: `sm2Next`/`fsrsNext`/`sm2ToFsrs`/`WordSchedule`/`ReviewSettings`
- Produces:

```ts
// src/review/scheduler.ts
export function scheduleWord(
  current: WordSchedule | undefined, response: ReviewResponse,
  now: number, settings: ReviewSettings,
): WordSchedule
export function previewAll(
  current: WordSchedule | undefined, now: number, settings: ReviewSettings,
): Record<ReviewResponse, WordSchedule>
```

- [ ] **Step 1: Write the failing test** `tests/review/scheduler.test.ts`

```ts
const FSRS_ON: ReviewSettings = { algorithm: "FSRS", fsrsRetention: 0.9, sm2BaseEase: 250, sm2EasyBonus: 1.3, sm2LapseFactor: 0.5, maximumInterval: 36525 };
const SM2_ON = { ...FSRS_ON, algorithm: "SM-2" as const };
// current undefined + FSRS_ON + good → algorithm "FSRS"（等于 fsrsNext(undefined,...)）
// current undefined + SM2_ON  + good → algorithm "SM-2"（等于 sm2Next(undefined,...)）
// current = SM-2 记录 {algorithm:"SM-2", interval:10, ease:250, due:now+10d} + FSRS_ON
//   → 结果 deep equal scheduleWord(sm2ToFsrs(current), "good", now, FSRS_ON)，algorithm "FSRS"
// current = FSRS 记录 + SM2_ON + good → 结果 deep equal
//   sm2Next({interval: current.interval, ease: 250}, "good", now, SM2_ON)，algorithm "SM-2"
// previewAll：四键齐全、again 键 dueToday 语义（interval 0）、预览不落库（纯函数）
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/review/scheduler.test.ts`，Expected: FAIL
- [ ] **Step 3: Implement** — `scheduleWord`：`current.algorithm === settings.algorithm` 或无 current → 直调对应 next；SM-2 记录 + FSRS 设置 → 先 `sm2ToFsrs`；FSRS 记录 + SM-2 设置 → 以 `{interval: current.interval, ease: settings.sm2BaseEase}` 调 `sm2Next`。`previewAll` = 四键各调一次 `scheduleWord`
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS
- [ ] **Step 5: Commit** — `git add src/review/scheduler.ts tests/review/scheduler.test.ts` + `git commit -m "feat(review): scheduler 装配与跨算法换算"`

### Task 4: schedules 关联表（契约测试 + 5 驱动）

**Files:**
- Modify: `src/storage/drive.ts`（抽象类加 4 方法，删 L29-30 的 getExpressionAfter 注释区不做——本任务只增不删）
- Modify: `src/storage/drive/Indexed/idb.ts`（Dexie version(3)）
- Modify: `src/storage/drive/Indexed/handler.ts`、`src/storage/drive/sqlite3/handle.ts`、`src/storage/drive/csv/handle.ts`、`src/storage/drive/tedb/handle.ts`、`src/storage/drive/api/handler.ts`
- Test: `tests/storage/drive-contract.test.ts`（在既有参数化结构内加 describe）

**Interfaces:**
- Consumes: `WordSchedule`/`ReviewScheduleRecord`（Task 1）
- Produces（StorageDrive 新抽象方法，5 驱动各实现）:

```ts
getSchedule(expression: string): Promise<WordSchedule | undefined>;
putSchedule(expression: string, schedule: WordSchedule): Promise<void>;   // upsert
getAllSchedules(): Promise<ReviewScheduleRecord[]>;
importSchedules(items: ReviewScheduleRecord[]): Promise<void>;
// 语义：indexed = 清空重建（与 importData 配对）；csv/sqlite/tedb = 按 expression 覆盖合并；
// api 驱动：读返回空、写静默忽略（已弃用，不接下拉）
```

- [ ] **Step 1: Write the failing contract tests**（`drive-contract.test.ts` 参数化循环内新增，indexed/sqlite/csv 全跑）

```ts
describe("schedules", () => {
  // round-trip：putSchedule("alpha", sched) → getSchedule("alpha") deep equal sched；不存在的词 → undefined
  // upsert：同 expression put 两次 → 取第二次
  // getAllSchedules：多条全量返回
  // importSchedules 语义差异：预置 {a, c} 两条，import [{a: s2}, {b: s1}] ——
  //   indexed：结果恰为 {a: s2, b: s1}（c 被清空重建删掉）；csv/sqlite：{a: s2, b: s1, c}（覆盖合并）
  //   （按驱动类型分支断言，沿用文件内既有判断模式）
  // removeExpression("a") 后 getSchedule("a") 仍返回原记录（无级联删除，文档化行为）
});
// csv 专属：全新 drive 的 getAllSchedules() === []（schedules.csv 缺文件视为空表）；
//   putSchedule 后 adapter.read(storage/schedules.csv) 存在且表头为
//   Expression,Algorithm,Due,Interval,Ease,Stability,Difficulty,State,Reps,Lapses,LastReview
// sqlite 专属：老库迁移 —— 用既有 legacy 预置手法（参照 tests/storage/migration.test.ts 的建库方式，
//   只建 expressions/tags/notes/sentences/connections 五表）落一个 db 文件再 open()，
//   putSchedule/getSchedule 可用（schedules 表被 CREATE TABLE IF NOT EXISTS 补建）
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/storage/drive-contract.test.ts`，Expected: FAIL
- [ ] **Step 3: Implement**（每驱动 4 方法）
  - `drive.ts`：抽象类追加 4 个 abstract 方法声明 + import 类型
  - indexed：`idb.ts` 加 `version(3).stores({ schedules: "&expression, due" })`（无 upgrade）与 `schedules: Dexie.Table<any, string>` 字段；handler 实现 put/get/getAll/import（import 先 `this.db.schedules.clear()`）
  - sqlite：`initDatabase`（handle.ts:120-233 区域）追加 `CREATE TABLE IF NOT EXISTS schedules(expression TEXT PRIMARY KEY, algorithm TEXT NOT NULL, due INTEGER NOT NULL, interval REAL NOT NULL, ease REAL, stability REAL, difficulty REAL, state INTEGER, reps INTEGER, lapses INTEGER, last_review INTEGER)`；写入 `INSERT ... ON CONFLICT(expression) DO UPDATE`；字段 ↔ 对象序列化；`destroyAll`（457-461）加 `DROP TABLE IF EXISTS schedules`
  - csv：`SCHEDULE_HEADERS` 常量（表名 `schedules`，headers switch 142-158 加分支）；缺文件返回空；import = 全量内存合并后重写该文件
  - tedb：`TABLES`（handle.ts:82-90）加 `"schedules"`，行即 `ReviewScheduleRecord` JSON，镜像既有表读写
  - api：四方法空实现（读 `[]`/`undefined`，写 no-op）
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS
- [ ] **Step 5: Commit** — `git add src/storage tests/storage/drive-contract.test.ts` + `git commit -m "feat(storage): schedules 关联表契约与五驱动实现"`

### Task 5: transfer JSON v2（schedule 全保真导入导出）

**Files:**
- Modify: `src/storage/transfer.ts`
- Test: `tests/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `getAllSchedules`/`importSchedules`（Task 4）
- Produces: `ExportPayload.version: 2`；`data: (ExpressionInfo & { schedule?: WordSchedule })[]`

- [ ] **Step 1: Write the failing tests**（`transfer.test.ts` 追加）

```ts
// 导出：makeDrive → postExpression 一个词 + putSchedule → exportToFile("json")
//   → 解析 JSON：version === 2，data[0].schedule deep equal
// 导入 v2（indexed）：另一 makeDrive → importFromFile → 词条 + getSchedule round-trip 成立
// 导入 v2（csv）：同上，覆盖合并语义成立
// 旧格式回归：v1 fixture（无 schedule 字段）/ 裸数组 / 旧 Dexie dump 既有用例保持通过，
//   且导入后 getSchedule(word) === undefined（按新卡处理）——补一条显式断言
// CSV 导出不变：stringifyExportCsv 产物无 schedule 列（既有断言不动，补一条列头断言）
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/storage/transfer.test.ts`，Expected: FAIL（version 仍为 1 / schedule 丢失）
- [ ] **Step 3: Implement** — `exportToFile`：`drive.exportData()` 后 `drive.getAllSchedules()`，按 expression 合并进条目；`importFromFile`：词条走既有 `importData`，`schedule` 非空的条目拆成 `ReviewScheduleRecord[]` 走 `importSchedules`；`normalizeItem` 透传 schedule 字段
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS
- [ ] **Step 5: Commit** — `git add src/storage/transfer.ts tests/storage/transfer.test.ts` + `git commit -m "feat(transfer): JSON v2 携带复习调度数据，旧格式向后兼容"`

### Task 6: ReviewService（队列分桶 + 评分落库）

**Files:**
- Create: `src/review/review-service.ts`
- Test: `tests/review/review-service.test.ts`

**Interfaces:**
- Consumes: `getAllExpressionSimple`/`getSchedule`/`putSchedule`（Task 4）、`scheduleWord`（Task 3）
- Produces:

```ts
export interface ReviewQueueItem {
  expression: string; info: ExpressionInfoSimple; schedule?: WordSchedule;
}
export interface ReviewQueue {
  due: ReviewQueueItem[];       // schedule.due <= now，due 升序
  newItems: ReviewQueueItem[];  // 无 schedule，按 date 升序
  futureCount: number;          // due > now 的词数
}
export class ReviewService {
  constructor(private drive: StorageDrive, private getSettings: () => ReviewSettings) {}
  async buildQueue(now: number): Promise<ReviewQueue>
  // 评分：scheduleWord → putSchedule → 返回新调度与"当日到期"判定（回插队尾依据）
  async applyReview(expression: string, current: WordSchedule | undefined,
    response: ReviewResponse, now: number,
  ): Promise<{ schedule: WordSchedule; dueToday: boolean }>
}
// dueToday = newSchedule.due <= 当日结束（now 所在日的 23:59:59）
```

- [ ] **Step 1: Write the failing test**（`makeDrive("indexed")` + `postExpression` 播种；settings 返回 Task 3 的 FSRS_ON）

```ts
// 播种：w1(新卡) w2(due=now-1d) w3(due=now+10d) w4(新卡, date 早于 w1) 均 status 1；w5 status 0
// buildQueue：due=[w2]，newItems=[w4,w1]（date 升序），futureCount=1；w5 不出现
// 孤儿：putSchedule("ghost", sched) 且库中无该词 → buildQueue 不含 ghost
// applyReview("w4", undefined, "good", now) → getSchedule("w4") deep equal 返回值.schedule；
//   good → dueToday false；again → dueToday true（interval 0）
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/review/review-service.test.ts`，Expected: FAIL
- [ ] **Step 3: Implement** — `buildQueue`：`getAllExpressionSimple(true)` → filter `status > 0` → `getAllSchedules()` 建 Map join → 分桶排序；`applyReview`：`scheduleWord` → `putSchedule` → `dueToday` 按当日结束秒判断
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS
- [ ] **Step 5: Commit** — `git add src/review/review-service.ts tests/review/review-service.test.ts` + `git commit -m "feat(review): ReviewService 队列分桶与评分落库"`

### Task 7: SR 进度迁移解析器（migrate-from-sr）

**Files:**
- Create: `src/review/migrate-from-sr.ts`
- Test: `tests/review/migrate-from-sr.test.ts`

**Interfaces:**
- Consumes: `WordSchedule`（Task 1）、`putSchedule`（Task 4）
- Produces:

```ts
export interface SrMigrateResult { total: number; matched: number; skipped: number; withoutSchedule: number }
// 单条 <!--SR:...--> 内容（花括号内）→ 调度；多段取最后一段；无法解析 → null
export function parseSrComment(inner: string): WordSchedule | null
// 整个 md → 逐 #word 块的 { expression, schedule? } 列表（schedule 缺省 = 该块无 SR 注释）
export function parseSrWords(md: string): { expression: string; schedule?: WordSchedule }[]
export async function migrateFromSr(drive: StorageDrive, md: string): Promise<SrMigrateResult>
```

- [ ] **Step 1: Write the failing test**

```ts
// SM-2 单段：parseSrComment("2024-03-01,12,250") → { algorithm:"SM-2", due: Date.UTC(2024,2,1)/1000,
//   interval: 12, ease: 250 }
// SM-2 多段 "2024-03-01,4,270!2024-05-10,9,250" → 取末段 { due: 2024-05-10, interval: 9, ease: 250 }
// FSRS 段 "!fsrs,2024-05-01T00:00:00.000Z,13.2,5.1,5.5,2,7,1,0,2024-04-18T00:00:00.000Z" →
//   { algorithm:"FSRS", due: ISO 秒, interval: 13.2, stability: 5.1, difficulty: 5.5,
//     state: 2, reps: 7, lapses: 1, lastReview: 2024-04-18 ISO 秒 }（learningSteps 丢弃）
// FSRS lastReview 为 "-" → lastReview undefined
// 非法段 → null
// parseSrWords：两块结构（#word → ## 标题 → expression 行 → … → <!--SR:…-->）+
//   一块无 SR 注释 → schedule undefined；expression 取 ## 标题后的第一个非空行并 trim
// migrateFromSr（makeDrive 播种两词，其一在 md 中，其一不在）：
//   matched=1 skipped=1；重复执行第二次仍 matched=1（覆盖写，无累积）
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/review/migrate-from-sr.test.ts`，Expected: FAIL
- [ ] **Step 3: Implement** — 正则移植上游 `src/data/constants.ts`（SM2_SCHEDULE_INFO_EXTRACTOR / FSRS_SCHEDULE_EXTRACTOR 语义）；块解析按行扫描 `#word` 边界；`migrateFromSr` = parseSrWords → `drive.getExpression(expression)` 存在性判断（不存在的计 skipped）→ `putSchedule`
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS
- [ ] **Step 5: Commit** — `git add src/review/migrate-from-sr.ts tests/review/migrate-from-sr.test.ts` + `git commit -m "feat(review): 从 SR 复习文件解析并迁移进度"`

### Task 8: 删除旧复习业务核心

**Files:**
- Modify: `src/storage/drive.ts:29-30`（删 abstract getExpressionAfter + ReviewWord import）
- Modify: `src/storage/interface.ts:69-78,89`（删 ReviewWord 及导出）
- Modify: 5 驱动实现删 `getExpressionAfter`（indexed handler.ts:145-183、csv handle.ts:343-383、sqlite handle.ts:775 起、tedb handle.ts:346 起、api handler.ts:106 起）
- Modify: `src/plugin.ts`（refreshReviewDb 301-368、命令 150-155、refreshTextDB 238-244 的 review 分支、registerLeftClick 537-552 的 `.sr-modal-content` 监听）
- Modify: `tests/storage/drive-contract.test.ts:227-249`、`tests/storage/migration.test.ts:48`

**Interfaces:**
- Produces: 无（纯删除）；`refreshTextDB` 保留但只刷新 word 文本库

- [ ] **Step 1: 先改测试** — 删 drive-contract 的 getExpressionAfter 用例（227-249）；migration.test.ts:48 的回归断言改为「迁移后 `getAllExpressionSimple(true)` 与 `getCount()` 数据不变」
- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/storage`，Expected: FAIL（实现仍在，测试已变）不适用时直接 Step 3
- [ ] **Step 3: 删实现** — 按 Files 清单逐处删除；`plugin.ts` 的 `langr-refresh-review-database` 命令、`refreshReviewDb`、`registerLeftClick` 顺带删除，`refreshTextDB` 去掉 review 分支
- [ ] **Step 4: Verify** — `pnpm exec vitest run`（全绿）+ `pnpm build`（绿）+ `findstr /s /m getExpressionAfter src\*.ts` 无输出
- [ ] **Step 5: Commit** — `git add -A src tests` + `git commit -m "refactor(review): 删除导出式旧复习业务（refreshReviewDb/getExpressionAfter/ReviewWord）"`

### Task 9: 设置项增删改 + i18n + SR 迁移入口

**Files:**
- Modify: `src/settings.ts`（接口 40-46、默认值 134-146、UI 577-728）
- Create: `src/review/settings.ts`（`reviewSettingsFrom`）
- Modify: `src/lang/locale/en.ts` / `zh.ts` / `zh-TW.ts`
- Test: `tests/review/settings.test.ts`

**Interfaces:**
- Produces:

```ts
// src/review/settings.ts
export function reviewSettingsFrom(settings: MyPluginSettings): ReviewSettings
// 映射：review_algorithm→algorithm, review_fsrs_retention→fsrsRetention,
//   review_sm2_base_ease→sm2BaseEase, review_sm2_easy_bonus→sm2EasyBonus,
//   review_sm2_lapse_factor→sm2LapseFactor, review_maximum_interval→maximumInterval
```

- [ ] **Step 1: Write the failing test** — `reviewSettingsFrom` 七字段映射正确（构造 settings 字面量断言输出）
- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/review/settings.test.ts`，Expected: FAIL
- [ ] **Step 3: Implement settings.ts**
  - 接口+默认值新增：`review_algorithm: "FSRS" | "SM-2"`（默认 `"FSRS"`）、`review_fsrs_retention: 0.9`、`review_sm2_base_ease: 250`、`review_sm2_easy_bonus: 1.3`、`review_sm2_lapse_factor: 0.5`、`review_maximum_interval: 36525`、`review_show_interval: true`
  - `review_database` 注释/文案改为「SR 迁移源文件路径」（保留字段与 599-609 文本框）；**删除** `review_delimiter`（接口 46、默认 146、UI 723-728）
  - UI：新增「复习调度」Setting 分组（算法下拉 FSRS/SM-2、保留率 0.5–1 步进 0.01、三 SM-2 参数、最大间隔、间隔预览开关）+「从 SR 文件迁移复习进度」按钮：原生 `Modal`（input 默认 `settings.review_database`）确认后调 `migrateFromSr(plugin.DB(), md)`，Notice 报告 `{matched}/{skipped}/{withoutSchedule}`；文件读取失败 Notice 报错不写库
- [ ] **Step 4: i18n** — 三语言同步：新增 `Review` / `Start Review` / `Show Answer` / `Again` / `Hard` / `Good` / `Easy` / `Review Complete` / `Reviewed {n} cards` / `No cards due` / `Skipped {n} cards (scheduling error)` / `Migrate SR Progress` / `SR migration source file` / `Migrated: {matched} matched, {skipped} skipped, {noSr} without SR record` / `SR file not found: {path}`；删除死键（en.ts:135-136 "Last review sync" 及 zh/zh-TW 对应、review_delimiter 相关键）
- [ ] **Step 5: Verify** — `pnpm exec vitest run tests/review/settings.test.ts` PASS + `pnpm build` 绿
- [ ] **Step 6: Commit** — `git add src/settings.ts src/review/settings.ts src/lang tests/review/settings.test.ts` + `git commit -m "feat(review): 复习设置项、i18n 文案与 SR 迁移设置入口"`

### Task 10: ReviewView + ReviewPanel + 命令/ribbon + 组件测试

**Files:**
- Create: `src/views/ReviewView.ts`
- Create: `src/views/ReviewPanel.vue`
- Create: `src/review/format.ts`
- Modify: `src/plugin.ts`（registerView 180-210 区域 + addCommands 142-180 区域 + ribbon）
- Test: `tests/review/format.test.ts`、`tests/ui/review-view.test.ts`

**Interfaces:**
- Consumes: `ReviewService`（Task 6）、`reviewSettingsFrom`（Task 9）、`speakWord`（`src/utils/pronounce.ts:55`，accent 用法同 plugin.ts:471）、`getThemeOverrides(plugin.store.dark)`（同 DataPanel.vue:219-232 模式）
- Produces:

```ts
// src/views/ReviewView.ts
export const REVIEW_VIEW_TYPE = "langr-review";
export const REVIEW_ICON = "layers";
export class ReviewView extends ItemView { /* 照 StatView.ts 模式挂载 ReviewPanel */ }
// src/review/format.ts
export function formatInterval(days: number): string
// days < 1 → `${Math.max(1, Math.round(days*24))}h`；< 30 → `${Math.round(days)}d`；
// < 365 → `${(days/30).toFixed(1)}mo`；否则 `${(days/365).toFixed(1)}y`
```

命令：`langr-review-open`（name `t("Start Review")`，callback `activateView(REVIEW_VIEW_TYPE, "tab")`，沿用 plugin.ts:597-617）；ribbon 图标 `REVIEW_ICON` 同 callback。

- [ ] **Step 1: Write the failing tests**
  - `tests/review/format.test.ts`：`formatInterval(0.5)==="12h"`、`(3)==="3d"`、`(45)==="1.5mo"`、`(400)==="1.1y"`
  - `tests/ui/review-view.test.ts`（沿 tests/ui/word-detail-and-form.test.ts 惯例：plugin 经 globalProperties 注入、`stubs: { teleport: true }`、`vi.mock("@/utils/pronounce")`、vi.mock 掉 useMessage；drive 用 `makeDrive("indexed")` 播种 2 词——1 新卡 1 到期）：

```ts
// 挂载 ReviewPanel → 显示到期卡正面（词文本可见）+ 进度 1/2
// 点击"显示答案"→ 背面出现释义；四按钮各带 formatInterval 预览文本（review_show_interval=true）
// 点击 Good → pronounce mock 未被意外触发、putSchedule 生效（getSchedule 断言）→ 队列推进到下一张
// 复习完所有卡 → 完成页出现 t("Review Complete") 与 "Reviewed 2 cards"
// service 抛错路径：vi.mock ReviewService.applyReview reject 一次 → 该词跳过、会话推进、
//   完成页出现 "Skipped 1 cards (scheduling error)"
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/review/format.test.ts tests/ui/review-view.test.ts`，Expected: FAIL
- [ ] **Step 3: Implement**
  - `ReviewPanel.vue`：状态机 `loading → front → back → done`；正面 = 单词大字 + 发音按钮（`speakWord(text, { accent: plugin.settings.review_prons, ... })`，照 plugin.ts:471 的 PronOptions 构造）+ `t("Show Answer")`；背面 = 释义/标签/笔记/例句（例句中单词大小写不敏感 `<mark>` 高亮，样式放非 scoped 块命名空间限定）；评分行 = 四个 NButton（Again/Hard/Good/Easy + `formatInterval(preview.interval)`，`review_show_interval=false` 时隐藏文本）；进度条 = 已复习/总数；done 页 = 完成文案 + skipped 计数；`applyReview` reject → 计 skipped 继续；FSRS/Again 当日到期（`dueToday`）回插队尾；空队列直接进 done；NConfigProvider 合并 `getThemeOverrides(plugin.store.dark)`
  - 键盘：`onMounted` 加 window keydown（Space=显示答案、1-4=评分），`onUnmounted` 移除
  - `ReviewView.ts` 照 StatView.ts 全套（VIEW_TYPE/ICON/getDisplayText `t("Review")`）
  - `plugin.ts`：registerView + 命令 + ribbon
- [ ] **Step 4: Run to verify pass** — 同 Step 2，Expected: PASS；再 `pnpm test`（全量绿）
- [ ] **Step 5: Commit** — `git add src/views/ReviewView.ts src/views/ReviewPanel.vue src/review/format.ts src/plugin.ts tests/review/format.test.ts tests/ui/review-view.test.ts` + `git commit -m "feat(review): ReviewView 复习界面与命令/ribbon 入口"`

### Task 11: playground 挂载 + 全量验收

**Files:**
- Modify: `playground/fake-plugin.ts`（fake drive 补 schedules 四方法 + settings 补 review 七键）
- Modify: `playground/`（挂载 ReviewPanel，镜像 DataPanel 挂载方式）

- [ ] **Step 1: playground 挂载** — fake-plugin 内存种子含新卡/到期/未来三档；ReviewPanel 与既有面板并列可切换
- [ ] **Step 2: 浏览器验证** — `npx vite --config playground/vite.config.ts` → `http://localhost:5199/playground/index.html`：明暗主题各过一遍复习流程（正面→答案→四键→完成页），`#pg-errors` 为空
- [ ] **Step 3: 全量验收** — `pnpm test`（全绿）+ `pnpm build`（绿）+ `pnpm run lint` 不新增告警
- [ ] **Step 4: Commit** — `git add playground` + `git commit -m "test(playground): ReviewPanel 调试挂载"`

---

## Self-Review 记录

- Spec 覆盖：§3 模块结构→Task 1/2/3/6/7；§4/§5 存储→Task 4；§6 算法→Task 1/2/3；§7 流程与 UI→Task 6/10；§8 导入导出→Task 5；§9 迁移→Task 7/9；§10 设置→Task 9；§11 删除→Task 8（locale 死键在 Task 9）；§12 依赖→Task 2/11；§13 测试→各任务；§14 错误处理→Task 10（跳过计数）/Task 7（null 段）/Task 4（csv 损坏行跳过沿用既有容错，测试在 round-trip 内）。
- 类型一致性：`WordSchedule`/`ReviewSettings`/四契约方法名在 Task 1/3/4/5/6/9/10 间已对照一致。
- 已知偏差修正：Task 1 `sm2Next` 的 current 参数需含 `due`（delay 计算），签名已放宽为 `Pick<WordSchedule,"interval"|"ease"|"due">`。
- 无 TBD；每步单动作。
