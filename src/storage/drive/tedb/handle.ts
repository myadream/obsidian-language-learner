import StorageDrive, {
    Paginate,
    PaginateResult,
    SortParams,
} from "@/storage/drive";
import {
    ArticleWords,
    CountInfo,
    ExpressionInfo,
    ExpressionInfoSimple,
    Phrase,
    Sentence,
    Word,
    WordCount,
    WordsPhrase,
    WordType,
} from "@/storage/interface";

import Plugin from "@/plugin";
import { ReviewScheduleRecord, WordSchedule } from "@/review/types";
import { moment, Platform } from "obsidian";
import { createAutomaton } from "ac-auto";
import { toUnixSeconds } from "@/storage/utils";
import type { ElectronStorage } from "@qiyangxy/tedb-electron-storage";

// tedb-electron-storage 的构建产物里 require("fs"|"path"|"os") 会被 vite 插件
// （tedbRealNodeModules，见 vite.config.ts）改写为 globalThis.__tedbRequire(...)，
// 以绕过 removeNodeJsModules 的浏览器空 stub。这里在动态加载该库之前提供实现：
// 桌面端 Obsidian（Electron）渲染进程带 Node 环境，window.require 可用。
// 本模块顶层只定义函数，移动端加载无害；真正加载 tedb 库的动态 import 只在
// 桌面端 open() 中发生。
(globalThis as any).__tedbRequire = (mod: string) => {
    const req =
        (globalThis as any).require ?? (globalThis as any).window?.require;
    if (typeof req !== "function") {
        throw new Error(
            `[TedbStorage] runtime require("${mod}") unavailable; the tedb driver is desktop-only`
        );
    }
    return req(mod);
};

interface TedbExpression {
    _id: number;
    expression: string;
    meaning: string;
    status: number;
    t: string;
    date: number;
}

interface TedbSentence {
    _id: number;
    expression: string;
    sentence: string;
    trans: string;
    origin: string;
    date: number;
}

interface TedbTag {
    _id: number;
    expression: string;
    tag: string;
    date: number;
}

interface TedbNote {
    _id: number;
    expression: string;
    note: string;
    date: number;
}

interface TedbConnection {
    _id: number;
    expression: string;
    connection: string;
    date: number;
}

const TABLES = [
    "expressions",
    "sentences",
    "tags",
    "notes",
    "connections",
    "schedules",
] as const;

type TableName = (typeof TABLES)[number];

/**
 * TeDB 存储驱动（桌面端专用）：
 * - 每张表一个 ElectronStorage 集合（每文档一个 JSON 文件，原子写入 + 一代备份 + 自愈）
 * - 打开时全量载入内存，查询与 CSV 驱动同构
 * - 写入按文档粒度即时落盘（无防抖），单条 add/update/remove 都是 O(1) 文件写
 * - 表达式的文件 key 做了编码（tedb 的 key 不能包含 `.` 等文件名敏感字符）
 */
export class TedbStorageDrive extends StorageDrive {
    plugin: Plugin;
    storageName: string;
    dataDir: string;

    expressions: TedbExpression[] = [];
    sentences: TedbSentence[] = [];
    tags: TedbTag[] = [];
    notes: TedbNote[] = [];
    connections: TedbConnection[] = [];
    schedules: ReviewScheduleRecord[] = [];

    private storages: { [K in TableName]?: ElectronStorage } = {};
    private nextIds: Record<TableName, number> = {
        expressions: 1,
        sentences: 1,
        tags: 1,
        notes: 1,
        connections: 1,
        schedules: 1,
    };

    constructor(plugin: Plugin) {
        super();
        this.plugin = plugin;
        this.storageName = plugin.settings.storage.storage_name;
        const conf = plugin.settings.storage.drive["tedb"] || {};
        this.dataDir = conf.storage_path || "storage";
    }

    // ---- key 处理 ----

