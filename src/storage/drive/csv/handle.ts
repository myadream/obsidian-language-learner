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
    ReviewWord,
    Sentence,
    Word,
    WordCount,
    WordsPhrase,
    WordType,
} from "@/storage/interface";

import Plugin from "@/plugin";
import { moment } from "obsidian";
import { createAutomaton } from "ac-auto";
import download from "downloadjs";
import { parseCsvTable, parseCsvLine, stringifyCsvTable } from "./csv";

interface CsvExpression {
    _id: number;
    expression: string;
    meaning: string;
    status: number;
    t: string;
    date: number;
}

interface CsvSentence {
    _id: number;
    expression: string;
    sentence: string;
    trans: string;
    origin: string;
    date: number;
}

interface CsvTag {
    _id: number;
    expression: string;
    tag: string;
    date: number;
}

interface CsvNote {
    _id: number;
    expression: string;
    note: string;
    date: number;
}

interface CsvConnection {
    _id: number;
    expression: string;
    connection: string;
    date: number;
}

const EXPRESSION_HEADERS = ["_id", "expression", "meaning", "status", "t", "date"];
const SENTENCE_HEADERS = ["_id", "expression", "sentence", "trans", "origin", "date"];
const TAG_HEADERS = ["_id", "expression", "tag", "date"];
const NOTE_HEADERS = ["_id", "expression", "note", "date"];
const CONNECTION_HEADERS = ["_id", "expression", "connection", "date"];

/**
 * CSV 存储驱动：把数据库存为 vault 内的一组 CSV 文件（纯文本、可同步、可外部编辑）。
 * 打开时全部读入内存操作，写入后延迟回写对应的 CSV 文件（close 时强制落盘）。
 */
export class CsvStorageDrive extends StorageDrive {
    plugin: Plugin;
    storageName: string;
    storageDir: string;
    basePath: string;

    expressions: CsvExpression[] = [];
    sentences: CsvSentence[] = [];
    tags: CsvTag[] = [];
    notes: CsvNote[] = [];
    connections: CsvConnection[] = [];

    private nextIds: Record<string, number> = {
        expressions: 1,
        sentences: 1,
        tags: 1,
        notes: 1,
        connections: 1,
    };

    private dirty = new Set<string>();
    private persistTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingPersist = false;

    constructor(plugin: Plugin) {
        super();
        this.plugin = plugin;
        this.storageName = plugin.settings.storage.storage_name;
        const driveConf = plugin.settings.storage.drive["csv"] || {};
        this.storageDir = driveConf.storage_path || "storage";
        this.basePath = `${this.storageDir}/${this.storageName}`.replace(/\/+/g, "/");
    }

    // ---- 文件读写 ----

    private fileOf(table: string): string {
        return `${this.basePath}/${table}.csv`;
    }

    private async loadTable<T extends Record<string, string>>(
        table: string
    ): Promise<T[]> {
        const adapter = this.plugin.app.vault.adapter;
        try {
            if (!(await adapter.exists(this.fileOf(table)))) {
                return [];
            }
            const text = await adapter.read(this.fileOf(table));
            return parseCsvTable<T>(text) as T[];
        } catch (e) {
            console.warn(`[CsvStorage] failed to load ${table}, starting empty`, e);
            return [];
        }
    }

    private markDirty(...tables: string[]) {
        tables.forEach((t) => this.dirty.add(t));
        this.schedulePersist();
    }

    private async persistTable(table: string): Promise<void> {
        const adapter = this.plugin.app.vault.adapter;
        let rows: Array<Record<string, any>> = [];
        let headers: string[] = [];
        switch (table) {
            case "expressions":
                rows = this.expressions;
                headers = EXPRESSION_HEADERS;
                break;
            case "sentences":
                rows = this.sentences;
                headers = SENTENCE_HEADERS;
                break;
            case "tags":
                rows = this.tags;
                headers = TAG_HEADERS;
                break;
            case "notes":
                rows = this.notes;
                headers = NOTE_HEADERS;
                break;
            case "connections":
                rows = this.connections;
                headers = CONNECTION_HEADERS;
                break;
        }

        try {
            const dir = this.basePath;
            if (!(await adapter.exists(dir))) {
                await adapter.mkdir(dir);
            }
            await adapter.write(this.fileOf(table), stringifyCsvTable(rows, headers as any));
        } catch (e) {
            console.error(`[CsvStorage] failed to persist ${table}`, e);
        }
    }

