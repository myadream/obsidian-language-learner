/**
 * 10 万级数据量 CRUD 性能基准（默认跳过，设 RUN_PERF=1 运行）：
 *
 *   RUN_PERF=1 pnpm vitest run tests/perf
 *   RUN_PERF=1 PERF_N=100000 PERF_DRIVES=tedb pnpm vitest run tests/perf
 *
 * 数据集（默认共约 10 万条记录）：
 *   - 4 万个单词（expressions, t=WORD）
 *   - 每个单词随机 0~2 条短句（sentences）与 0~2 条笔记（notes），
 *     期望值各约 3 万条 → 记录总量 ≈ 10 万
 *
 * 阶段：
 *   add    — 逐条 postExpression（含短句/笔记），对齐真实学习时的单条保存
 *   update — 逐条修改 meaning/status（单词）、trans（短句）、note（笔记）
 *   delete — 逐条 removeExpression（级联删除短句/笔记）
 *
 * 报表：reports/perf-report-<时间戳>.md + 同名 .json（原始数据）
 *
 * 注意：indexed/csv/sqlite 在测试里走内存（fake-indexeddb / 内存 adapter /
 * sql.js 内存库），数字代表驱动自身算法开销；tedb 走真实磁盘（临时目录），
 * 含全部 fsync/原子写语义，是最接近真实桌面使用的数据。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { makeDrive, DriveFixture } from "../setup/drive-factory";
import { ExpressionInfo, WordType } from "@/storage/interface";

const RUN = process.env.RUN_PERF === "1";
const N_WORDS = Math.max(100, parseInt(process.env.PERF_N || "100000", 10) * 0.4);
const DRIVE_TYPES = (process.env.PERF_DRIVES || "indexed,sqlite,csv,tedb").split(
    ","
) as Array<"indexed" | "sqlite" | "csv" | "tedb">;

// ---- 确定性伪随机（可复现） ----
function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(20260930);

// 简单词表拼出的假单词/例句
const SYLLABLES = ["ab", "ex", "pre", "trans", "sub", "com", "dis", "pro", "re", "un"];
const TAILS = ["able", "tion", "ment", "ness", "ing", "ed", "ly", "er", "ate", "ize"];

function makeWord(i: number): string {
    const s = SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
    const t = TAILS[Math.floor(rand() * TAILS.length)];
    return `${s}${t}${i.toString(36)}`;
}

interface Row {
    word: string;
    meaning: string;
    sentences: Array<{ sentence: string; trans: string; origin: string }>;
    notes: string[];
}

function buildDataset(): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < N_WORDS; i++) {
        const word = makeWord(i);
        const senCount = Math.floor(rand() * 3); // 0~2
        const noteCount = Math.floor(rand() * 3); // 0~2
        rows.push({
            word,
            meaning: `释义${i}测试`,
            sentences: Array.from({ length: senCount }, (_, k) => ({
                sentence: `The ${word} example sentence number ${k} here.`,
                trans: `关于 ${word} 的例句 ${k}。`,
                origin: "perf",
            })),
            notes: Array.from({ length: noteCount }, (_, k) => `note ${k} for ${word}`),
        });
    }
    return rows;
}

interface PhaseStat {
    ops: number;
    totalMs: number;
    records: number;
}

function stat(ops: number, totalMs: number, records: number): PhaseStat {
    return { ops, totalMs, records };
}

function fmt(n: number): string {
    if (n >= 100) return n.toFixed(0);
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
}

function ms(v: number): string {
    if (v >= 1000) return `${fmt(v / 1000)} s`;
    return `${fmt(v)} ms`;
}

describe.skipIf(!RUN)("large-scale CRUD performance", () => {
    const report: Array<{
        drive: string;
        add: PhaseStat;
        update: PhaseStat;
        remove: PhaseStat;
        reopen: number;
    }> = [];

    it(
        "runs add/update/delete benchmark per drive and writes a report",
        async () => {
            fs.mkdirSync("reports", { recursive: true });
            const dataset = buildDataset();
            const totalRecords = dataset.reduce(
                (sum, r) => sum + 1 + r.sentences.length + r.notes.length,
                0
            );
            console.log(
                `dataset: ${dataset.length} words, ${totalRecords} records total`
            );

            for (const type of DRIVE_TYPES) {
                const fixture = await makeDrive(type, { durability: "relaxed" });
                try {
                    const result = await benchmarkDrive(fixture, dataset);
                    report.push({ drive: type, ...result });
                    console.log(
                        `[${type}] add ${ms(result.add.totalMs)}, update ${ms(
                            result.update.totalMs
                        )}, remove ${ms(result.remove.totalMs)}, reopen ${ms(result.reopen)}`
                    );
                } finally {
                    fixture.drive.close();
                    fixture.adapter.dispose();
                }
            }

            writeReport(report, dataset.length, totalRecords);
            expect(report).toHaveLength(DRIVE_TYPES.length);
        },
        4 * 3600 * 1000
    );
});

async function benchmarkDrive(fixture: DriveFixture, dataset: Row[]) {
    const db = fixture.drive;

    // ---- add ----
    let t0 = performance.now();
    let addRecords = 0;
    for (const row of dataset) {
        await db.postExpression({
            expression: row.word,
            meaning: row.meaning,
            status: 1 + Math.floor(rand() * 3),
            t: WordType.WORD,
            tags: [],
            notes: row.notes,
            connections: [],
            sentences: row.sentences,
        } as ExpressionInfo);
        addRecords += 1 + row.sentences.length + row.notes.length;
    }
    // CSV/SQLite 有 1.5s 防抖落盘，收尾强制刷盘计入 add 阶段
    await db.close();
    await db.open();
    const addMs = performance.now() - t0;

    // ---- update ----
    t0 = performance.now();
    let updateRecords = 0;
    for (const row of dataset) {
        const got = await db.getExpression(row.word);
        if (!got) throw new Error(`word missing after add: ${row.word}`);
        got.meaning = `${got.meaning}!`;
        got.status = (got.status % 4) + 1;
        got.sentences = got.sentences.map((s) => ({ ...s, trans: `${s.trans}~` }));
        got.notes = got.notes.map((n) => `${n}*`);
        await db.postExpression(got as ExpressionInfo);
        updateRecords += 1 + got.sentences.length + got.notes.length;
    }
    await db.close();
    await db.open();
    const updateMs = performance.now() - t0;

    // ---- reopen（冷加载全量数据） ----
    const t1 = performance.now();
    await db.close();
    await db.open();
    const reopenMs = performance.now() - t1;

    // ---- remove ----
    t0 = performance.now();
    let removeRecords = 0;
    for (const row of dataset) {
        await db.removeExpression(row.word);
        removeRecords += 1 + row.sentences.length + row.notes.length;
    }
    await db.close();
    await db.open();
    const removeMs = performance.now() - t0;

    const all = await db.getAllExpressionSimple(true, undefined, undefined, {
        page: 0,
        pageSize: 1,
    });
    if (all.total !== 0) {
        throw new Error(`delete incomplete: ${all.total} rows remain`);
    }

    return {
        add: stat(dataset.length, addMs, addRecords),
        update: stat(dataset.length, updateMs, updateRecords),
        remove: stat(dataset.length, removeMs, removeRecords),
        reopen: reopenMs,
    };
}

function writeReport(
    report: Array<{
        drive: string;
        add: PhaseStat;
        update: PhaseStat;
        remove: PhaseStat;
        reopen: number;
    }>,
    words: number,
    records: number
) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    // 并行分片运行时用 PERF_LABEL 区分报表文件
    const label = process.env.PERF_LABEL ? `-${process.env.PERF_LABEL}` : "";
    const mdPath = path.join("reports", `perf-report-${stamp}${label}.md`);
    const jsonPath = path.join("reports", `perf-report-${stamp}${label}.json`);

    const lines: string[] = [];
    lines.push("# 存储驱动 CRUD 性能报表");
    lines.push("");
    lines.push(`- 时间：${new Date().toLocaleString()}`);
    lines.push(`- 数据集：${words.toLocaleString()} 个单词（记录总量 ${records.toLocaleString()}：单词 + 短句 + 笔记）`);
    lines.push(`- 环境：${os.type()} ${os.release()} / Node ${process.version}`);
    lines.push("- 口径：逐条调用驱动 API（postExpression / getExpression / removeExpression），");
    lines.push("  每阶段结束后强制落盘并重开驱动。add/update 阶段的落盘与重开时间计入该阶段；");
    lines.push("  reopen 单独报告冷加载全量数据耗时。");
    lines.push("- 说明：indexed/csv/sqlite 在测试中为内存实现（fake-indexeddb / 内存 adapter / sql.js），");
    lines.push("  数字反映驱动算法开销；tedb 为真实磁盘写入（临时目录，原子写 + 备份语义）。");
    lines.push("");
    lines.push("| 驱动 | 添加(条/秒) | 添加总耗时 | 修改(条/秒) | 修改总耗时 | 删除(条/秒) | 删除总耗时 | 重开冷加载 |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const r of report) {
        const rate = (s: PhaseStat) =>
            `${fmt((s.records / s.totalMs) * 1000)} (${fmt(s.totalMs / s.ops)}ms/条)`;
        lines.push(
            `| ${r.drive} | ${rate(r.add)} | ${ms(r.add.totalMs)} | ${rate(
                r.update
            )} | ${ms(r.update.totalMs)} | ${rate(r.remove)} | ${ms(
                r.remove.totalMs
            )} | ${ms(r.reopen)} |`
        );
    }
    lines.push("");
    lines.push("> 条/秒按记录数（单词+短句+笔记）计；ms/条按单词操作次数计。");

    fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`report written: ${mdPath}`);
}