    /**
     * tedb 的 key 取"文件名第一个 . 之前"且直接作为文件名，
     * 因此 key 不能含 `.` / `/` / `\`；统一 encodeURIComponent 后再补齐
     * 它保留的文件名不友好字符（. ! * ' ( )），超长时截断并追加哈希防碰撞。
     */
    private static expressionKey(expression: string): string {
        let key = encodeURIComponent(expression).replace(
            /[.!*'()\\]/g,
            (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
        );
        if (key.length > 150) {
            let hash = 5381;
            for (let i = 0; i < expression.length; i++) {
                hash = ((hash << 5) + hash + expression.charCodeAt(i)) | 0;
            }
            key = `${key.slice(0, 140)}-${(hash >>> 0).toString(16)}`;
        }
        return key;
    }

    private storageOf(table: TableName): ElectronStorage {
        const storage = this.storages[table];
        if (!storage) {
            throw new Error(`[TedbStorage] ${table} storage is not open`);
        }
        return storage;
    }

    private nextId(table: TableName): number {
        return this.nextIds[table]++;
    }

    // ---- 生命周期 ----

    async open(): Promise<void> {
        if (!Platform.isDesktopApp) {
            throw new Error(
                "[TedbStorage] the tedb driver relies on Node fs and is desktop-only"
            );
        }

        const lib = await import("@qiyangxy/tedb-electron-storage");

        const adapter = this.plugin.app.vault.adapter as any;
        if (typeof adapter.getBasePath !== "function") {
            throw new Error(
                "[TedbStorage] adapter.getBasePath is unavailable; cannot resolve data dir"
            );
        }
        const vaultBase = String(adapter.getBasePath()).replace(/\\/g, "/");
        const rel = this.dataDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        const dir = rel ? `${vaultBase}/${rel}` : vaultBase;

        const conf = this.plugin.settings.storage.drive["tedb"] || {};
        const durability: "strict" | "relaxed" =
            conf.durability === "strict" ? "strict" : "relaxed";

        const ElectronStorageCtor = lib.ElectronStorage;
        for (const table of TABLES) {
            this.storages[table] = new ElectronStorageCtor(
                this.storageName,
                table,
                dir,
                { durability }
            );
        }

        await Promise.all(TABLES.map((table) => this.loadTable(table)));

        // 恢复自增 id
        const maxOf = (rows: Array<{ _id: number }>) =>
            rows.reduce((m, r) => Math.max(m, r._id), 0);
        this.nextIds = {
            expressions: maxOf(this.expressions) + 1,
            sentences: maxOf(this.sentences) + 1,
            tags: maxOf(this.tags) + 1,
            notes: maxOf(this.notes) + 1,
            connections: maxOf(this.connections) + 1,
        };
    }

    /** iterate 的回调返回真值会中断扫描，必须用块语句避免 push 返回值中断 */
    private async loadTable(table: TableName): Promise<void> {
        const rows: any[] = [];
        await this.storageOf(table).iterate((value: any) => {
            if (value && typeof value === "object") {
                rows.push(value);
            }
        });

        const toNum = (v: any) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        switch (table) {
            case "expressions":
                this.expressions = rows.map((r) => ({
                    _id: toNum(r._id),
                    expression: r.expression ?? "",
                    meaning: r.meaning ?? "",
                    status: toNum(r.status),
                    t: r.t || WordType.WORD,
                    date: toNum(r.date),
                }));
                break;
            case "sentences":
                this.sentences = rows.map((r) => ({
                    _id: toNum(r._id),
                    expression: r.expression ?? "",
                    sentence: r.sentence ?? "",
                    trans: r.trans ?? "",
                    origin: r.origin ?? "",
                    date: toNum(r.date),
                }));
                break;
            case "tags":
                this.tags = rows.map((r) => ({
                    _id: toNum(r._id),
                    expression: r.expression ?? "",
                    tag: r.tag ?? "",
                    date: toNum(r.date),
                }));
                break;
            case "notes":
                this.notes = rows.map((r) => ({
                    _id: toNum(r._id),
                    expression: r.expression ?? "",
                    note: r.note ?? "",
                    date: toNum(r.date),
                }));
                break;
            case "connections":
                this.connections = rows.map((r) => ({
                    _id: toNum(r._id),
                    expression: r.expression ?? "",
                    connection: r.connection ?? "",
                    date: toNum(r.date),
                }));
                break;
            case "schedules":
                this.schedules = rows
                    .filter((r) => typeof r?.expression === "string" && r.schedule?.algorithm)
                    .map((r) => ({ expression: r.expression, schedule: r.schedule }));
                break;
        }
    }

    close(): void {
        // 写入在每次变更时已按文档即时落盘（await 后才返回），无待刷缓冲
    }

    // ---- 复习调度（schedules 关联表） ----

    async getSchedule(expression: string): Promise<WordSchedule | undefined> {
        return this.schedules.find((r) => r.expression === expression)?.schedule;
    }

    async putSchedule(expression: string, schedule: WordSchedule): Promise<void> {
        const i = this.schedules.findIndex((r) => r.expression === expression);
        if (i >= 0) {
            this.schedules[i] = { expression, schedule };
        } else {
            this.schedules.push({ expression, schedule });
        }
        await this.storageOf("schedules").setItem(
            TedbStorageDrive.expressionKey(expression),
            { expression, schedule }
        );
    }

    async getAllSchedules(): Promise<ReviewScheduleRecord[]> {
        return this.schedules.map((r) => ({ expression: r.expression, schedule: r.schedule }));
    }

    /** 覆盖合并（与 importData 语义对齐） */
    async importSchedules(items: ReviewScheduleRecord[]): Promise<void> {
        const byExpression = new Map(this.schedules.map((r) => [r.expression, r.schedule]));
        for (const item of items) {
            byExpression.set(item.expression, item.schedule);
        }

        const next = [...byExpression].map(([expression, schedule]) => ({ expression, schedule }));
        const keep = new Set(next.map((r) => r.expression));
        for (const r of this.schedules) {
            if (!keep.has(r.expression)) {
                await this.storageOf("schedules").removeItem(
                    TedbStorageDrive.expressionKey(r.expression)
                );
            }
        }
        for (const r of next) {
            await this.storageOf("schedules").setItem(
                TedbStorageDrive.expressionKey(r.expression),
                r
            );
        }
        this.schedules = next;
    }

    // ---- 查询（与 CSV 驱动同构，全部走内存） ----

    async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
        const wanted = new Set(payload.words.map((w) => w.toLowerCase()));
        const storedWords: Word[] = this.expressions
            .filter(
                (e) =>
                    e.t === WordType.WORD &&
                    wanted.has(e.expression.toLowerCase())
            )
            .map((e) => ({ text: e.expression, status: e.status }));

        const storedPhrases = new Map<string, number>();
        this.expressions
            .filter((e) => e.t === WordType.PHRASE)
            .forEach((e) => storedPhrases.set(e.expression, e.status));

        const ac = await createAutomaton([...storedPhrases.keys()]);
        const searchedPhrases = (await ac.search(payload.article)).map(
            (match) =>
                ({
                    text: match[1],
                    status: storedPhrases.get(match[1]),
                    offset: match[0],
                } as Phrase)
        );

        return { words: storedWords, phrases: searchedPhrases };
    }

    async getExpression(expression: string): Promise<ExpressionInfo> {
        expression = expression.toLowerCase();
        const expr = this.expressions.find(
            (e) => e.expression.toLowerCase() === expression
        );
        if (!expr) {
            return null;
        }

        return {
            expression: expr.expression,
            meaning: expr.meaning,
            status: expr.status,
            t: expr.t,
            tags: this.tags.filter((t) => t.expression === expr.expression).map((t) => t.tag),
            notes: this.notes.filter((n) => n.expression === expr.expression).map((n) => n.note),
            sentences: this.sentences.filter((s) => s.expression === expr.expression) as Sentence[],
            connections: this.connections
                .filter((c) => c.expression === expr.expression)
                .map((c) => c.connection),
            date: expr.date,
        };
    }

    async getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]> {
        const wanted = new Set(expressions.map((e) => e.toLowerCase()));
        return this.expressions
            .filter((e) => wanted.has(e.expression.toLowerCase()))
            .map((e) => ({
                expression: e.expression,
                meaning: e.meaning,
                status: e.status,
                t: e.t,
                tags: this.tags.filter((t) => t.expression === e.expression).map((t) => t.tag),
                sen_num: this.sentences.filter((s) => s.expression === e.expression).length,
                note_num: this.notes.filter((n) => n.expression === e.expression).length,
                date: e.date,
            }));
    }

