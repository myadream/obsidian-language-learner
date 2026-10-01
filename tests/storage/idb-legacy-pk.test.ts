import { describe, it, expect } from "vitest";
import { makeDrive } from "../setup/drive-factory";

/**
 * 上游旧版 schema 的主键是 ++id（字段 id），重构后改为 ++_id。
 * Dexie 无法原地更换主键（UpgradeError: Not yet support for changing
 * primary key），必须迁移数据后删库重建。这里模拟两个时代的旧库：
 * - ++id 时代：句子字段叫 text，tags/sentences 存 Set，connections 存 Map；
 * - ++_id 但 v1 时代：句子字段仍叫 text（靠 v2 upgrade 钩子归一化）。
 */

function putAll(db: IDBDatabase, store: string, rows: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        for (const row of rows) {
            tx.objectStore(store).put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function createRawDb(
    storageName: string,
    version: number,
    keyPath: string
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(storageName, version);
        req.onupgradeneeded = () => {
            const db = req.result;
            db.createObjectStore("expressions", { keyPath, autoIncrement: true });
            db.createObjectStore("sentences", { keyPath, autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

describe("indexeddb legacy ++id primary key migration", () => {
    it("rebuilds legacy db keeping data, links and sentence search", async () => {
        const storageName = `legacy_pk_idb_${Date.now()}`;
        const db = await createRawDb(storageName, 1, "id");
        await putAll(db, "sentences", [
            // 上游旧结构：无 expression/date，字段叫 text
            { text: "legacy sentence", trans: "翻译", origin: "" },
            { text: "another sentence", trans: "", origin: "" },
        ]);
        await putAll(db, "expressions", [
            {
                expression: "legacy",
                meaning: "旧词",
                status: 2,
                t: "WORD",
                date: 1700000000,
                notes: ["note1"],
                tags: new Set(["tagA", "tagB"]),
                sentences: new Set([1, 2]),
                connections: new Map([["related", "x"]]),
            },
        ]);
        db.close();

        // 修复前：open() 直接抛 UpgradeError: Not yet support for changing primary key
        const { drive } = await makeDrive("indexed", { storageName });

        const got = await drive.getExpression("legacy");
        expect(got).not.toBeNull();
        expect(got!.status).toBe(2);
        expect(got!.tags).toEqual(["tagA", "tagB"]);
        expect(got!.notes).toEqual(["note1"]);
        expect(got!.connections).toEqual(["related"]);
        expect(got!.sentences.map((s) => s.sentence)).toEqual([
            "legacy sentence",
            "another sentence",
        ]);

        // v2 的 sentence 索引可查到迁移后的句子
        expect(await drive.tryGetSen("legacy sentence")).not.toBeNull();

        // 迁移后主键沿用旧 id，新写入不受影响（自增计数器已越过旧 id）
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

        drive.close();

        // 重开走正常 v2 路径，不再触发迁移
        const { drive: reopened } = await makeDrive("indexed", { storageName });
        expect(await reopened.getExpression("legacy")).not.toBeNull();
        reopened.close();
    });
});

describe("indexeddb v1 (_id) text-field rows normalization", () => {
    it("renames sentence text field via v2 upgrade hook", async () => {
        const storageName = `legacy_text_idb_${Date.now()}`;
        const db = await createRawDb(storageName, 1, "_id");
        await putAll(db, "sentences", [
            { _id: 1, text: "old text sentence", trans: "", origin: "" },
        ]);
        await putAll(db, "expressions", [
            {
                _id: 1,
                expression: "mid",
                meaning: "",
                status: 1,
                t: "WORD",
                date: 1700000000,
                notes: [],
                tags: new Set(["tag1"]),
                sentences: [1],
                connections: [],
            },
        ]);
        db.close();

        const { drive } = await makeDrive("indexed", { storageName });

        expect(await drive.tryGetSen("old text sentence")).not.toBeNull();
        const got = await drive.getExpression("mid");
        expect(got!.tags).toEqual(["tag1"]);
        expect(got!.sentences[0].sentence).toBe("old text sentence");

        drive.close();
    });
});
