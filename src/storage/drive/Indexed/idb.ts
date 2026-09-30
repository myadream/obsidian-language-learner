import Dexie from "dexie";
import Plugin from "@/plugin";
import { ExpressionsTable, SentencesTable } from "../types";

export default class WordDB extends Dexie {
    expressions: Dexie.Table<ExpressionsTable, number>;
    sentences: Dexie.Table<SentencesTable, number>;

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
        // v2 修正：sentence 非 unique 索引；去掉幻影索引；status 改为普通索引
        this.version(2).stores({
            expressions: "++_id, &expression, status, t, date, *tags",
            sentences: "++_id, sentence, expression, date",
        });
    }
}

