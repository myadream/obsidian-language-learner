import { moment } from "obsidian";
import download from "downloadjs";

import Plugin from "@/plugin";
import StorageDrive from "@/storage/drive";
import { ExpressionInfo } from "@/storage/interface";
import { toUnixSeconds } from "@/storage/utils";
import { parseCsvLine, stringifyCsvTable } from "@/storage/drive/csv/csv";
import {
    extractAllDataFromDatabase,
    loadSqlJs,
} from "@/storage/drive/sqlite3/uitils";

/**
 * 外层统一的数据库导入/导出：
 * - 各存储驱动只实现 exportData()/importData() 纯数据接口（统一的 ExpressionInfo 列表）；
 * - 具体文件格式（JSON/CSV/SQLite3）的解析与序列化只发生在本模块，
 *   因此任何驱动都可以用任意格式导入导出，互相迁移不再受驱动差异限制。
 *
 * 统一格式约定：
 * - JSON：{ version, exported_at, data: ExpressionInfo[] }（date 为 UNIX 秒）；
 *   导入时兼容旧格式：裸数组、{ data: [...] }、IndexedDB 旧版导出的 Dexie dump。
 * - CSV：Expression,Meaning,Status,Type,Tags,Date（仅词条级数据，不含笔记/例句/关联），
 *   与历史导出格式一致；Date 兼容 UNIX 秒与文本日期。
 * - SQLite3：本插件 schema 的 .sqlite 文件（含 sqlite 驱动在 vault 里的持久化文件），
 *   只作导入源，导出统一走 JSON/CSV。
 */
export type TransferFormat = "json" | "csv" | "sqlite3";

export interface ExportPayload {
    version: number;
    exported_at: number;
    data: ExpressionInfo[];
}

// ---- 解析：文件 → 数据 ----

export async function parseImportFile(
    plugin: Plugin,
    file: File,
    format: TransferFormat
): Promise<ExpressionInfo[]> {
    if (format === "json") {
        return parseJsonItems(await file.text());
    }
    if (format === "csv") {
        return parseCsvItems(await file.text());
    }
    return parseSqliteItems(plugin, file);
}

/** JSON：统一格式 / 裸数组 / {data:[...]} / Dexie dump */
export function parseJsonItems(text: string): ExpressionInfo[] {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
        return normalizeItems(parsed);
    }
    if (parsed && typeof parsed === "object") {
        // IndexedDB 驱动旧版导出的 dexie-export-import 格式
        if (Array.isArray(parsed.data?.tables)) {
            return parseDexieDump(parsed);
        }
        if (Array.isArray(parsed.data)) {
            return normalizeItems(parsed.data);
        }
    }
    throw new Error("Invalid JSON format");
}

function normalizeItems(items: any[]): ExpressionInfo[] {
    return items
        .map(normalizeItem)
        .filter((item): item is ExpressionInfo => item !== null);
}

function normalizeItem(item: any): ExpressionInfo | null {
    if (!item || typeof item !== "object") {
        return null;
    }
    // 兼容旧 sqlite 导入器接受的大写字段名（Expression/Meaning/...）
    const expression = item.expression ?? item.Expression;
    if (!expression || typeof expression !== "string") {
        return null;
    }
    return {
        expression: expression.trim(),
        meaning: String(item.meaning ?? item.Meaning ?? ""),
        status: Number.parseInt(String(item.status ?? item.Status ?? 0)) || 0,
        t: String(item.t ?? item.Type ?? "WORD").toUpperCase() || "WORD",
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        notes: Array.isArray(item.notes) ? item.notes.map(String) : [],
        sentences: Array.isArray(item.sentences)
            ? item.sentences
                  .filter((s: any) => s && typeof s === "object" && s.sentence)
                  .map((s: any) => ({
                      expression: String(s.expression ?? expression),
                      sentence: String(s.sentence),
                      trans: String(s.trans ?? ""),
                      origin: String(s.origin ?? ""),
                      date: s.date !== undefined ? toUnixSeconds(s.date) : undefined,
                  }))
            : [],
        connections: Array.isArray(item.connections) ? item.connections.map(String) : [],
        date: item.date !== undefined ? toUnixSeconds(item.date) : moment().unix(),
    };
}

