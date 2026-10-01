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
import { Database, SqlJsStatic } from "sql.js";
import {  moment, normalizePath, Platform } from "obsidian";
import {
    ConnectionsTable,
    ExpressionsTable,
    NotesTable,
    SentencesTable,
    Tables,
    TagsTable,
} from "@/storage/drive/types";
import {
    connectionsTableTransform,
    expressionsTableTransform,
    extractAllDataFromDatabase,
    loadSqlJs,
    mapSqlResultToTypedArray,
    mapSqlResultToTypedObject,
    notesTableTransform,
    sentencesTableTransform,
    tagsTableTransform,
} from "@/storage/drive/sqlite3/uitils";
import { toUnixSeconds } from "@/storage/utils";
import { createAutomaton } from "ac-auto";
import { ReviewScheduleRecord, WordSchedule } from "@/review/types";

/** SQL 行 → WordSchedule：NULL 列 → undefined */
function rowToSchedule(r: Record<string, any>): WordSchedule {
    const num = (v: any): number | undefined =>
        v === null || v === undefined ? undefined : Number(v);
    return {
        algorithm: r.algorithm as WordSchedule["algorithm"],
        due: Number(r.due),
        interval: Number(r.interval),
        ease: num(r.ease),
        stability: num(r.stability),
        difficulty: num(r.difficulty),
        state: num(r.state),
        reps: num(r.reps),
        lapses: num(r.lapses),
        learningSteps: num(r.learning_steps),
        lastReview: num(r.last_review),
    };
}

export class Sqlite3StorageDrive extends StorageDrive {
    plugin: Plugin;

    storageName: string;
    storagePath: string;
    storageDir: string;

    sqlJs: SqlJsStatic = null;
    storageDrive: Database = null;

    /** 延迟持久化定时器：合并短时间内的多次写入，close 时强制落盘 */
    private persistTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingPersist = false;

    constructor(plugin: Plugin) {
        super();
        this.plugin = plugin;
        this.storageName = plugin.settings.storage.storage_name;
        // 设置页写入的是 storage_path；storage_dir 为历史遗留字段，做兜底
        const driveConf = plugin.settings.storage.drive["sqlite3"] || {};
        this.storageDir = driveConf.storage_path || driveConf.storage_dir || "storage";

        console.log("SQLite3 存储驱动初始化:");
        console.log("- storageDir:", this.storageDir);
        console.log("- storageName:", this.storageName);
        console.log("- platform:", Platform.isMobileApp ? "mobile" : "desktop");
    }

    async init() {
        const isMobile = Platform.isMobileApp;
        const dir = normalizePath(this.storageDir);

        console.log(
            `[${isMobile ? "Mobile" : "Desktop"}] 初始化 SQLite3 存储驱动`
        );

        const adapter = this.plugin.app.vault.adapter;


        try {
            // 创建存储目录路径
            if (!(await adapter.exists(dir))) {
                await adapter.mkdir(dir);
                console.log("创建存储目录：", dir);
            }
        } catch (mkdirError) {
            console.warn("创建目录失败：", mkdirError);
        }

        this.storagePath = normalizePath(
            dir + "/" + this.storageName + ".sqlite"
        );
        console.log(
            `[${isMobile ? "Mobile" : "Desktop"}] 数据库路径：`,
            this.storagePath
        );

        try {
            this.sqlJs = await loadSqlJs(this.plugin);
            console.log(
                `[${isMobile ? "Mobile" : "Desktop"}] SQL.js 初始化成功`
            );
        } catch (initError) {
            console.error("SQL.js 初始化失败：", initError);
            throw initError;
        }

        await this.initDatabase(adapter);

        // 创建初始数据表结构
        if (this.storageDrive) {
            this.createDbTables();
        }
    }

    async initDatabase(adapter: any) {
        try {
            // 检查本地数据库文件是否存在
            if (await adapter.exists(this.storagePath)) {
                console.log("找到现有数据库文件，正在加载...");

                // 读取本地数据库文件的二进制数据
                let dbData: ArrayBuffer;
                if (typeof adapter.readBinary === "function") {
                    dbData = await adapter.readBinary(this.storagePath);
                } else {
                    console.error(
                        "adapter.readBinary 方法不可用，无法加载数据库文件"
                    );
                    throw new Error(
                        "readBinary method not available on adapter"
                    );
                }

                // 加载已有数据库
                this.storageDrive = new this.sqlJs.Database(
                    new Uint8Array(dbData)
                );
     
            } else {
                // 本地文件不存在，创建新的数据库（初始为内存数据库，后续需导出到文件）
                console.log("未找到数据库文件，创建新数据库...");
                this.storageDrive = new this.sqlJs.Database();
            }
        } catch (error) {
            console.error(
                `初始化数据库失败 [${
                    Platform.isMobileApp ? "Mobile" : "Desktop"
                }]：`,
                error
            );
            console.error("错误详情：", {
                storagePath: this.storagePath,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });
            // 异常时创建新数据库兜底
            this.storageDrive = new this.sqlJs.Database();
            console.warn("已创建内存数据库作为降级方案");
        }
    }

