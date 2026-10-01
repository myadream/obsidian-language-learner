import Dexie from "dexie";
import Plugin from "@/plugin";
import { ExpressionsTable, SentencesTable } from "../types";
import { ReviewScheduleRecord } from "@/review/types";

export default class WordDB extends Dexie {
    expressions: Dexie.Table<ExpressionsTable, number>;
    sentences: Dexie.Table<SentencesTable, number>;
    schedules: Dexie.Table<ReviewScheduleRecord, string>;

    plugin: Plugin;
    storageName: string;

    constructor(plugin: Plugin) {
        super(plugin.settings.storage.storage_name);
        this.plugin = plugin;
        this.storageName = plugin.settings.storage.storage_name;
        // v1 为历史 schema：sentences 声明了不存在的字段索引（&text/&expression_id），
        // 且 &expression 唯一索引会阻止同一单词存多条句子。保留声明用于升级链。
        this.version(1).stores({
            expressions: "++_id, &expression, *status, t, date, *tags, nots, sentences, connections",
            sentences: "++_id, &text, &expression, &expression_id, date",
        });
        // v2 修正：sentence 非 unique 索引；去掉幻影索引；status 改为普通索引。
        // 升级事务里顺带归一化 v1 时代的行：句子字段 text → sentence、缺省的
        // expression 按所属词条回填、Set 存储的 tags/sentences/connections 转数组，
        // 否则这些行在 v2 索引（按 sentence/expression 查询）下永远查不到。
        this.version(2)
            .stores({
                expressions: "++_id, &expression, status, t, date, *tags",
                sentences: "++_id, sentence, expression, date",
            })
            .upgrade(async (tx) => {
                const sentenceExpr = new Map<number, string>();
                await tx.table("expressions").each((row: any) => {
                    const ids = row.sentences instanceof Set
                        ? [...row.sentences]
                        : Array.isArray(row.sentences) ? row.sentences : [];
                    for (const id of ids) {
                        sentenceExpr.set(Number(id), row.expression);
                    }
                });
                await tx.table("sentences").toCollection().modify((row: any) => {
                    if (row.sentence === undefined && row.text !== undefined) {
                        row.sentence = String(row.text);
                        delete row.text;
                    }
                    if (row.expression === undefined) {
                        row.expression = sentenceExpr.get(Number(row._id)) ?? "";
                    }
                });
                await tx.table("expressions").toCollection().modify((row: any) => {
                    if (row.tags instanceof Set) row.tags = [...row.tags];
                    if (row.sentences instanceof Set) row.sentences = [...row.sentences];
                    if (row.connections instanceof Map) row.connections = [...row.connections.keys()];
                    if (row.connections instanceof Set) row.connections = [...row.connections];
                });
            });
        // v3 新增复习调度关联表（主表 schema 不变，无行升级）
        this.version(3).stores({
            expressions: "++_id, &expression, status, t, date, *tags",
            sentences: "++_id, sentence, expression, date",
            schedules: "&expression, due",
        });
    }
}