    private static readonly SORTERS: Record<string, (a: any, b: any) => number> = {
        expression: (a, b) => a.expression.localeCompare(b.expression),
        meaning: (a, b) => a.meaning.localeCompare(b.meaning),
        status: (a, b) => a.status - b.status,
        date: (a, b) => Number(a.date) - Number(b.date),
    };

    async getAllExpressionSimple(
        ignores?: boolean,
        sort?: SortParams,
        search?: SortParams,
        paginate?: Paginate
    ): Promise<PaginateResult<ExpressionInfoSimple[]>> {
        const bottomStatus = ignores ? -1 : 0;
        const pageSize = paginate?.pageSize || 100;
        const page = paginate?.page || 0; // 0-based

        let rows = this.expressions.filter((e) => e.status > bottomStatus);

        if (search && Object.keys(search).length > 0) {
            rows = rows.filter((expr) => {
                let match = true;
                if (search.expression) {
                    match =
                        match &&
                        expr.expression.toLowerCase().includes(search.expression.toLowerCase());
                }
                if (search.meaning && match) {
                    match =
                        match &&
                        expr.meaning.toLowerCase().includes(search.meaning.toLowerCase());
                }
                if (search.status !== undefined && match) {
                    match = match && expr.status === search.status;
                }
                if (search.t && match) {
                    match = match && expr.t === search.t;
                }
                if (search.tags && Array.isArray(search.tags) && search.tags.length && match) {
                    const exprTags = this.tags
                        .filter((t) => t.expression === expr.expression)
                        .map((t) => t.tag);
                    match = match && exprTags.some((tag) => search.tags.includes(tag));
                }
                return match;
            });
        }

        if (sort && Object.keys(sort).length > 0) {
            const sortField = Object.keys(sort)[0];
            const dir = sort[sortField] === "asc" ? 1 : -1;
            const base = TedbStorageDrive.SORTERS[sortField];
            if (base) {
                rows = [...rows].sort((a, b) => dir * base(a, b));
            }
        } else {
            rows = [...rows].sort((a, b) => Number(b.date) - Number(a.date));
        }

        const total = rows.length;
        const offset = page * pageSize;
        const data = rows.slice(offset, offset + pageSize).map((expr) => ({
            expression: expr.expression,
            status: expr.status,
            meaning: expr.meaning,
            t: expr.t,
            tags: this.tags.filter((t) => t.expression === expr.expression).map((t) => t.tag),
            note_num: this.notes.filter((n) => n.expression === expr.expression).length,
            sen_num: this.sentences.filter((s) => s.expression === expr.expression).length,
            date: expr.date,
        }));

        return { data, total, page: page + 1, pageSize };
    }

