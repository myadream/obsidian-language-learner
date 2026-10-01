import { describe, it, expect, beforeEach, afterEach } from "vitest";
import initSqlJs from "sql.js";
import { makeDrive, DriveFixture, MANIFEST_ID } from "../setup/drive-factory";
import { MemVaultAdapter } from "../setup/mem-adapter";
import { ExpressionInfo, WordType } from "@/storage/interface";
import { ReviewScheduleRecord, WordSchedule } from "@/review/types";
import moment from "moment";

function makeExpression(over: Partial<ExpressionInfo> = {}): ExpressionInfo {
    return {
        expression: "test",
        meaning: "测试",
        status: 1,
        t: WordType.WORD,
        tags: [],
        notes: [],
        sentences: [],
        connections: [],
        date: moment().unix(),
        ...over,
    };
}

function makeSchedule(over: Partial<WordSchedule> = {}): WordSchedule {
    return { algorithm: "SM-2", due: 1700000000, interval: 10, ease: 250, ...over };
}

const DRIVES = ["indexed", "sqlite", "csv", "tedb"] as const;

describe.each(DRIVES)("%s drive contract", (type) => {
    let fixture: DriveFixture;

    beforeEach(async () => {
        fixture = await makeDrive(type);
    });

    afterEach(() => {
        fixture.drive.close();
        fixture.adapter.dispose();
    });

    it("posts and reads back an expression", async () => {
        const db = fixture.drive;
        await db.postExpression(
            makeExpression({ expression: "apple", meaning: "苹果", status: 2 })
        );

        const got = await db.getExpression("apple");
        expect(got).not.toBeNull();
        expect(got!.expression).toBe("apple");
        expect(got!.meaning).toBe("苹果");
        expect(got!.status).toBe(2);
        expect(got!.t).toBe(WordType.WORD);
    });

    it("getExpression is case-insensitive", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple" }));
        const got = await db.getExpression("APPLE");
        expect(got).not.toBeNull();
        expect(got!.expression).toBe("apple");
    });

    it("getExpression returns null for unknown word", async () => {
        const got = await fixture.drive.getExpression("nonexistent");
        expect(got).toBeNull();
    });

    it("updates an existing expression instead of duplicating", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple", status: 1 }));
        await db.postExpression(makeExpression({ expression: "apple", status: 3 }));

        const got = await db.getExpression("apple");
        expect(got!.status).toBe(3);

        const all = await db.getAllExpressionSimple(true);
        expect(all.total).toBe(1);
    });

    it("adds, updates and orphans-cleans sentences", async () => {
        const db = fixture.drive;
        const sen = {
            expression: "apple",
            sentence: "I ate an apple.",
            trans: "我吃了一个苹果。",
            origin: "",
        };
        await db.postExpression(makeExpression({ expression: "apple", sentences: [sen] }));

        let got = await db.getExpression("apple");
        expect(got!.sentences).toHaveLength(1);
        expect(got!.sentences[0].sentence).toBe(sen.sentence);
        expect(got!.sentences[0].trans).toBe(sen.trans);

        // 同句更新翻译
        await db.postExpression(
            makeExpression({
                expression: "apple",
                sentences: [{ ...sen, trans: "我吃了一个苹果!" }],
            })
        );
        got = await db.getExpression("apple");
        expect(got!.sentences).toHaveLength(1);
        expect(got!.sentences[0].trans).toBe("我吃了一个苹果!");

        // 句子被移除后应清理
        await db.postExpression(makeExpression({ expression: "apple", sentences: [] }));
        got = await db.getExpression("apple");
        expect(got!.sentences).toHaveLength(0);
    });

    it("tryGetSen finds a stored sentence", async () => {
        const db = fixture.drive;
        const sen = {
            expression: "apple",
            sentence: "I ate an apple.",
            trans: "",
            origin: "",
        };
        await db.postExpression(makeExpression({ expression: "apple", sentences: [sen] }));

        const got = await db.tryGetSen("I ate an apple.");
        expect(got).not.toBeNull();
        expect(got!.expression).toBe("apple");
    });

    it("tags and notes are idempotent", async () => {
        const db = fixture.drive;
        await db.postExpression(
            makeExpression({ expression: "apple", tags: ["fruit", "food"], notes: ["note1"] })
        );
        await db.postExpression(
            makeExpression({ expression: "apple", tags: ["fruit", "food"], notes: ["note1"] })
        );

        const got = await db.getExpression("apple");
        expect(got!.tags).toHaveLength(2);
        expect(got!.notes).toHaveLength(1);
    });

    it("postIgnoreWords: new word gets status 0", async () => {
        const db = fixture.drive;
        await db.postIgnoreWords(["the", "of"]);
        const got = await db.getExpression("the");
        expect(got).not.toBeNull();
        expect(got!.status).toBe(0);
    });

    it("postIgnoreWords: existing word keeps meaning and notes", async () => {
        const db = fixture.drive;
        await db.postExpression(
            makeExpression({ expression: "apple", meaning: "苹果", status: 3, notes: ["keep me"] })
        );

        await db.postIgnoreWords(["apple"]);
        const got = await db.getExpression("apple");
        expect(got!.status).toBe(0);
        expect(got!.meaning).toBe("苹果");
        expect(got!.notes).toEqual(["keep me"]);
    });

    it("removeExpression removes and cascades, returns true", async () => {
        const db = fixture.drive;
        await db.postExpression(
            makeExpression({
                expression: "apple",
                tags: ["fruit"],
                notes: ["n1"],
                sentences: [
                    { expression: "apple", sentence: "an apple", trans: "", origin: "" },
                ],
            })
        );

        const ok = await db.removeExpression("apple");
        expect(ok).toBe(true);
        expect(await db.getExpression("apple")).toBeNull();
        expect(await db.tryGetSen("an apple")).toBeNull();

        const ok2 = await db.removeExpression("nonexistent");
        expect(ok2).toBe(false);
    });

    it("getStoredWords finds words and phrases in an article", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple", status: 2 }));
        await db.postExpression(
            makeExpression({ expression: "look up", t: WordType.PHRASE, status: 1 })
        );

        const res = await db.getStoredWords({
            article: "I apple look up today.",
            words: ["apple", "today"],
        });

        expect(res.words.map((w) => w.text)).toContain("apple");
        expect(res.phrases.map((p) => p.text)).toContain("look up");
    });

    it("getStoredWords tolerates empty word list", async () => {
        const res = await fixture.drive.getStoredWords({
            article: "nothing known here",
            words: [],
        });
        expect(res.words).toHaveLength(0);
    });

    it("getCount counts by type and status", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "a", status: 1 }));
        await db.postExpression(makeExpression({ expression: "b", status: 2 }));
        await db.postExpression(
            makeExpression({ expression: "c d", t: WordType.PHRASE, status: 1 })
        );

        const counts = await db.getCount();
        expect(counts.word_count[1]).toBe(1);
        expect(counts.word_count[2]).toBe(1);
        expect(counts.phrase_count[1]).toBe(1);
    });

    it("countSeven includes today's words in today and accumulated", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "fresh", status: 1 }));

        const seven = await db.countSeven();
        expect(seven).toHaveLength(7);
        const today = seven[6]; // 最后一天是今天
        expect(today.today[1]).toBeGreaterThanOrEqual(1);
        expect(today.accumulated[1]).toBeGreaterThanOrEqual(1);
    });

    it("getAllExpressionSimple paginates, sorts and filters", async () => {
        const db = fixture.drive;
        // 按时间顺序插入：banana < cherry < apple
        await db.postExpression(makeExpression({ expression: "banana", meaning: "香蕉", status: 1, date: 1000 }));
        await db.postExpression(makeExpression({ expression: "cherry", meaning: "樱桃", status: 2, date: 2000 }));
        await db.postExpression(makeExpression({ expression: "apple", meaning: "苹果", status: 1, date: 3000 }));

        // 分页
        const page0 = await db.getAllExpressionSimple(true, undefined, undefined, { page: 0, pageSize: 2 });
        expect(page0.total).toBe(3);
        expect(page0.data).toHaveLength(2);

        const page1 = await db.getAllExpressionSimple(true, undefined, undefined, { page: 1, pageSize: 2 });
        expect(page1.data).toHaveLength(1);

        // 按 expression 排序
        const sorted = await db.getAllExpressionSimple(
            true,
            { expression: "asc" },
            undefined,
            { page: 0, pageSize: 10 }
        );
        expect(sorted.data.map((d: any) => d.expression)).toEqual(["apple", "banana", "cherry"]);

        // 搜索
        const searched = await db.getAllExpressionSimple(
            true,
            undefined,
            { expression: "an" },
            { page: 0, pageSize: 10 }
        );
        expect(searched.data.map((d: any) => d.expression)).toEqual(["banana"]);

        // status 过滤
        const byStatus = await db.getAllExpressionSimple(
            true,
            undefined,
            { status: 2 },
            { page: 0, pageSize: 10 }
        );
        expect(byStatus.data.map((d: any) => d.expression)).toEqual(["cherry"]);
    });

    it("getAllExpressionSimple tag filter", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple", tags: ["fruit"] }));
        await db.postExpression(makeExpression({ expression: "run", tags: ["verb"] }));

        const res = await db.getAllExpressionSimple(
            true,
            undefined,
            { tags: ["fruit"] },
            { page: 0, pageSize: 10 }
        );
        expect(res.data.map((d: any) => d.expression)).toEqual(["apple"]);
    });

    it("ignores=false excludes status-0 words", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "keep", status: 1 }));
        await db.postIgnoreWords(["skip"]);

        const res = await db.getAllExpressionSimple(false, undefined, undefined, { page: 0, pageSize: 10 });
        const exprs = res.data.map((d: any) => d.expression);
        expect(exprs).toContain("keep");
        expect(exprs).not.toContain("skip");

        const all = await db.getAllExpressionSimple(true, undefined, undefined, { page: 0, pageSize: 10 });
        expect(all.total).toBe(2);
    });

    it("getExpressionsSimple returns batch info", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple", status: 2, tags: ["fruit"] }));
        const res = await db.getExpressionsSimple(["apple", "nope"]);
        expect(res).toHaveLength(1);
        expect(res[0].expression).toBe("apple");
        expect(res[0].tags).toEqual(["fruit"]);
    });

    it("getTags returns distinct tags", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "a", tags: ["x", "y"] }));
        await db.postExpression(makeExpression({ expression: "b", tags: ["x"] }));

        const tags = await db.getTags();
        expect(tags.sort()).toEqual(["x", "y"]);
    });

    it("destroyAll wipes data", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple" }));
        await db.destroyAll();
        const res = await db.getAllExpressionSimple(true, undefined, undefined, { page: 0, pageSize: 10 });
        expect(res.total).toBe(0);
    });

    // ---- 复习调度（schedules 关联表） ----

    it("schedules: put → get → upsert → getAll round-trip", async () => {
        const db = fixture.drive;
        expect(await db.getSchedule("alpha")).toBeUndefined();

        await db.putSchedule("alpha", makeSchedule());
        expect(await db.getSchedule("alpha")).toEqual(makeSchedule());

        await db.putSchedule("alpha", makeSchedule({ interval: 20 }));
        expect(await db.getSchedule("alpha")).toEqual(makeSchedule({ interval: 20 }));

        await db.putSchedule("beta", makeSchedule({ interval: 5, ease: undefined }));
        const all: ReviewScheduleRecord[] = await db.getAllSchedules();
        expect(all).toHaveLength(2);
    });

    it("schedules: importSchedules follows driver semantics (indexed rebuild / others merge)", async () => {
        const db = fixture.drive;
        await db.putSchedule("a", makeSchedule({ interval: 1 }));
        await db.putSchedule("c", makeSchedule({ interval: 3 }));

        await db.importSchedules([
            { expression: "a", schedule: makeSchedule({ interval: 2 }) },
            { expression: "b", schedule: makeSchedule({ interval: 4, ease: undefined }) },
        ]);

        expect(await db.getSchedule("a")).toEqual(makeSchedule({ interval: 2 }));
        expect(await db.getSchedule("b")).toEqual(makeSchedule({ interval: 4, ease: undefined }));
        if (type === "indexed") {
            // 清空重建：预置的 c 被删掉
            expect(await db.getSchedule("c")).toBeUndefined();
        } else {
            // 覆盖合并：预置的 c 保留
            expect(await db.getSchedule("c")).toEqual(makeSchedule({ interval: 3 }));
        }
    });

    it("schedules: removeExpression does not cascade to schedules", async () => {
        const db = fixture.drive;
        await db.postExpression(makeExpression({ expression: "apple" }));
        await db.putSchedule("apple", makeSchedule());

        await db.removeExpression("apple");
        expect(await db.getSchedule("apple")).toEqual(makeSchedule());
    });

    it("csv: missing schedules.csv is an empty table; put creates the file", async () => {
        if (type !== "csv") return;
        const db = fixture.drive;
        expect(await db.getAllSchedules()).toEqual([]);

        await db.putSchedule("alpha", makeSchedule());
        await db.close();

        const text = await fixture.adapter.read(`storage/${fixture.storageName}/schedules.csv`);
        const header = text.split(/\r?\n/)[0].trim();
        expect(header).toBe("Expression,Schedule");
    });
});

