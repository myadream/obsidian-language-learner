import {ConnectionsTable, ExpressionsTable, NotesTable, SentencesTable, Tables, TagsTable} from "@/storage/drive/types";
import { ExpressionInfo } from "@/storage/interface";
import initSqlJs, { Database, QueryExecResult, SqlJsConfig, SqlJsStatic } from "sql.js";
import { normalizePath } from "obsidian";
import Plugin from "@/plugin";

/**
 * 通用映射函数：将sql.js原始结果转换为强类型TS对象数组
 * @param sqlResult sql.js exec方法返回的单个结果（result[0]）
 * @param transform 可选：字段类型转换自定义函数（处理日期、布尔值等）
 * @returns 强类型对象数组
 */
export function mapSqlResultToTypedArray<T>(
    sqlResult: QueryExecResult,
    transform?: (item: Record<string, any>) => T
): T[] {
    const { columns, values } = sqlResult;
    if (!columns || !values || values.length === 0) {
        return [];
    }

    // 第一步：将 列名数组 + 数值二维数组 映射为 原始对象数组（key为列名，value为原始值）
    const rawObjects = values.map((valueRow) => {
        const rawObj: Record<string, any> = {};
        columns.forEach((colName, index) => {
            rawObj[colName] = valueRow[index];
        });
        return rawObj;
    });

    // 第二步：执行自定义类型转换（日期、布尔值等），返回强类型对象
    if (transform) {
        return rawObjects.map(transform);
    }

    return rawObjects as T[];
}

/**
 * 通用映射函数：将sql.js原始结果转换为单个强类型TS对象（适用于单条查询）
 * @param sqlResult sql.js exec方法返回的单个结果（result[0]）
 * @param transform 可选：字段类型转换自定义函数
 * @returns 单个强类型对象 | null
 */
export function mapSqlResultToTypedObject<T>(
    sqlResult: { columns: string[]; values: any[][] },
    transform?: (item: Record<string, any>) => T
): T | null {
    const typedArray = mapSqlResultToTypedArray(sqlResult, transform);
    return typedArray.length > 0 ? typedArray[0] : null;
}

export function expressionsTableTransform(
    rawObj: Record<string, any>,
): ExpressionsTable | null  {
    return {
        connections: [],
        date: rawObj.date,
        expression: rawObj.expression || "",
        meaning: rawObj.meaning || "",
        notes: [],
        sentences: undefined,
        status: rawObj.status,
        t: rawObj.t,
        tags: [],
        _id: rawObj._id
    }
}

export function tagsTableTransform(
    rawObj: Record<string, any>
): TagsTable | null {

    return {
        _id: rawObj?._id,
        expression: rawObj?.expression,
        tag: rawObj?.tag,
        date: rawObj?.date,
    }
}

export function notesTableTransform(
    rawObj: Record<string, any>  // 改为单个对象
): NotesTable | null {
    return {
        _id: rawObj?._id,
        expression: rawObj?.expression,
        note: rawObj?.note,
        date: rawObj?.date,
    }
}

export function sentencesTableTransform(
    rawObj: Record<string, any>  // 改为单个对象
): SentencesTable | null {
    return {
        _id: rawObj?._id,
        expression: rawObj?.expression,
        origin: rawObj?.origin,
        sentence: rawObj?.sentence,
        trans: rawObj?.trans,
        date: rawObj?.date,
    }
}

export function connectionsTableTransform(
    rawObj: Record<string, any>  // 改为单个对象
): ConnectionsTable | null {
    return {
        _id: rawObj?._id,
        expression: rawObj?.expression,
        connection: rawObj?.connection,
        date: rawObj?.date,
    }
}

/**
 * 加载 sql.js：优先读插件目录（或 node_modules，开发环境）里的 sql-wasm.wasm，
 * 找不到再回退 CDN。sqlite3 驱动初始化与外层 transfer 解析 .sqlite 文件共用。
 */
export async function loadSqlJs(plugin: Plugin): Promise<SqlJsStatic> {
    const adapter = plugin.app.vault.adapter;
    const wasmName = "sql-wasm.wasm";
    const pluginDir = normalizePath(".obsidian/plugins/" + plugin.manifest.id);

    let wasmPath = normalizePath(pluginDir + "/" + wasmName);
    // 插件目录没有时查 node_modules（开发环境）
    if (!(await adapter.exists(wasmPath))) {
        wasmPath = normalizePath("/node_modules/sql.js/dist/" + wasmName);
    }

    const config: SqlJsConfig = {};
    if (await adapter.exists(wasmPath)) {
        try {
            if (typeof (adapter as any).readBinary === "function") {
                config.wasmBinary = await (adapter as any).readBinary(wasmPath);
            } else {
                console.warn("adapter.readBinary 方法不可用，将从 CDN 加载 WASM 文件");
            }
        } catch (err) {
            console.error("Failed to read WASM file:", err);
            console.warn("将继续使用默认 WASM 加载方式（CDN）");
        }
    } else {
        console.warn("sql-wasm.wasm not found at", wasmPath);
        console.warn("将从 CDN 加载 WASM 文件");
    }

    return await initSqlJs(config);
}

/**
 * 从一个（本插件 schema 的）SQLite 数据库实例抽取全部数据，转为统一的 ExpressionInfo 列表。
 * 供 sqlite3 驱动导出与外层 transfer 解析 .sqlite 导入文件共用；只读，不修改传入的 db。
 */
export function extractAllDataFromDatabase(db: Database): ExpressionInfo[] {
    const expressions: ExpressionInfo[] = [];

    const exprsResult = db.exec("SELECT * FROM " + Tables.EXPRESSION);
    if (exprsResult.length <= 0) {
        return expressions;
    }

    const exprs = mapSqlResultToTypedArray<ExpressionsTable>(
        exprsResult[0],
        expressionsTableTransform
    );

    for (const expr of exprs) {
        const info: ExpressionInfo = {
            expression: expr.expression,
            meaning: expr.meaning,
            status: expr.status,
            t: expr.t,
            tags: [],
            notes: [],
            sentences: [],
            connections: [],
            date: expr.date,
        };

        const tagsResult = db.exec(
            "SELECT tag FROM " + Tables.TAGS + " WHERE expression = ?",
            [expr.expression]
        );
        if (tagsResult.length > 0) {
            info.tags = tagsResult[0].values.map((row: any[]) => String(row[0] ?? ""));
        }

        const notesResult = db.exec(
            "SELECT note FROM " + Tables.NOTES + " WHERE expression = ?",
            [expr.expression]
        );
        if (notesResult.length > 0) {
            info.notes = notesResult[0].values.map((row: any[]) => String(row[0] ?? ""));
        }

        const sentencesResult = db.exec(
            "SELECT sentence, trans, origin, date FROM " + Tables.SENTENCE + " WHERE expression = ?",
            [expr.expression]
        );
        if (sentencesResult.length > 0) {
            info.sentences = sentencesResult[0].values.map((row: any[]) => ({
                expression: expr.expression,
                sentence: String(row[0] ?? ""),
                trans: String(row[1] ?? ""),
                origin: String(row[2] ?? ""),
                date: row[3],
            }));
        }

        const connsResult = db.exec(
            "SELECT connection FROM " + Tables.CONNECTIONS + " WHERE expression = ?",
            [expr.expression]
        );
        if (connsResult.length > 0) {
            info.connections = connsResult[0].values.map((row: any[]) => String(row[0] ?? ""));
        }

        expressions.push(info);
    }

    return expressions;
}