    // ---- 写入 ----

    async postExpression(payload: ExpressionInfo, date = moment().unix()): Promise<number> {
        // 句子：按 (expression, sentence) 幂等，清理不再引用的旧句子
        const keptIds = new Set<number>();
        for (const sen of payload.sentences) {
            const existing = this.sentences.find(
                (s) => s.expression === payload.expression && s.sentence === sen.sentence
            );
            if (existing) {
                existing.sentence = sen.sentence;
                existing.trans = sen.trans || "";
                existing.origin = sen.origin || "";
                existing.date = date;
                keptIds.add(existing._id);
                await this.storageOf("sentences").setItem(String(existing._id), existing);
            } else {
                const row: TedbSentence = {
                    _id: this.nextId("sentences"),
                    expression: payload.expression,
                    sentence: sen.sentence,
                    trans: sen.trans || "",
                    origin: sen.origin || "",
                    date,
                };
                this.sentences.push(row);
                keptIds.add(row._id);
                await this.storageOf("sentences").setItem(String(row._id), row);
            }
        }
        if (keptIds.size > 0 || payload.sentences.length === 0) {
            const stale = this.sentences.filter(
                (s) => s.expression === payload.expression && !keptIds.has(s._id)
            );
            for (const s of stale) {
                await this.storageOf("sentences").removeItem(String(s._id));
            }
            if (stale.length > 0) {
                const staleIds = new Set(stale.map((s) => s._id));
                this.sentences = this.sentences.filter(
                    (s) => !staleIds.has(s._id)
                );
            }
        }

        // 标签/笔记/关联：幂等追加
        for (const tag of payload.tags) {
            if (!this.tags.some((t) => t.expression === payload.expression && t.tag === tag)) {
                const row: TedbTag = {
                    _id: this.nextId("tags"),
                    expression: payload.expression,
                    tag,
                    date,
                };
                this.tags.push(row);
                await this.storageOf("tags").setItem(String(row._id), row);
            }
        }
        for (const note of payload.notes) {
            if (!this.notes.some((n) => n.expression === payload.expression && n.note === note)) {
                const row: TedbNote = {
                    _id: this.nextId("notes"),
                    expression: payload.expression,
                    note,
                    date,
                };
                this.notes.push(row);
                await this.storageOf("notes").setItem(String(row._id), row);
            }
        }
        for (const conn of payload.connections) {
            if (
                !this.connections.some(
                    (c) => c.expression === payload.expression && c.connection === conn
                )
            ) {
                const row: TedbConnection = {
                    _id: this.nextId("connections"),
                    expression: payload.expression,
                    connection: conn,
                    date,
                };
                this.connections.push(row);
                await this.storageOf("connections").setItem(String(row._id), row);
            }
        }

        // 表达式 upsert（expression 唯一）
        const existing = this.expressions.find((e) => e.expression === payload.expression);
        if (existing) {
            existing.meaning = payload.meaning;
            existing.status = payload.status;
            existing.t = payload.t;
            existing.date = date;
            await this.storageOf("expressions").setItem(
                TedbStorageDrive.expressionKey(existing.expression),
                existing
            );
        } else {
            const row: TedbExpression = {
                _id: this.nextId("expressions"),
                expression: payload.expression,
                meaning: payload.meaning,
                status: payload.status,
                t: payload.t,
                date,
            };
            this.expressions.push(row);
            await this.storageOf("expressions").setItem(
                TedbStorageDrive.expressionKey(row.expression),
                row
            );
        }

        return 200;
    }