    createDbTables() {
        if (!this.storageDrive) return;

        this.storageDrive.run(`
            CREATE TABLE IF NOT EXISTS  expressions (
                 _id INTEGER  PRIMARY KEY AUTOINCREMENT,
                 expression text not null,
                 meaning text default '',
                 status INTEGER default 0,
                 t text default '',
                 date DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE UNIQUE INDEX IF NOT EXISTS  "expression_index" ON "expressions" ( "expression" ASC);

            CREATE INDEX IF NOT EXISTS "status_index" ON "expressions" ( "status");

            CREATE INDEX IF NOT EXISTS "t_index" ON "expressions" ( "t");
        `);

        this.storageDrive.run(`
            CREATE TABLE IF NOT EXISTS tags (
                _id INTEGER  PRIMARY KEY AUTOINCREMENT,
                expression text not null,
                tag text,
                date DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS  "tag_expression_index" ON "tags" ("expression" );
        `);

        this.storageDrive.run(`
            CREATE TABLE IF NOT EXISTS notes (
                 _id INTEGER  PRIMARY KEY AUTOINCREMENT,
                 expression text not null,
                 note text,
                 date DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS "note_expression_index" ON "notes" ("expression" );
        `);

        this.storageDrive.run(`
            CREATE TABLE IF NOT EXISTS sentences (
                 _id INTEGER  PRIMARY KEY AUTOINCREMENT,
                 expression text not null,
                 sentence text,
                 trans text default '',
                 origin  text default '',
                 date DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS "sentence_expression_index" ON "sentences" ("expression" );
        `);

        this.storageDrive.run(`
            CREATE TABLE IF NOT EXISTS connections (
               _id INTEGER  PRIMARY KEY AUTOINCREMENT,
               expression text not null,
               connection text,
               date DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS "connection_expression_index" ON "connections" ("expression" );

            CREATE TABLE IF NOT EXISTS schedules (
                expression TEXT PRIMARY KEY,
                algorithm TEXT NOT NULL,
                due INTEGER NOT NULL,
                interval REAL NOT NULL,
                ease REAL,
                stability REAL,
                difficulty REAL,
                state INTEGER,
                reps INTEGER,
                lapses INTEGER,
                learning_steps INTEGER,
                last_review INTEGER
            );
        `);

        this.migrateDateColumns();

        this.exportDbToFile();
    }

    /**
     * 历史版本把 date 存为 'YYYY-MM-DD HH:mm:ss' 文本，而所有时间比较都用 UNIX 秒，
     * SQLite 类型序中 TEXT 恒大于 INTEGER，导致统计/复习查询结果恒为空。
     * 此处一次性把 TEXT 日期迁移为 UNIX 秒（幂等：仅当存在文本日期时执行）。
     */
    private migrateDateColumns(): void {
        const tables = [
            Tables.EXPRESSION,
            Tables.SENTENCE,
            Tables.TAGS,
            Tables.NOTES,
            Tables.CONNECTIONS,
        ];
        for (const table of tables) {
            const check = this.storageDrive.exec(
                `SELECT COUNT(_id) FROM ${table} WHERE typeof(date) = 'text'`
            );
            const textCount =
                check.length > 0 ? Number(check[0].values[0][0] || 0) : 0;
            if (textCount > 0) {
                this.storageDrive.exec(
                    `UPDATE ${table} SET date = CAST(strftime('%s', date) AS INTEGER) WHERE typeof(date) = 'text'`
                );
                console.log(`[SQLite] migrated ${textCount} text dates in ${table}`);
            }
        }
    }

    async open(): Promise<void> {
        if (this.storageDrive) {
            this.storageDrive?.close();
            this.storageDrive = null;
        }

        if (this.sqlJs) {
            this.sqlJs = null;
        }

        await this.init();
    }

    async close(): Promise<void> {
        // 先等延迟写入落盘，再关内存数据库，避免 close 后重开读到旧文件
        await this.flushPersist();
        this.storageDrive?.close();
        this.sqlJs = null;
    }

