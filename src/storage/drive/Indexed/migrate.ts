import { ExpressionsTable, SentencesTable } from "../types";
import { toUnixSeconds } from "@/storage/utils";

/**
 * 上游旧版（主键 ++id 时代）IndexedDB 的迁移。
 *
 * 旧 schema（v1，字段主键 id）：
 *   expressions: "++id, &expression, status, t, date, *tags"
 *   sentences:   "++id, &text"
 * 重构后主键改为 ++_id（字段 _id），Dexie 不支持原地更换主键
 * （UpgradeError: Not yet support for changing primary key），旧库只能：
 * 读取全部行 → 删除旧库 → 按 v2 schema 重建 → 写回归一化后的数据。
 */

export interface LegacyRows {
    expressions: ExpressionsTable[];
    sentences: SentencesTable[];
}

/** 旧版 tags/sentences 可能以 Set 存储（IndexedDB 结构化克隆支持 Set） */
function toArray(v: unknown): unknown[] {
    if (Array.isArray(v)) return v;
    if (v instanceof Set) return [...v];
    return [];
}

/** 旧版 connections 是 Map<关联词, 释义>，新结构只保留关联词列表 */
function connectionsToArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map(String);
    if (v instanceof Map) return [...v.keys()].map(String);
    if (v instanceof Set) return [...v].map(String);
    return [];
}

function toUnix(v: unknown): number {
    return toUnixSeconds(v as number | string | undefined | null);
}

/**
 * 把两个时代的旧行（++id 时代与 ++_id 但 sentence 字段还叫 text 的时代）
 * 归一化为当前 v2 结构。保留原始数字主键，expression.sentences 里
 * 引用的句子 id 因此无需重写。
 */
export function normalizeLegacyRows(rawExprs: any[], rawSens: any[]): LegacyRows {
    // 句子 id -> 所属词条，用于给旧句子行回填 expression / date
    const exprBySentenceId = new Map<number, any>();
    const expressions = rawExprs
        .filter((row) => row && typeof row.expression === "string" && row.expression)
        .map((row) => {
            const sentenceIds = toArray(row.sentences).map(Number);
            for (const id of sentenceIds) {
                exprBySentenceId.set(id, row);
            }
            return {
                _id: row._id ?? row.id,
                expression: row.expression,
                meaning: String(row.meaning ?? ""),
                status: Number.parseInt(String(row.status ?? 0)) || 0,
                t: String(row.t ?? "WORD").toUpperCase() || "WORD",
                date: toUnix(row.date),
                tags: toArray(row.tags).map(String),
                notes: toArray(row.notes).map(String),
                sentences: sentenceIds,
                connections: connectionsToArray(row.connections),
            } as ExpressionsTable;
        });

    const sentences = rawSens
        .filter((row) => row && (row.sentence ?? row.text))
        .map((row) => {
            const parent = exprBySentenceId.get(Number(row._id ?? row.id));
            return {
                _id: row._id ?? row.id,
                expression: row.expression ?? parent?.expression ?? "",
                sentence: String(row.sentence ?? row.text),
                trans: String(row.trans ?? ""),
                origin: String(row.origin ?? ""),
                date: toUnix(row.date ?? parent?.date),
            } as SentencesTable;
        });

    return { expressions, sentences };
}

function openRaw(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        // 不带版本号打开，不会触发升级，也读不到 onupgradeneeded
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error(`open(${name}) blocked`));
    });
}

function readStore(db: IDBDatabase, store: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) {
            resolve([]);
            return;
        }
        const req = db.transaction(store, "readonly").objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
    });
}

function deleteRaw(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error(`deleteDatabase(${name}) blocked`));
    });
}

/**
 * 读出旧库全部数据并删除旧库。读取在删除之前，任一步失败都会抛出，
 * 绝不先删后读，避免数据丢失。
 */
export async function migrateLegacyIndexedDb(name: string): Promise<LegacyRows | null> {
    const db = await openRaw(name);
    let rows: LegacyRows;
    try {
        const [rawExprs, rawSens] = await Promise.all([
            readStore(db, "expressions"),
            readStore(db, "sentences"),
        ]);
        rows = normalizeLegacyRows(rawExprs, rawSens);
    } finally {
        db.close();
    }
    await deleteRaw(name);
    return rows;
}