    async removeExpression(expression: string): Promise<boolean> {
        const before = this.expressions.length;
        const target = this.expressions.find((e) => e.expression === expression);
        if (target) {
            await this.storageOf("expressions").removeItem(
                TedbStorageDrive.expressionKey(target.expression)
            );
        }
        this.expressions = this.expressions.filter(
            (e) => e.expression !== expression
        );
        const removed = this.expressions.length < before;

        const cascade = async (
            rows: Array<{ _id: number; expression: string }>,
            table: TableName
        ) => {
            const stale = rows.filter((r) => r.expression === expression);
            for (const r of stale) {
                await this.storageOf(table).removeItem(String(r._id));
            }
            if (stale.length > 0) {
                const staleIds = new Set(stale.map((r) => r._id));
                this[table] = (this[table] as Array<{ _id: number }>).filter(
                    (r) => !staleIds.has(r._id)
                ) as any;
            }
        };

        await cascade(this.sentences, "sentences");
        await cascade(this.tags, "tags");
        await cascade(this.notes, "notes");
        await cascade(this.connections, "connections");

        return removed;
    }

    async getTags(): Promise<string[]> {
        return [...new Set(this.tags.map((t) => t.tag))];
    }

    async postIgnoreWords(payload: string[]): Promise<void> {
        for (const raw of payload) {
            const expression = raw.trim().toLowerCase();
            if (!expression) continue;

            const existing = this.expressions.find((e) => e.expression === expression);
            if (existing) {
                existing.status = 0;
                existing.date = moment().unix();
                await this.storageOf("expressions").setItem(
                    TedbStorageDrive.expressionKey(existing.expression),
                    existing
                );
            } else {
                const row: TedbExpression = {
                    _id: this.nextId("expressions"),
                    expression,
                    meaning: "",
                    status: 0,
                    t: WordType.WORD,
                    date: moment().unix(),
                };
                this.expressions.push(row);
                await this.storageOf("expressions").setItem(
                    TedbStorageDrive.expressionKey(row.expression),
                    row
                );
            }
        }
    }