    /** 合并短时间内的频繁写入后统一落盘（默认 1.5s 去抖） */
    private schedulePersist(delayMs = 1500): void {
        this.pendingPersist = true;
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            this.pendingPersist = false;
            this.exportDbToFile();
        }, delayMs);
    }

    /** 立即落盘（仅当存在未刷新的延迟写入），返回写完的 Promise 供 close 等待 */
    private flushPersist(): Promise<void> {
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        if (!this.pendingPersist) {
            return Promise.resolve();
        }
        this.pendingPersist = false;
        return this.exportDbToFile();
    }

    async exportDbToFile() {
        if (!this.storageDrive) return;

        try {
            const adapter = this.plugin.app.vault.adapter;
            const isMobile = Platform.isMobileApp;

            console.log(
                `[${isMobile ? "Mobile" : "Desktop"}] 开始导出数据库到文件：`,
                this.storagePath
            );

            // 1. 将数据库导出为二进制数组
            const dbData = this.storageDrive.export();

            // 2. 确保目录存在
            const dir = this.storagePath.substring(
                0,
                this.storagePath.lastIndexOf("/")
            );
            try {
                if (!(await adapter.exists(dir))) {
                    await adapter.mkdir(dir);
                    console.log("创建存储目录：", dir);
                }
            } catch (mkdirError) {
                console.warn("创建目录失败，可能目录已存在：", mkdirError);
            }

            // 3. 将 Uint8Array 转换为 ArrayBuffer
            // 使用 slice 方法创建一个新的 ArrayBuffer，避免 SharedArrayBuffer 问题
            const arrayBuffer = new ArrayBuffer(dbData.byteLength);
            const view = new Uint8Array(arrayBuffer);
            view.set(dbData);

            // 4. 写入文件
            // 在移动端和桌面端都使用标准的 writeBinary 方法
            // Obsidian 的 adapter 在移动端会自动处理文件系统差异
            if (typeof (adapter as any).writeBinary === "function") {
                await (adapter as any).writeBinary(
                    this.storagePath,
                    arrayBuffer
                );
            } else {
                // 如果 writeBinary 不可用，抛出错误
                // 因为 write 方法只接受 string 或 ArrayBuffer，不能直接使用 Uint8Array
                throw new Error(
                    "adapter.writeBinary method not available. Cannot write binary data to file."
                );
            }

            console.log(
                `[${
                    isMobile ? "Mobile" : "Desktop"
                }] 数据库已成功持久化到文件：`,
                this.storagePath
            );
        } catch (error) {
            console.error(
                `数据库持久化导出失败 [${
                    Platform.isMobileApp ? "Mobile" : "Desktop"
                }]：`,
                error
            );
            console.error("错误详情：", {
                storagePath: this.storagePath,
                platform: Platform.isMobileApp ? "mobile" : "desktop",
                errorMessage:
                    error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            });

            // 移动端可能需要特殊处理
            if (Platform.isMobileApp) {
                console.warn("移动端文件系统可能受限，数据库仅在内存中运行");
                // 可以考虑添加用户提示
            }
        }
    }

    async countSeven(): Promise<WordCount[]> {
        if (!this.storageDrive) return Promise.resolve([]);

        const spans = [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const start = moment().subtract(6, "days").startOf("day");
            const from = start.add(i, "days");
            return {
                from: from.unix(),
                to: from.endOf("day").unix(),
            };
        });

        const counts: WordCount[] = [];

        // 对每一天计算
        for (const span of spans) {
            // 当日
            const today = [0, 0, 0, 0, 0];

            const todayResult = this.storageDrive.exec(
                "select * from " +
                    Tables.EXPRESSION +
                    " INDEXED BY t_index where t = ? and date >= ? and date <= ? order by date desc",
                [WordType.WORD, span.from, span.to]
            );
            if (todayResult.length > 0) {
                const expression = mapSqlResultToTypedArray<ExpressionsTable>(
                    todayResult[0],
                    expressionsTableTransform
                );
                expression.forEach((expr) => {
                    if (expr.status >= 0 && expr.status <= 4) {
                        today[expr.status]++;
                    }
                });
            }

            // 累计
            const accumulated = [0, 0, 0, 0, 0];
            const accumulatedResult = this.storageDrive.exec(
                "select * from " +
                    Tables.EXPRESSION +
                    " INDEXED BY t_index where t = ? and date <= ? order by date desc",
                [WordType.WORD, span.to]
            );
            if (accumulatedResult.length > 0) {
                const expression = mapSqlResultToTypedArray<ExpressionsTable>(
                    accumulatedResult[0],
                    expressionsTableTransform
                );
                expression.forEach((expr) => {
                    if (expr.status >= 0 && expr.status <= 4) {
                        accumulated[expr.status]++;
                    }
                });
            }

            counts.push({ today, accumulated });
        }

        return counts;
    }

    destroyAll(): Promise<void> {
        this.storageDrive.run(`
            DROP TABLE IF EXISTS "expressions";
            DROP TABLE IF EXISTS "tags";
            DROP TABLE IF EXISTS "notes";
            DROP TABLE IF EXISTS "sentences";
            DROP TABLE IF EXISTS "connections";
            DROP TABLE IF EXISTS "schedules";
        `);

        // 重建空表并落盘，保证销毁后驱动仍可直接使用
        this.createDbTables();
        return Promise.resolve();
    }

    async getAllExpressionSimple(
        ignores?: boolean,
        sort?: SortParams,
        search?: { [key: string]: any },
        paginate?: Paginate
    ): Promise<PaginateResult<ExpressionInfoSimple[]>> {
        const bottomStatus = ignores ? -1 : 0;
        const pageSize = paginate?.pageSize || 100;
        const page = paginate?.page || 0; // 接收 0-based 页码

        // 构建 WHERE 子句（ignores=false 时排除 status=0 的已忽略词）
        const whereConditions: string[] = ["status > ?"];
        const whereParams: any[] = [bottomStatus];

        // 处理搜索条件（模糊搜索）
        if (search && Object.keys(search).length > 0) {
            for (const [key, value] of Object.entries(search)) {
                if (value !== undefined && value !== null && value !== "") {
                    // 支持 expression 和 meaning 字段的模糊搜索
                    if (key === "expression" || key === "meaning") {
                        whereConditions.push(`${key} LIKE ?`);
                        whereParams.push(`%${value}%`);
                    }
                    // 精确匹配字段（status, t 等）
                    else if (key === "status") {
                        whereConditions.push(`${key} = ?`);
                        whereParams.push(value);
                    } else if (key === "t") {
                        whereConditions.push(`${key} = ?`);
                        whereParams.push(value);
                    }
                    // 支持标签搜索（数组：包含任意一个标签即可）
                    else if (key === "tags" && Array.isArray(value) && value.length > 0) {
                        const tagConditions = value.map(() => "EXISTS (SELECT 1 FROM " + Tables.TAGS + " WHERE " + Tables.TAGS + ".expression = " + Tables.EXPRESSION + ".expression AND tag = ?)");
                        whereConditions.push(`(${tagConditions.join(" OR ")})`);
                        whereParams.push(...value);
                    }
                }
            }
        }

        const whereClause = whereConditions.join(" AND ");

        // 构建 ORDER BY 子句
        let orderClause = "date desc"; // 默认排序
        if (sort && Object.keys(sort).length > 0) {
            const orderParts: string[] = [];
            for (const [key, value] of Object.entries(sort)) {
                // 支持的字段：expression, meaning, status, date
                if (["expression", "meaning", "status", "date"].includes(key)) {
                    const orderDirection =
                        value === "asc" || value === "ASC" ? "ASC" : "DESC";
                    orderParts.push(`${key} ${orderDirection}`);
                }
            }
            if (orderParts.length > 0) {
                orderClause = orderParts.join(", ");
            }
        }

        // 查询总数
        const totalSql = `SELECT COUNT(_id) as count FROM ${Tables.EXPRESSION} WHERE ${whereClause}`;
        const totalResult = this.storageDrive.exec(totalSql, whereParams);

        if (totalResult.length <= 0) {
            return {
                data: [],
                total: 0,
                page: 1,
                pageSize: 0,
            };
        }

        // 查询数据
        const dataSql = `SELECT * FROM ${Tables.EXPRESSION} WHERE ${whereClause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`;
        const exprsResult = this.storageDrive.exec(dataSql, [
            ...whereParams,
            pageSize,
            page * pageSize,
        ]);

        if (exprsResult.length <= 0) {
            return {
                data: [],
                total: Number(totalResult[0].values[0][0] || 0),
                page: page + 1,
                pageSize,
            };
        }

        const exprs = mapSqlResultToTypedArray<ExpressionsTable>(
            exprsResult[0],
            expressionsTableTransform
        );

        // 批量查询所有 expression 的 tags（空页时跳过，避免 IN () 语法错误）
        const expressionsList = exprs.map((e) => e.expression);
        const tagsMap = new Map<string, string[]>();
        if (expressionsList.length > 0) {
            const allTagsResult = this.storageDrive.exec(
                "select * from " +
                    Tables.TAGS +
                    " INDEXED BY tag_expression_index where expression in (" +
                    expressionsList.map(() => "?").join(",") +
                    ")",
                expressionsList
            );

            if (allTagsResult.length > 0) {
                const tags = mapSqlResultToTypedArray<TagsTable>(
                    allTagsResult[0],
                    tagsTableTransform
                );
                tags.forEach((tag) => {
                    if (!tagsMap.has(tag.expression)) {
                        tagsMap.set(tag.expression, []);
                    }
                    tagsMap.get(tag.expression).push(tag.tag);
                });
            }
        }

        // 批量查询所有 expression 的 note 数量
        const notesMap = new Map<string, number>();
        if (expressionsList.length > 0) {
            const allNotesResult = this.storageDrive.exec(
                "select expression, count(_id) as count from " +
                    Tables.NOTES +
                    " INDEXED BY note_expression_index where expression in (" +
                    expressionsList.map(() => "?").join(",") +
                    ") group by expression",
                expressionsList
            );

            // 构建 expression -> note_num 的映射
            if (
                allNotesResult.length > 0 &&
                allNotesResult[0].values.length > 0
            ) {
                allNotesResult[0].values.forEach((row: any[]) => {
                    notesMap.set(String(row[0]), Number(row[1] || 0));
                });
            }
        }

        // 批量查询所有 expression 的 sentence 数量
        const sentencesMap = new Map<string, number>();
        if (expressionsList.length > 0) {
            const allSentencesResult = this.storageDrive.exec(
                "select expression, count(_id) as count from " +
                    Tables.SENTENCE +
                    " INDEXED BY sentence_expression_index where expression in (" +
                    expressionsList.map(() => "?").join(",") +
                    ") group by expression",
                expressionsList
            );

            // 构建 expression -> sen_num 的映射
            if (
                allSentencesResult.length > 0 &&
                allSentencesResult[0].values.length > 0
            ) {
                allSentencesResult[0].values.forEach((row: any[]) => {
                    sentencesMap.set(String(row[0]), Number(row[1] || 0));
                });
            }
        }

        // 组装结果
        const data = exprs.map((expr) => {
            return {
                expression: expr.expression,
                meaning: expr.meaning,
                status: expr.status,
                t: expr.t,
                tags: tagsMap.get(expr.expression) || [],
                note_num: notesMap.get(expr.expression) || 0,
                sen_num: sentencesMap.get(expr.expression) || 0,
                date: expr.date,
            } as ExpressionInfoSimple;
        });

        return {
            data,
            total: Number(totalResult[0].values[0][0] || 0),
            pageSize,
            page: page + 1, // 返回 1-based 页码给前端
        };
    }

    async getCount(): Promise<CountInfo> {
        const counts: { WORD: number[]; PHRASE: number[] } = {
            WORD: [0, 0, 0, 0, 0],
            PHRASE: [0, 0, 0, 0, 0],
        };

        const exprsResult = this.storageDrive.exec(
            "select * from " + Tables.EXPRESSION + " INDEXED BY t_index"
        );
        if (exprsResult.length > 0) {
            const expression = mapSqlResultToTypedArray<ExpressionsTable>(
                exprsResult[0],
                expressionsTableTransform
            );
            expression.forEach((expr) => {
                const bucket = counts[expr.t as WordType];
                if (bucket && expr.status >= 0 && expr.status <= 4) {
                    bucket[expr.status]++;
                }
            });
        }

        return {
            word_count: counts.WORD,
            phrase_count: counts.PHRASE,
        };
    }

    async getExpression(keyword: string): Promise<ExpressionInfo> {
        keyword = keyword.toLowerCase();
        const exprsResult = this.storageDrive.exec(
            "select * from " +
                Tables.EXPRESSION +
                " INDEXED BY expression_index where expression = ? limit 1",
            [keyword]
        );
        if (exprsResult.length <= 0) {
            return null;
        }

        const exprs = mapSqlResultToTypedObject<ExpressionsTable>(
            exprsResult[0],
            expressionsTableTransform
        );
        const result: ExpressionInfo = {
            expression: exprs.expression,
            meaning: exprs.meaning,
            status: exprs.status,
            t: exprs.t,
            tags: [],
            notes: [],
            sentences: [] as Sentence[], // 明确指定类型
            connections: [],
            date: exprs.date,
        };

        const tagsResult = this.storageDrive.exec(
            "select * from " +
                Tables.TAGS +
                " INDEXED BY tag_expression_index where expression = ?",
            [exprs.expression]
        );
        if (tagsResult.length > 0) {
            const tags = mapSqlResultToTypedArray<TagsTable>(
                tagsResult[0],
                tagsTableTransform
            );
            result.tags = tags.map((tag) => tag.tag);
        }

        const notesResult = this.storageDrive.exec(
            "select * from " +
                Tables.NOTES +
                " INDEXED BY note_expression_index where expression = ?",
            [exprs.expression]
        );
        if (notesResult.length > 0) {
            const notes = mapSqlResultToTypedArray<NotesTable>(
                notesResult[0],
                notesTableTransform
            );
            result.notes = notes.map((note) => note.note);
        }

        const sentencesResult = this.storageDrive.exec(
            "select * from " +
                Tables.SENTENCE +
                " INDEXED BY sentence_expression_index where expression = ?",
            [exprs.expression]
        );
        if (sentencesResult.length > 0) {
            result.sentences = mapSqlResultToTypedArray<SentencesTable>(
                sentencesResult[0],
                sentencesTableTransform
            );
        }

        const connectionsResult = this.storageDrive.exec(
            "select * from " +
                Tables.CONNECTIONS +
                " INDEXED BY connection_expression_index where expression = ?",
            [exprs.expression]
        );
        if (connectionsResult.length > 0) {
            const connections = mapSqlResultToTypedArray<ConnectionsTable>(
                connectionsResult[0],
                connectionsTableTransform
            );
            result.connections = connections.map(
                (connection) => connection.connection
            );
        }

        return result;
    }

    async getExpressionsSimple(
        expressions: string[]
    ): Promise<ExpressionInfoSimple[]> {
        expressions = expressions.map((e) => e.toLowerCase());

        const expressionResult = this.storageDrive.exec(
            "select * from " +
                Tables.EXPRESSION +
                " INDEXED BY expression_index where expression in (" +
                expressions.map(() => "?").join(",") +
                ")",
            expressions
        );
        if (expressionResult.length > 0) {
            const exprs = mapSqlResultToTypedArray<ExpressionsTable>(
                expressionResult[0],
                expressionsTableTransform
            );
            return exprs.map((v) => {
                const sentencesResult = this.storageDrive.exec(
                    "select count(_id) from " +
                        Tables.SENTENCE +
                        " INDEXED BY sentence_expression_index where expression = ?",
                    [v.expression]
                );
                const sentencesCount =
                    sentencesResult.length > 0
                        ? Number(sentencesResult[0].values[0][0])
                        : 0;

                const tagsResult = this.storageDrive.exec(
                    "select tag from " +
                        Tables.TAGS +
                        " INDEXED BY tag_expression_index where expression = ?",
                    [v.expression]
                );
                const tags: string[] = [];
                if (tagsResult.length > 0) {
                    tagsResult[0].values.forEach((row: any[]) => {
                        if (row[0] !== null && row[0] !== undefined) {
                            tags.push(String(row[0]));
                        }
                    });
                }

                const notesResult = this.storageDrive.exec(
                    "select count(_id) from " +
                        Tables.NOTES +
                        " INDEXED BY note_expression_index where expression = ?",
                    [v.expression]
                );
                const notesCount =
                    notesResult.length > 0
                        ? Number(notesResult[0].values[0][0])
                        : 0;

                return {
                    expression: v.expression,
                    meaning: v.meaning,
                    status: v.status,
                    t: v.t,
                    tags,
                    sen_num: sentencesCount,
                    note_num: notesCount,
                    date: v.date,
                };
            });
        }

        return Promise.resolve([]);
    }

    async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
        const expressions = payload.words.map((e) => e.toLowerCase());

        const storedPhrases = new Map<string, number>();
        const phrasesResult = this.storageDrive.exec(
            "select * from " +
                Tables.EXPRESSION +
                " INDEXED BY t_index where t = 'PHRASE'"
        );
        if (phrasesResult.length > 0) {
            const phrases = mapSqlResultToTypedArray<ExpressionsTable>(
                phrasesResult[0],
                expressionsTableTransform
            );
            phrases.forEach((phrase) => {
                storedPhrases.set(phrase.expression, phrase.status);
            });
        }

        const storedWords: Word[] = [];
        if (expressions.length > 0) {
            const expressionResult = this.storageDrive.exec(
                "select * from " +
                    Tables.EXPRESSION +
                    " INDEXED BY t_index where t = 'WORD' and  expression in (" +
                    expressions.map(() => "?").join(",") +
                    ")",
                expressions
            );
            if (expressionResult.length > 0) {
                const matched = mapSqlResultToTypedArray<ExpressionsTable>(
                    expressionResult[0],
                    expressionsTableTransform
                );
                matched.forEach((expr) => {
                    storedWords.push({
                        text: expr.expression,
                        status: expr.status,
                    });
                });
            }
        }

        const ac = await createAutomaton([...storedPhrases.keys()]);
        const searchedPhrases = (await ac.search(payload.article)).map(
            (match) => {
                return {
                    text: match[1],
                    status: storedPhrases.get(match[1]),
                    offset: match[0],
                } as Phrase;
            }
        );

        return { words: storedWords, phrases: searchedPhrases };
    }

    async getTags(): Promise<string[]> {
        const tagsResult = this.storageDrive.exec(
            "select * from " + Tables.TAGS + " group by tag",
            []
        );
        if (tagsResult.length > 0) {
            return mapSqlResultToTypedArray<TagsTable>(
                tagsResult[0],
                tagsTableTransform
            ).map((tag) => {
                return tag.tag;
            });
        }

        return [];
    }

    async importData(items: ExpressionInfo[]): Promise<void> {
        try {
            // Begin transaction
            this.storageDrive.run('BEGIN TRANSACTION');

            for (const item of items) {
                if (!item?.expression) continue;
                // 保留数据自带的原始时间（外层 transfer 已归一化为 UNIX 秒）
                await this.postExpression(item, toUnixSeconds(item.date));
            }

            // Commit transaction
            this.storageDrive.run('COMMIT');
        } catch (error) {
            // Rollback on error
            this.storageDrive.run('ROLLBACK');
            throw error;
        }

        this.schedulePersist();
    }

    /** 全量导出为统一数据结构（词条 + 关联的标签/笔记/例句/关联词） */
    async exportData(): Promise<ExpressionInfo[]> {
        if (!this.storageDrive) {
            return [];
        }
        return extractAllDataFromDatabase(this.storageDrive);
    }

    postExpression(payload: ExpressionInfo, date = moment().unix()): Promise<number> {
        // 与 IndexedDB 驱动保持一致，date 统一存 UNIX 秒

        // 记录本单词最终保留的句子 id，用于清理不再引用的旧句子
        const keptSentenceIds = new Set<number>();

        for (const sen of payload.sentences) {
            const senExistsResult = this.storageDrive.exec(
                "select _id from " +
                    Tables.SENTENCE +
                    " INDEXED BY sentence_expression_index where expression = ? and sentence = ? limit 1",
                [payload.expression, sen.sentence]
            );
            const senId =
                senExistsResult.length > 0
                    ? Number(senExistsResult[0].values[0][0])
                    : 0;
            if (senId) {
                this.storageDrive.exec(
                    "update " +
                        Tables.SENTENCE +
                        " set sentence = ?, trans = ?, origin = ?, date = ? where _id = ?",
                    [sen.sentence, sen.trans, sen.origin, date, senId]
                );
                keptSentenceIds.add(senId);
            } else {
                this.storageDrive.exec(
                    "insert into " +
                        Tables.SENTENCE +
                        " (expression, sentence, trans, origin) values (?, ?, ?, ?)",
                    [payload.expression, sen.sentence, sen.trans, sen.origin]
                );
                const idResult = this.storageDrive.exec(
                    "select last_insert_rowid()"
                );
                if (idResult.length > 0) {
                    keptSentenceIds.add(Number(idResult[0].values[0][0]));
                }
            }
        }

        // 清理不再被引用的旧句子（与 IndexedDB 驱动行为对齐）
        if (keptSentenceIds.size > 0 || payload.sentences.length === 0) {
            const existingResult = this.storageDrive.exec(
                "select _id from " +
                    Tables.SENTENCE +
                    " INDEXED BY sentence_expression_index where expression = ?",
                [payload.expression]
            );
            if (existingResult.length > 0) {
                const staleIds = existingResult[0].values
                    .map((row: any[]) => Number(row[0]))
                    .filter((id: number) => !keptSentenceIds.has(id));
                if (staleIds.length > 0) {
                    this.storageDrive.exec(
                        "delete from " +
                            Tables.SENTENCE +
                            " where _id in (" +
                            staleIds.map(() => "?").join(",") +
                            ")",
                        staleIds
                    );
                }
            }
        }

        for (const tag of payload.tags) {
            const tagExistsResult = this.storageDrive.exec(
                "select _id from " +
                    Tables.TAGS +
                    " INDEXED BY tag_expression_index where expression = ? and tag = ? limit 1",
                [payload.expression, tag]
            );
            const tagId =
                tagExistsResult.length > 0
                    ? Number(tagExistsResult[0].values[0][0])
                    : 0;
            if (tagId) {
                this.storageDrive.exec(
                    "update " +
                        Tables.TAGS +
                        " set tag = ?, date = ? where _id = ?",
                    [tag, date, tagId]
                );
            } else {
                this.storageDrive.exec(
                    "insert into " +
                        Tables.TAGS +
                        " (expression, tag) values (?, ?)",
                    [payload.expression, tag]
                );
            }
        }

        for (const note of payload.notes) {
            const noteExistsResult = this.storageDrive.exec(
                "select _id from " +
                    Tables.NOTES +
                    " INDEXED BY note_expression_index where expression = ? and note = ? limit 1",
                [payload.expression, note]
            );
            const noteId =
                noteExistsResult.length > 0
                    ? Number(noteExistsResult[0].values[0][0])
                    : 0;
            if (noteId) {
                this.storageDrive.exec(
                    "update " +
                        Tables.NOTES +
                        " set note = ?, date = ? where _id = ?",
                    [note, date, noteId]
                );
            } else {
                this.storageDrive.exec(
                    "insert into " +
                        Tables.NOTES +
                        " (expression, note) values (?, ?)",
                    [payload.expression, note]
                );
            }
        }

        for (const conn of payload.connections) {
            const connExistsResult = this.storageDrive.exec(
                "select _id from " +
                    Tables.CONNECTIONS +
                    " INDEXED BY connection_expression_index where expression = ? and connection = ? limit 1",
                [payload.expression, conn]
            );
            const connId =
                connExistsResult.length > 0
                    ? Number(connExistsResult[0].values[0][0])
                    : 0;
            if (connId) {
                this.storageDrive.exec(
                    "update " +
                        Tables.CONNECTIONS +
                        " set connection = ?, date = ? where _id = ?",
                    [conn, date, connId]
                );
            } else {
                this.storageDrive.exec(
                    "insert into " +
                        Tables.CONNECTIONS +
                        " (expression, connection) values (?, ?)",
                    [payload.expression, conn]
                );
            }
        }

        const existsResult = this.storageDrive.exec(
            "select _id from " +
                Tables.EXPRESSION +
                " where expression = ? limit 1",
            [payload.expression]
        );
        const id =
            existsResult.length > 0 ? Number(existsResult[0].values[0][0]) : 0;
        if (id) {
            this.storageDrive.exec(
                "update " +
                    Tables.EXPRESSION +
                    " set expression = ?, meaning = ?, status = ?, t = ?, date = ? where _id = ?",
                [
                    payload.expression,
                    payload.meaning,
                    payload.status,
                    payload.t,
                    date,
                    id,
                ]
            );
        } else {
            this.storageDrive.exec(
                "insert into " +
                    Tables.EXPRESSION +
                    " (expression, meaning, status, t, date) values (?, ?, ?, ?, ?)",
                [
                    payload.expression,
                    payload.meaning,
                    payload.status,
                    payload.t,
                    date,
                ]
            );
        }

        this.schedulePersist();

        return Promise.resolve(200);
    }

    async postIgnoreWords(payload: string[]): Promise<void> {
        const dataSet = [...new Set(payload.map((word) => word.trim().toLowerCase()))]
            .filter((word) => word.length > 0);
        if (dataSet.length === 0) {
            return;
        }

        // 已存在的单词仅置 status=0 保留原数据；不存在的插入忽略记录。
        // date 必须随 INSERT 提供：excluded.date 取的是本次插入值，
        // 省略该列会让 conflict 分支拿到 CURRENT_TIMESTAMP 文本默认值，重新引入 TEXT 日期
        const now = moment().unix();
        const placeholders = dataSet.map(() => "(?, ?, ?, ?, ?)").join(",");
        const params: any[] = [];
        for (const word of dataSet) {
            params.push(word, "", 0, WordType.WORD, now);
        }

        this.storageDrive.exec(
            `insert into ${Tables.EXPRESSION} (expression, meaning, status, t, date) values ${placeholders} ` +
            `on conflict(expression) do update set status = 0, date = excluded.date`,
            params
        );

        this.schedulePersist();
    }

    // ---- 复习调度（schedules 关联表） ----

    async getSchedule(expression: string): Promise<WordSchedule | undefined> {
        const result = this.storageDrive.exec(
            "select * from " + Tables.SCHEDULE + " where expression = ?",
            [expression]
        );
        if (result.length === 0) {
            return undefined;
        }
        const row = mapSqlResultToTypedObject<Record<string, any>>(result[0]);
        return row ? rowToSchedule(row) : undefined;
    }

    async putSchedule(expression: string, schedule: WordSchedule): Promise<void> {
        this.storageDrive.exec(
            `insert into ${Tables.SCHEDULE} ` +
            `(expression, algorithm, due, interval, ease, stability, difficulty, state, reps, lapses, learning_steps, last_review) ` +
            `values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
            `on conflict(expression) do update set ` +
            `algorithm = excluded.algorithm, due = excluded.due, interval = excluded.interval, ` +
            `ease = excluded.ease, stability = excluded.stability, difficulty = excluded.difficulty, ` +
            `state = excluded.state, reps = excluded.reps, lapses = excluded.lapses, ` +
            `learning_steps = excluded.learning_steps, last_review = excluded.last_review`,
            [
                expression, schedule.algorithm, schedule.due, schedule.interval,
                schedule.ease ?? null, schedule.stability ?? null, schedule.difficulty ?? null,
                schedule.state ?? null, schedule.reps ?? null, schedule.lapses ?? null,
                schedule.learningSteps ?? null, schedule.lastReview ?? null,
            ]
        );
        this.schedulePersist();
    }

    async getAllSchedules(): Promise<ReviewScheduleRecord[]> {
        const result = this.storageDrive.exec("select * from " + Tables.SCHEDULE);
        if (result.length === 0) {
            return [];
        }
        return mapSqlResultToTypedArray<Record<string, any>>(result[0]).map((r) => ({
            expression: String(r.expression),
            schedule: rowToSchedule(r),
        }));
    }

    /** 覆盖合并（与 importData 语义对齐） */
    async importSchedules(items: ReviewScheduleRecord[]): Promise<void> {
        for (const item of items) {
            await this.putSchedule(item.expression, item.schedule);
        }
    }

    async removeExpression(expression: string): Promise<boolean> {
        const expressionResult = this.storageDrive.exec(
            "delete from " + Tables.EXPRESSION + " where expression = ?",
            [expression]
        );
        // DELETE 语句不返回行，用受影响行数判断是否真的删除了
        const deletedRows = this.storageDrive.getRowsModified();

        this.storageDrive.exec(
            "delete from " + Tables.SENTENCE + " where expression = ?",
            [expression]
        );
        this.storageDrive.exec(
            "delete from " + Tables.TAGS + " where expression = ?",
            [expression]
        );
        this.storageDrive.exec(
            "delete from " + Tables.NOTES + " where expression = ?",
            [expression]
        );
        this.storageDrive.exec(
            "delete from " + Tables.CONNECTIONS + " where expression = ?",
            [expression]
        );

        this.schedulePersist();
        return Promise.resolve(expressionResult !== null && deletedRows > 0);
    }

    async tryGetSen(text: string): Promise<Sentence> {
        const sentenceResult = this.storageDrive.exec(
            "select * from " + Tables.SENTENCE + " where sentence = ?",
            [text]
        );

        if (sentenceResult.length > 0) {
            const sentence = mapSqlResultToTypedObject<Sentence>(
                sentenceResult[0],
                sentencesTableTransform
            );
            return {
                ...sentence,
            };
        }

        return null;
    }
}
