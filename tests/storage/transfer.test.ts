/**
 * 外层统一导入/导出（storage/transfer.ts）：
 * - 文件格式（JSON/CSV/SQLite3）解析为统一数据，驱动只面对 exportData/importData；
 * - 覆盖统一格式、历史遗留格式（裸数组/{data}/Dexie dump/无表头 CSV）与跨驱动互导。
 */
import { describe, it, expect } from "vitest";
import {
    parseJsonItems,
    parseCsvItems,
    parseSqliteItems,
    stringifyExportJson,
    stringifyExportCsv,
} from "@/storage/transfer";
import { loadSqlJs } from "@/storage/drive/sqlite3/uitils";
import { makeDrive, DriveFixture, MANIFEST_ID } from "../setup/drive-factory";
import { MemVaultAdapter } from "../setup/mem-adapter";
import moment from "moment";
import { ExpressionInfo, WordType } from "@/storage/interface";

function makeItem(over: Partial<ExpressionInfo> = {}): ExpressionInfo {
    return {
        expression: "apple",
        meaning: "苹果",
        status: 2,
        t: WordType.WORD,
        tags: ["fruit"],
        notes: ["keep"],
        sentences: [
            { expression: "apple", sentence: "an apple", trans: "一个苹果", origin: "test", date: 1700000000 },
        ],
        connections: ["pear"],
        date: 1700000000,
        ...over,
    };
}

describe("parseJsonItems", () => {
    it("parses the unified {version, data} payload", () => {
        const items = [makeItem()];
        const parsed = parseJsonItems(stringifyExportJson(items));
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toEqual(items[0]);
    });

    it("accepts bare array and {data: [...]} legacy shapes", () => {
        const raw = makeItem();
        expect(parseJsonItems(JSON.stringify([raw]))).toEqual([raw]);
        expect(parseJsonItems(JSON.stringify({ data: [raw] }))).toEqual([raw]);
    });

    it("normalizes string dates and legacy capitalized fields", () => {
        const parsed = parseJsonItems(JSON.stringify([
            { Expression: " Apple ", Meaning: "苹果", Status: "3", Type: "word", date: "2023-11-14 22:13:20" },
        ]));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].expression).toBe("Apple");
        expect(parsed[0].status).toBe(3);
        expect(parsed[0].t).toBe("WORD");
        // 文本日期按本地时区解析（与历史导出格式一致），往返后 unix 值稳定
        expect(parsed[0].date).toBe(moment("2023-11-14 22:13:20").unix());
    });

    it("joins sentences of a legacy Dexie dump", () => {
        const dexie = {
            formatName: "dexie",
            formatVersion: 1,
            data: {
                databaseName: "WordDB",
                tables: [
                    {
                        name: "expressions",
                        rows: [
                            {
                                _id: 1,
                                expression: "apple",
                                meaning: "苹果",
                                status: 2,
                                t: "WORD",
                                tags: ["fruit"],
                                notes: ["n1"],
                                sentences: [10, 11],
                                connections: [] as string[],
                                date: 1700000000,
                            },
                        ],
                    },
                    {
                        name: "sentences",
                        rows: [
                            { _id: 10, expression: "apple", sentence: "an apple", trans: "T1", origin: "", date: 1700000000 },
                            { _id: 11, expression: "apple", sentence: "apple pie", trans: "T2", origin: "", date: 1700000000 },
                        ],
                    },
                ],
            },
        };
        const parsed = parseJsonItems(JSON.stringify(dexie));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].sentences.map((s) => s.sentence)).toEqual(["an apple", "apple pie"]);
        expect(parsed[0].sentences[0].trans).toBe("T1");
        expect(parsed[0].tags).toEqual(["fruit"]);
        expect(parsed[0].notes).toEqual(["n1"]);
    });

    it("throws on structurally invalid JSON data", () => {
        expect(() => parseJsonItems(JSON.stringify({ foo: 1 }))).toThrow();
        expect(() => parseJsonItems("not json")).toThrow();
    });

    it("skips items without expression", () => {
        const parsed = parseJsonItems(JSON.stringify([
            { meaning: "no expression" },
            makeItem(),
        ] as any[]));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].expression).toBe("apple");
    });
});

