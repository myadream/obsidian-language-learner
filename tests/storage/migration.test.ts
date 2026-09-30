import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import { makeDrive, MANIFEST_ID } from "../setup/drive-factory";
import { MemVaultAdapter } from "../setup/mem-adapter";
import { Sqlite3StorageDrive } from "@/storage/drive/sqlite3/handle";

describe("sqlite legacy TEXT-date migration", () => {
    it("migrates 'YYYY-MM-DD HH:mm:ss' dates to unix seconds on open", async () => {
        const adapter = new MemVaultAdapter();
        adapter.provideSqlWasm(MANIFEST_ID);
        const storageName = `legacy_dates_${Date.now()}`;

        // 用旧格式手工构造一个数据库文件：date 为 TEXT
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
            CREATE UNIQUE INDEX "expression_index" ON "expressions" ("expression" ASC);
            CREATE INDEX "status_index" ON "expressions" ("status");
            CREATE INDEX "t_index" ON "expressions" ("t");
        `);
        old.run(
            `insert into expressions (expression, meaning, status, t, date) values (?, ?, ?, ?, ?)`,
            ["legacy", "旧词", 1, "WORD", "2026-01-15 10:00:00"]
        );
        const bytes = old.export();
        old.close();
        await adapter.writeBinary(
            `storage/${storageName}.sqlite`,
            bytes as unknown as ArrayBuffer
        );

        // 打开驱动，应自动迁移
        const { drive } = await makeDrive("sqlite", { adapter, storageName });

        // 迁移后 TEXT 与 UNIX 秒的比较恢复正常
        const after = await drive.getExpressionAfter("1970-01-01T00:00:00Z");
        expect(after.map((r) => r.title)).toContain("legacy");

        await drive.countSeven();
        // 2026-01-15 距今不超过 7 天时应在累计里；无论如何迁移后 date 必须是数字
        const check = (drive as Sqlite3StorageDrive as any).storageDrive.exec(
            "select distinct typeof(date) from expressions"
        );
        expect(check[0].values.flat()).toEqual(["integer"]);

        drive.close();
    });
});

describe("indexeddb v1 -> v2 schema upgrade", () => {
    it("upgrades legacy schema and supports multi-sentence storage", async () => {
        const storageName = `legacy_idb_${Date.now()}`;

        // 用原始 IndexedDB API 按 v1 schema 建库并写入数据
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(storageName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                const expressions = db.createObjectStore("expressions", {
                    keyPath: "_id",
                    autoIncrement: true,
                });
                expressions.createIndex("expression", "expression", { unique: true });
                expressions.createIndex("status", "status", { multiEntry: true });
                expressions.createIndex("t", "t");
                expressions.createIndex("date", "date");
                expressions.createIndex("tags", "tags", { multiEntry: true });

                const sentences = db.createObjectStore("sentences", {
                    keyPath: "_id",
                    autoIncrement: true,
                });
                // v1 的坏索引：&text 唯一（字段不存在）、&expression 唯一（阻断多句子）
                sentences.createIndex("text", "text", { unique: true });
                sentences.createIndex("expression", "expression", { unique: true });
                sentences.createIndex("date", "date");
            };
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(["expressions", "sentences"], "readwrite");
                tx.objectStore("expressions").add({
                    expression: "legacy",
                    meaning: "旧词",
                    status: 2,
                    t: "WORD",
                    notes: [],
                    sentences: [],
                    tags: [],
                    connections: [],
                    date: 1700000000,
                });
                tx.objectStore("sentences").add({
                    expression: "legacy",
                    sentence: "legacy sentence",
                    trans: "",
                    origin: "",
                    date: 1,
                });
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });

        const { drive } = await makeDrive("indexed", { storageName });

        // v2 索引生效：既能读到旧数据，也能写多句子
        const got = await drive.getExpression("legacy");
        expect(got).not.toBeNull();
        expect(got!.status).toBe(2);

        await drive.postExpression({
            expression: "legacy",
            meaning: "旧词",
            status: 2,
            t: "WORD",
            tags: [],
            notes: [],
            connections: [],
            date: 1700000000,
            sentences: [
                { expression: "legacy", sentence: "s1", trans: "", origin: "" },
                { expression: "legacy", sentence: "s2", trans: "", origin: "" },
            ],
        } as any);

        const updated = await drive.getExpression("legacy");
        expect(updated!.sentences).toHaveLength(2);

        expect(await drive.tryGetSen("legacy sentence")).not.toBeNull();

        drive.close();
    });
});