describe("sqlite legacy db gains schedules table on open", () => {
    it("creates schedules table via CREATE TABLE IF NOT EXISTS on a legacy db", async () => {
        const adapter = new MemVaultAdapter();
        adapter.provideSqlWasm(MANIFEST_ID);
        const storageName = `legacy_sched_${Date.now()}`;

        // 手工构造没有 schedules 表的旧库
        const SQL = await initSqlJs({
            wasmBinary: adapter.files.get(
                `.obsidian/plugins/${MANIFEST_ID}/sql-wasm.wasm`
            ) as unknown as ArrayBuffer,
        });
        const old = new SQL.Database();
        old.run(`
            CREATE TABLE expressions (
                 _id INTEGER PRIMARY KEY AUTOINCREMENT,
                 expression text not null,
                 meaning text default '',
                 status INTEGER default 0,
                 t text default '',
                 date DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const bytes = old.export();
        old.close();
        await adapter.writeBinary(
            `storage/${storageName}.sqlite`,
            bytes as unknown as ArrayBuffer
        );

        const { drive } = await makeDrive("sqlite", { adapter, storageName });
        await drive.putSchedule("alpha", makeSchedule());
        expect(await drive.getSchedule("alpha")).toEqual(makeSchedule());
        drive.close();
    });
});