describe("parseCsvItems", () => {
    it("parses header CSV with quoted fields", () => {
        const csv = [
            "Expression,Meaning,Status,Type,Tags,Date",
            '"apple","含,逗号",2,WORD,"fruit,food",1700000000',
        ].join("\n");
        const parsed = parseCsvItems(csv);
        expect(parsed).toEqual([
            expect.objectContaining({
                expression: "apple",
                meaning: "含,逗号",
                status: 2,
                t: "WORD",
                tags: ["fruit", "food"],
                date: 1700000000,
            }),
        ]);
    });

    it("parses text dates and tolerates a BOM", () => {
        const parsed = parseCsvItems(
            "\uFEFFExpression,Meaning,Status,Type,Tags,Date\napple,,0,WORD,,2023-11-14 22:13:20"
        );
        expect(parsed[0].date).toBe(moment("2023-11-14 22:13:20").unix());
    });

    it("parses legacy headerless CSV by column order", () => {
        const parsed = parseCsvItems("apple,苹果,1,WORD,fruit,1700000000");
        expect(parsed[0].expression).toBe("apple");
        expect(parsed[0].meaning).toBe("苹果");
        expect(parsed[0].status).toBe(1);
        expect(parsed[0].tags).toEqual(["fruit"]);
    });

    it("defaults status/type/date for sparse rows", () => {
        const parsed = parseCsvItems("Expression,Meaning,Status,Type,Tags,Date\napple");
        expect(parsed[0].status).toBe(0);
        expect(parsed[0].t).toBe("WORD");
        expect(typeof parsed[0].date).toBe("number");
    });
});

describe("stringifyExport*", () => {
    it("JSON roundtrip keeps full fidelity", () => {
        const items = [makeItem(), makeItem({ expression: "pear", t: WordType.PHRASE, sentences: [] })];
        expect(parseJsonItems(stringifyExportJson(items))).toEqual(items);
    });

    it("CSV roundtrip keeps word-level fields (tags without commas)", () => {
        const items = [makeItem({ notes: [], sentences: [], connections: [] })];
        const parsed = parseCsvItems(stringifyExportCsv(items));
        expect(parsed[0].expression).toBe("apple");
        expect(parsed[0].meaning).toBe("苹果");
        expect(parsed[0].status).toBe(2);
        expect(parsed[0].tags).toEqual(["fruit"]);
        expect(parsed[0].date).toBe(1700000000);
    });

    it("CSV export writes the documented header", () => {
        const text = stringifyExportCsv([makeItem()]);
        expect(text.split("\n")[0]).toBe("Expression,Meaning,Status,Type,Tags,Date");
    });
});

describe("parseSqliteItems", () => {
    it("reads word-level data from a plugin-schema sqlite file", async () => {
        const adapter = new MemVaultAdapter();
        adapter.provideSqlWasm(MANIFEST_ID);
        const plugin: any = {
            manifest: { id: MANIFEST_ID },
            app: { vault: { adapter } },
        };

        const sqlJs = await loadSqlJs(plugin);
        const db = new sqlJs.Database();
        db.run(`
            CREATE TABLE expressions (
                _id INTEGER PRIMARY KEY AUTOINCREMENT,
                expression text not null,
                meaning text default '',
                status INTEGER default 0,
                t text default '',
                date DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE tags (_id INTEGER PRIMARY KEY AUTOINCREMENT, expression text not null, tag text, date DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE notes (_id INTEGER PRIMARY KEY AUTOINCREMENT, expression text not null, note text, date DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE sentences (_id INTEGER PRIMARY KEY AUTOINCREMENT, expression text not null, sentence text, trans text default '', origin text default '', date DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE connections (_id INTEGER PRIMARY KEY AUTOINCREMENT, expression text not null, connection text, date DATETIME DEFAULT CURRENT_TIMESTAMP);
        `);
        db.run("insert into expressions (expression, meaning, status, t, date) values (?, ?, ?, ?, ?)", ["apple", "苹果", 2, "WORD", 1700000000]);
        db.run("insert into tags (expression, tag) values (?, ?)", ["apple", "fruit"]);
        db.run("insert into notes (expression, note) values (?, ?)", ["apple", "n1"]);
        db.run("insert into sentences (expression, sentence, trans, origin) values (?, ?, ?, ?)", ["apple", "an apple", "一个苹果", "src"]);
        db.run("insert into connections (expression, connection) values (?, ?)", ["apple", "pear"]);

        const bytes: Uint8Array = db.export();
        db.close();

        const file = new File([bytes as unknown as BlobPart], "db.sqlite");
        const items = await parseSqliteItems(plugin, file);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(
            expect.objectContaining({
                expression: "apple",
                meaning: "苹果",
                status: 2,
                t: "WORD",
                date: 1700000000,
            })
        );
        expect(items[0].tags).toEqual(["fruit"]);
        expect(items[0].notes).toEqual(["n1"]);
        expect(items[0].connections).toEqual(["pear"]);
        expect(items[0].sentences).toEqual([
            expect.objectContaining({ sentence: "an apple", trans: "一个苹果", origin: "src" }),
        ]);
    });
});