/** Dexie dump：expressions 表内嵌 tags/notes/connections，sentences 另表按 _id 引用 */
function parseDexieDump(parsed: any): ExpressionInfo[] {
    const tables = parsed.data.tables;

    const sentenceById = new Map<any, any>();
    for (const table of tables) {
        if (table?.name === "sentences" && Array.isArray(table.rows)) {
            for (const row of table.rows) {
                sentenceById.set(row._id, row);
            }
        }
    }

    const items: ExpressionInfo[] = [];
    for (const table of tables) {
        if (table?.name !== "expressions" || !Array.isArray(table.rows)) {
            continue;
        }
        for (const row of table.rows) {
            if (!row || typeof row.expression !== "string" || !row.expression) {
                continue;
            }
            const sentences = ((row.sentences ?? []) as any[])
                .map((id) => sentenceById.get(id))
                .filter(Boolean)
                .map((s) => ({
                    expression: row.expression,
                    sentence: String(s.sentence ?? ""),
                    trans: String(s.trans ?? ""),
                    origin: String(s.origin ?? ""),
                    date: s.date !== undefined ? toUnixSeconds(s.date) : undefined,
                }));
            items.push({
                expression: row.expression.trim(),
                meaning: String(row.meaning ?? ""),
                status: Number(row.status ?? 0) || 0,
                t: String(row.t ?? "WORD").toUpperCase() || "WORD",
                tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
                notes: Array.isArray(row.notes) ? row.notes.map(String) : [],
                sentences,
                connections: Array.isArray(row.connections) ? row.connections.map(String) : [],
                date: row.date !== undefined ? toUnixSeconds(row.date) : moment().unix(),
            });
        }
    }
    return items;
}

/** CSV：表头 Expression,Meaning,Status,Type,Tags,Date；兼容无表头的旧文件 */
export function parseCsvItems(text: string): ExpressionInfo[] {
    // 去掉 BOM（Windows 编辑器保存的 CSV 常带）
    const clean = text.replace(/^\uFEFF/, "");
    const lines = clean.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        return [];
    }

    const hasHeader = lines[0].toLowerCase().includes("expression");
    const items: ExpressionInfo[] = [];
    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const item = normalizeItem({
            expression: values[0],
            meaning: values[1],
            status: values[2],
            t: values[3],
            tags: (values[4] ?? "")
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            date: values[5],
        });
        if (item) {
            items.push(item);
        }
    }
    return items;
}

/** SQLite3：读本插件 schema 的 .sqlite 文件 */
export async function parseSqliteItems(plugin: Plugin, file: File): Promise<ExpressionInfo[]> {
    const sqlJs = await loadSqlJs(plugin);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const db = new sqlJs.Database(bytes);
    try {
        return extractAllDataFromDatabase(db);
    } finally {
        db.close();
    }
}

// ---- 序列化：数据 → 文件 ----

export function stringifyExportJson(items: ExpressionInfo[]): string {
    const payload: ExportPayload = {
        version: 1,
        exported_at: moment().unix(),
        data: items,
    };
    return JSON.stringify(payload, null, 2);
}

export function stringifyExportCsv(items: ExpressionInfo[]): string {
    const rows = items.map((item) => ({
        Expression: item.expression,
        Meaning: item.meaning,
        Status: item.status,
        Type: item.t,
        Tags: (item.tags ?? []).join(","),
        Date: moment.unix(toUnixSeconds(item.date)).format("YYYY-MM-DD HH:mm:ss"),
    }));
    return stringifyCsvTable(rows, ["Expression", "Meaning", "Status", "Type", "Tags", "Date"]);
}

// ---- 编排：驱动 ↔ 文件 ----

export async function exportToFile(
    plugin: Plugin,
    drive: StorageDrive,
    format: "json" | "csv"
): Promise<void> {
    const items = await drive.exportData();
    const name = plugin.settings.storage.storage_name;

    if (format === "csv") {
        download(
            new Blob([stringifyExportCsv(items)], { type: "text/csv" }),
            `${name}.csv`,
            "text/csv"
        );
    } else {
        download(
            new Blob([stringifyExportJson(items)], { type: "application/json" }),
            `${name}.json`,
            "application/json"
        );
    }
}

export async function importFromFile(
    plugin: Plugin,
    drive: StorageDrive,
    file: File,
    format: TransferFormat
): Promise<void> {
    const items = await parseImportFile(plugin, file, format);
    await drive.importData(items);
}