    async tryGetSen(text: string): Promise<Sentence> {
        return this.sentences.find((s) => s.sentence === text) || null;
    }

    // ---- 统计 ----

    async getCount(): Promise<CountInfo> {
        const counts: { WORD: number[]; PHRASE: number[] } = {
            WORD: [0, 0, 0, 0, 0],
            PHRASE: [0, 0, 0, 0, 0],
        };
        for (const expr of this.expressions) {
            const bucket = counts[expr.t as WordType];
            if (bucket && expr.status >= 0 && expr.status <= 4) {
                bucket[expr.status]++;
            }
        }
        return { word_count: counts.WORD, phrase_count: counts.PHRASE };
    }

    async countSeven(): Promise<WordCount[]> {
        const spans = [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const start = moment().subtract(6, "days").startOf("day");
            const from = start.add(i, "days");
            return { from: from.unix(), to: from.endOf("day").unix() };
        });

        return spans.map((span) => {
            const today = [0, 0, 0, 0, 0];
            const accumulated = [0, 0, 0, 0, 0];

            for (const expr of this.expressions) {
                if (expr.t !== WordType.WORD) continue;
                if (expr.status < 0 || expr.status > 4) continue;

                if (expr.date >= span.from && expr.date <= span.to) {
                    today[expr.status]++;
                }
                if (expr.date <= span.to) {
                    accumulated[expr.status]++;
                }
            }
            return { today, accumulated };
        });
    }

    // ---- 销毁 / 导入导出（文件格式在外层 transfer.ts 统一处理，驱动只面对数据） ----

    async destroyAll(): Promise<void> {
        for (const table of TABLES) {
            await this.storageOf(table).clear();
        }
        this.expressions = [];
        this.sentences = [];
        this.tags = [];
        this.notes = [];
        this.connections = [];
        this.nextIds = {
            expressions: 1,
            sentences: 1,
            tags: 1,
            notes: 1,
            connections: 1,
        };
    }

    /** 全量导出为统一数据结构：词条 + 关联的标签/笔记/例句/关联词 */
    async exportData(): Promise<ExpressionInfo[]> {
        return this.expressions.map((e) => ({
            expression: e.expression,
            meaning: e.meaning,
            status: e.status,
            t: e.t,
            tags: this.tags
                .filter((t) => t.expression === e.expression)
                .map((t) => t.tag),
            notes: this.notes
                .filter((n) => n.expression === e.expression)
                .map((n) => n.note),
            sentences: this.sentences
                .filter((s) => s.expression === e.expression)
                .map((s) => ({
                    expression: s.expression,
                    sentence: s.sentence,
                    trans: s.trans,
                    origin: s.origin,
                    date: s.date,
                })),
            connections: this.connections
                .filter((c) => c.expression === e.expression)
                .map((c) => c.connection),
            date: e.date,
        }));
    }

    /** 覆盖合并导入：按 expression upsert，保留数据自带的原始时间 */
    async importData(items: ExpressionInfo[]): Promise<void> {
        for (const item of items) {
            if (!item?.expression) continue;
            await this.postExpression(item, toUnixSeconds(item.date));
        }
    }
}