    private schedulePersist(delayMs = 1500): void {
        this.pendingPersist = true;
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            this.flushPersist();
        }, delayMs);
    }

    private flushPersist(): void {
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        if (!this.pendingPersist) {
            return;
        }
        this.pendingPersist = false;
        const tables = [...this.dirty];
        this.dirty.clear();
        for (const table of tables) {
            this.persistTable(table);
        }
    }

    private nextId(table: string): number {
        return this.nextIds[table]++;
    }

    // ---- 生命周期 ----

    async open(): Promise<void> {
        const [expressions, sentences, tags, notes, connections] = await Promise.all([
            this.loadTable<Record<string, string>>("expressions"),
            this.loadTable<Record<string, string>>("sentences"),
            this.loadTable<Record<string, string>>("tags"),
            this.loadTable<Record<string, string>>("notes"),
            this.loadTable<Record<string, string>>("connections"),
        ]);

        const toNum = (v: string) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        this.expressions = expressions.map((r) => ({
            _id: toNum(r._id),
            expression: r.expression ?? "",
            meaning: r.meaning ?? "",
            status: toNum(r.status),
            t: r.t || WordType.WORD,
            date: toNum(r.date),
        }));
        this.sentences = sentences.map((r) => ({
            _id: toNum(r._id),
            expression: r.expression ?? "",
            sentence: r.sentence ?? "",
            trans: r.trans ?? "",
            origin: r.origin ?? "",
            date: toNum(r.date),
        }));
        this.tags = tags.map((r) => ({
            _id: toNum(r._id),
            expression: r.expression ?? "",
            tag: r.tag ?? "",
            date: toNum(r.date),
        }));
        this.notes = notes.map((r) => ({
            _id: toNum(r._id),
            expression: r.expression ?? "",
            note: r.note ?? "",
            date: toNum(r.date),
        }));
        this.connections = connections.map((r) => ({
            _id: toNum(r._id),
            expression: r.expression ?? "",
            connection: r.connection ?? "",
            date: toNum(r.date),
        }));

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

    close(): void {
        this.flushPersist();
    }

    // ---- 查询 ----

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

    async getExpressionAfter(time: string): Promise<ReviewWord[]> {
        const unixStamp = moment.utc(time).unix();
        const res: ReviewWord[] = [];

        const after = this.expressions
            .filter((e) => e.status > 0 && e.date > unixStamp)
            .sort((a, b) => a.date - b.date);

        for (const expr of after) {
            const sentences = this.sentences.filter((s) => s.expression === expr.expression);

            for (const sentence of sentences) {
                res.push({
                    title: expr.expression,
                    expression: sentence.sentence.replace(
                        expr.expression,
                        `==${expr.expression}==`
                    ),
                    meaning: sentence.trans,
                    status: expr.status,
                    t: WordType.PHRASE,
                    notes: [],
                    sentences: [],
                    tags: this.tags.filter((t) => t.expression === expr.expression).map((t) => t.tag),
                });
            }

            res.push({
                title: expr.expression,
                expression: expr.expression,
                meaning: expr.meaning,
                status: expr.status,
                t: expr.t,
                notes: this.notes.filter((n) => n.expression === expr.expression).map((n) => n.note),
                sentences: sentences as Sentence[],
                tags: this.tags.filter((t) => t.expression === expr.expression).map((t) => t.tag),
            });
        }

        return res;
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

        // 排序
        if (sort && Object.keys(sort).length > 0) {
            const sortField = Object.keys(sort)[0];
            const dir = sort[sortField] === "asc" ? 1 : -1;
            const base = CsvStorageDrive.SORTERS[sortField];
            if (base) {
                rows = [...rows].sort((a, b) => dir * base(a, b));
            }
        } else {
            rows = [...rows].sort((a, b) => Number(b.date) - Number(a.date));
        }

        // 分页
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

    async postExpression(payload: ExpressionInfo): Promise<number> {
        const date = moment().unix();

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
            } else {
                const row: CsvSentence = {
                    _id: this.nextId("sentences"),
                    expression: payload.expression,
                    sentence: sen.sentence,
                    trans: sen.trans || "",
                    origin: sen.origin || "",
                    date,
                };
                this.sentences.push(row);
                keptIds.add(row._id);
            }
        }
        if (keptIds.size > 0 || payload.sentences.length === 0) {
            this.sentences = this.sentences.filter(
                (s) => s.expression !== payload.expression || keptIds.has(s._id)
            );
        }

        // 标签/笔记/关联：幂等追加
        for (const tag of payload.tags) {
            if (!this.tags.some((t) => t.expression === payload.expression && t.tag === tag)) {
                this.tags.push({
                    _id: this.nextId("tags"),
                    expression: payload.expression,
                    tag,
                    date,
                });
            }
        }
        for (const note of payload.notes) {
            if (!this.notes.some((n) => n.expression === payload.expression && n.note === note)) {
                this.notes.push({
                    _id: this.nextId("notes"),
                    expression: payload.expression,
                    note,
                    date,
                });
            }
        }
        for (const conn of payload.connections) {
            if (
                !this.connections.some(
                    (c) => c.expression === payload.expression && c.connection === conn
                )
            ) {
                this.connections.push({
                    _id: this.nextId("connections"),
                    expression: payload.expression,
                    connection: conn,
                    date,
                });
            }
        }

        // 表达式 upsert（expression 唯一）
        const existing = this.expressions.find((e) => e.expression === payload.expression);
        if (existing) {
            existing.meaning = payload.meaning;
            existing.status = payload.status;
            existing.t = payload.t;
            existing.date = date;
        } else {
            this.expressions.push({
                _id: this.nextId("expressions"),
                expression: payload.expression,
                meaning: payload.meaning,
                status: payload.status,
                t: payload.t,
                date,
            });
        }

        this.markDirty("expressions", "sentences", "tags", "notes", "connections");
        return 200;
    }

    async removeExpression(expression: string): Promise<boolean> {
        const before = this.expressions.length;
        this.expressions = this.expressions.filter(
            (e) => e.expression !== expression
        );
        const removed = this.expressions.length < before;

        this.sentences = this.sentences.filter((s) => s.expression !== expression);
        this.tags = this.tags.filter((t) => t.expression !== expression);
        this.notes = this.notes.filter((n) => n.expression !== expression);
        this.connections = this.connections.filter((c) => c.expression !== expression);

        if (removed) {
            this.markDirty("expressions", "sentences", "tags", "notes", "connections");
        }
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
            } else {
                this.expressions.push({
                    _id: this.nextId("expressions"),
                    expression,
                    meaning: "",
                    status: 0,
                    t: WordType.WORD,
                    date: moment().unix(),
                });
            }
        }
        this.markDirty("expressions");
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

    // ---- 销毁 / 导入导出 ----

    async destroyAll(): Promise<void> {
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
        this.dirty = new Set([
            "expressions",
            "sentences",
            "tags",
            "notes",
            "connections",
        ]);
        this.pendingPersist = true;
        this.flushPersist();
    }

    async importDB(file: File, format: "json" | "csv" | "sqlite3"): Promise<void> {
        if (format === "sqlite3") {
            throw new Error(
                "Importing SQLite3 database to CSV storage is not supported. Please use JSON or CSV format."
            );
        }

        const text = await file.text();

        if (format === "json") {
            const data = JSON.parse(text);
            const items = Array.isArray(data) ? data : data.data;
            if (!Array.isArray(items)) {
                throw new Error("Invalid JSON format");
            }
            for (const item of items) {
                if (!item?.expression) continue;
                await this.postExpression({
                    expression: String(item.expression).trim(),
                    meaning: String(item.meaning ?? ""),
                    status: Number(item.status ?? 0),
                    t: String(item.t ?? "WORD").toUpperCase(),
                    tags: Array.isArray(item.tags) ? item.tags : [],
                    notes: Array.isArray(item.notes) ? item.notes : [],
                    sentences: Array.isArray(item.sentences) ? item.sentences : [],
                    connections: Array.isArray(item.connections) ? item.connections : [],
                    date: item.date ?? moment().unix(),
                });
            }
            return;
        }

        // csv: Expression,Meaning,Status,Type,Tags,Date
        const lines = text.split(/\r?\n/);
        let start = 0;
        if (lines.length > 0 && lines[0].toLowerCase().includes("expression")) {
            start = 1;
        }
        for (let i = start; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = parseCsvLine(line);
            if (!values[0]) continue;
            await this.postExpression({
                expression: values[0].trim(),
                meaning: values[1]?.trim() || "",
                status: parseInt(values[2]) || 0,
                t: values[3]?.trim().toUpperCase() || "WORD",
                tags: values[4]
                    ? values[4].split(",").map((t: string) => t.trim()).filter(Boolean)
                    : [],
                notes: [],
                sentences: [],
                connections: [],
                date: values[5] ? moment(values[5]).unix() : moment().unix(),
            });
        }
    }

    async exportDB(): Promise<void> {
        try {
            const csv = stringifyCsvTable(
                this.expressions.map((e) => ({
                    Expression: e.expression,
                    Meaning: e.meaning,
                    Status: e.status,
                    Type: e.t,
                    Tags: this.tags
                        .filter((t) => t.expression === e.expression)
                        .map((t) => t.tag)
                        .join(","),
                    Date: moment.unix(e.date).format("YYYY-MM-DD HH:mm:ss"),
                })),
                ["Expression", "Meaning", "Status", "Type", "Tags", "Date"]
            );
            const blob = new Blob([csv], { type: "text/csv" });
            download(blob, `${this.storageName}.csv`, "text/csv");
        } catch (e) {
            console.error("[CsvStorage] export failed", e);
        }
    }
}