describe("cross-driver transfer via unified JSON", () => {
    const DRIVES = ["indexed", "sqlite", "csv"] as const;

    describe.each(DRIVES)("export from %s", (source) => {
        it("exportData returns complete joined data", async () => {
            const fixture: DriveFixture = await makeDrive(source);
            const db = fixture.drive;
            // postExpression 的写入时间走第二参数（导入路径用它保留原始时间）
            await db.postExpression(
                makeItem({ expression: "apple", sentences: [
                    { expression: "apple", sentence: "an apple", trans: "一个苹果", origin: "" },
                ] }),
                1700000000
            );
            await db.postExpression(makeItem({ expression: "look up", t: WordType.PHRASE, status: 1 }));

            const items = await db.exportData();
            expect(items).toHaveLength(2);

            const apple = items.find((i) => i.expression === "apple")!;
            expect(apple.meaning).toBe("苹果");
            expect(apple.tags).toEqual(["fruit"]);
            expect(apple.notes).toEqual(["keep"]);
            expect(apple.connections).toEqual(["pear"]);
            expect(apple.sentences.map((s) => s.sentence)).toEqual(["an apple"]);
            expect(apple.date).toBe(1700000000);

            await db.close();
        });
    });

    it("data exported from one drive imports into another via the unified format", async () => {
        const sources = await makeDrive("csv");
        await sources.drive.postExpression(
            makeItem({
                expression: "apple",
                sentences: [{ expression: "apple", sentence: "an apple", trans: "一个苹果", origin: "" }],
            }),
            1700000000
        );

        const items = parseJsonItems(stringifyExportJson(await sources.drive.exportData()));
        await sources.drive.close();

        for (const target of ["indexed", "sqlite", "csv"] as const) {
            const dest = await makeDrive(target);
            await dest.drive.importData(items);

            const got = await dest.drive.getExpression("apple");
            expect(got, `target ${target}`).not.toBeNull();
            expect(got!.meaning).toBe("苹果");
            expect(got!.status).toBe(2);
            expect(got!.tags).toEqual(["fruit"]);
            expect(got!.notes).toEqual(["keep"]);
            expect(got!.connections).toEqual(["pear"]);
            expect(got!.sentences.map((s) => s.sentence)).toEqual(["an apple"]);
            expect(got!.date).toBe(1700000000);

            await dest.drive.close();
        }
    });

    it("import semantics: indexed rebuilds, csv/sqlite merge by expression", async () => {
        // 目标库已有旧数据 old
        for (const target of ["indexed", "sqlite", "csv"] as const) {
            const fixture = await makeDrive(target);
            await fixture.drive.postExpression(makeItem({ expression: "old", meaning: "旧", status: 1 }));
            await fixture.drive.importData([makeItem({ expression: "new", meaning: "新" })]);

            const old = await fixture.drive.getExpression("old");
            if (target === "indexed") {
                // 清空重建：完整恢复
                expect(old, `target ${target}`).toBeNull();
            } else {
                // 覆盖合并：已有数据保留
                expect(old, `target ${target}`).not.toBeNull();
                expect(old!.meaning).toBe("旧");
            }
            expect((await fixture.drive.getExpression("new"))!.meaning).toBe("新");
            await fixture.drive.close();
        }
    });
});
