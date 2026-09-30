import {moment} from "obsidian";
import {createAutomaton} from "ac-auto";

import {
    ArticleWords,
    CountInfo,
    ExpressionInfo,
    ExpressionInfoSimple,
    Phrase, ReviewWord,
    Sentence,
    Span,
    Word,
    WordCount,
    WordsPhrase,
    WordType
} from "@/storage/interface";
import WordDB from "./idb";
import Plugin from "@/plugin";
import StorageDrive, {Paginate, PaginateResult, SortParams} from "@/storage/drive";
import { toUnixSeconds } from "@/storage/utils";
import { ExpressionsTable } from "../types";

export class IndexedStorageDrive extends StorageDrive {
    idb: WordDB;
    plugin: Plugin;

    constructor(plugin: Plugin) {
        super();
        this.plugin = plugin;
        this.idb = new WordDB(plugin);
    }

    async open() {
        await this.idb.open();
        return;
    }

    close() {
        this.idb.close();
    }

    // 寻找页面中已经记录过的单词和词组
    async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
        const storedPhrases = new Map<string, number>();
        await this.idb.expressions
            .where("t").equals("PHRASE")
            .each(expr => storedPhrases.set(expr.expression, expr.status));

        const storedWords = (await this.idb.expressions
                .where("expression").anyOf(payload.words)
                .toArray()
        ).map(expr => {
            return {text: expr.expression, status: expr.status} as Word;
        });
        const ac = await createAutomaton([...storedPhrases.keys()]);
        const searchedPhrases = (await ac.search(payload.article)).map(match => {
            return {text: match[1], status: storedPhrases.get(match[1]), offset: match[0]} as Phrase;
        });

        return {words: storedWords, phrases: searchedPhrases};
    }

    async getExpression(expression: string): Promise<ExpressionInfo> {
        expression = expression.toLowerCase();
        const expr = await this.idb.expressions
            .where("expression").equals(expression).first();

        if (!expr) {
            return null;
        }

        const sentences = (await this.idb.sentences
            .bulkGet((expr.sentences as number[]) || [])
        ).filter(Boolean);

        return {
            expression: expr.expression,
            meaning: expr.meaning,
            status: expr.status,
            t: expr.t,
            notes: expr.notes as string[],
            sentences,
            tags: expr.tags,
            connections: (expr.connections as string[]) ?? [],
            date: expr.date,
        };

    }

    async getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]> {
        expressions = expressions.map(e => e.toLowerCase());

        const exprs = await this.idb.expressions
            .where("expression")
            .anyOf(expressions)
            .toArray();

        return exprs.map(v => {
            return {
                expression: v.expression,
                meaning: v.meaning,
                status: v.status,
                t: v.t,
                tags: v.tags,
                sen_num: v.sentences.length,
                note_num: v.notes.length,
                date: v.date
            };
        });
    }

    async getExpressionAfter(time: string): Promise<ReviewWord[]> {
        const unixStamp = moment.utc(time).unix();
        const wordsAfter = await this.idb.expressions
            .where("status").above(0)
            .and(expr => expr.date > unixStamp)
            .toArray();

        const res: ReviewWord[] = [];
        for (const expr of wordsAfter) {
            const sentences = (await this.idb.sentences
                .bulkGet((expr.sentences as number[]) || [])
            ).filter(Boolean);

            for (const item of sentences) {
                res.push({
                    title: expr.expression,
                    expression: item.sentence.replace(expr.expression, `==${expr.expression}==`),
                    meaning: item.trans,
                    status: expr.status,
                    t: WordType.PHRASE,
                    notes: [],
                    sentences: [],
                    tags: expr.tags,
                });
            }

            res.push({
                title: expr.expression,
                expression: expr.expression,
                meaning: expr.meaning,
                status: expr.status,
                t: expr.t,
                notes: expr.notes as string[],
                sentences,
                tags: expr.tags,
            });
        }
        return res;
    }

    async getAllExpressionSimple(
        ignores?: boolean,
        sort?: SortParams,
        search?: { [key: string]: any },
        paginate?: Paginate
    ): Promise<PaginateResult<ExpressionInfoSimple[]>> {
        const bottomStatus = ignores ? -1 : 0;
        const pageSize = paginate?.pageSize || 100;
        const page = paginate?.page || 0; // 0-based

        // 构建查询
        const collection = this.idb.expressions.where("status").above(bottomStatus);

        // 处理搜索条件
        if (search && Object.keys(search).length > 0) {
            // 模糊搜索需要在内存中过滤
            const allData = await collection.toArray();

            const filteredData = allData.filter(expr => {
                let match = true;

                if (search.expression) {
                    match = match && expr.expression.toLowerCase().includes(search.expression.toLowerCase());
                }
                if (search.meaning && match) {
                    match = match && expr.meaning.toLowerCase().includes(search.meaning.toLowerCase());
                }
                if (search.status !== undefined && match) {
                    match = match && expr.status === search.status;
                }
                if (search.t && match) {
                    match = match && expr.t === search.t;
                }
                if (search.tags && Array.isArray(search.tags) && search.tags.length && match) {
                    match = match && expr.tags.some(tag => search.tags.includes(tag));
                }

                return match;
            });

            // 处理排序
            if (sort && Object.keys(sort).length > 0) {
                const sortField = Object.keys(sort)[0];
                const sortOrder = sort[sortField] === 'asc' ? 1 : -1;

                filteredData.sort((a, b) => {
                    if (sortField === 'expression') {
                        return sortOrder * a.expression.localeCompare(b.expression);
                    } else if (sortField === 'meaning') {
                        return sortOrder * a.meaning.localeCompare(b.meaning);
                    } else if (sortField === 'status') {
                        return sortOrder * (a.status - b.status);
                    } else if (sortField === 'date') {
                        return sortOrder * (Number(a.date) - Number(b.date));
                    }
                    return 0;
                });
            }

            // 计算分页
            const total = filteredData.length;
            const offset = page * pageSize;
            const paginatedData = filteredData.slice(offset, offset + pageSize);

            const data = paginatedData.map(expr => ({
                expression: expr.expression,
                status: expr.status,
                meaning: expr.meaning,
                t: expr.t,
                tags: expr.tags,
                note_num: expr.notes.length,
                sen_num: expr.sentences.length,
                date: expr.date,
            }));

            return {
                data,
                total,
                page: page + 1, // 返回 1-based
                pageSize
            };
        }

        // 没有搜索条件，使用数据库原生查询
        const totalCount = await collection.count();

        // 处理排序 - 使用 Dexie 的 offset/limit/toArray 后在内存中排序
        // 因为 Dexie 的 Collection 不支持动态排序，需要先获取数据再排序
        const pageData = await collection.toArray();

        // 处理排序
        if (sort && Object.keys(sort).length > 0) {
            const sortField = Object.keys(sort)[0];
            const sortOrder = sort[sortField] === 'asc' ? 1 : -1;

            pageData.sort((a, b) => {
                if (sortField === 'expression') {
                    return sortOrder * a.expression.localeCompare(b.expression);
                } else if (sortField === 'meaning') {
                    return sortOrder * a.meaning.localeCompare(b.meaning);
                } else if (sortField === 'status') {
                    return sortOrder * (a.status - b.status);
                } else if (sortField === 'date') {
                    return sortOrder * (Number(a.date) - Number(b.date));
                }
                return 0;
            });
        } else {
            // 默认按日期降序
            pageData.sort((a, b) => Number(b.date) - Number(a.date));
        }

        // 手动分页
        const offset = page * pageSize;
        const paginatedData = pageData.slice(offset, offset + pageSize);

        const data = paginatedData.map(expr => ({
            expression: expr.expression,
            status: expr.status,
            meaning: expr.meaning,
            t: expr.t,
            tags: expr.tags,
            note_num: expr.notes.length,
            sen_num: expr.sentences.length,
            date: expr.date,
        }));

        return {
            data,
            total: totalCount,
            page: page + 1, // 返回 1-based
            pageSize
        };
    }

    async postExpression(payload: ExpressionInfo, date = moment().unix()): Promise<number> {
        const stored = await this.idb.expressions
            .where("expression").equals(payload.expression)
            .first();

        const sentenceIds = new Set<number>();

        // 处理句子 - 先检查是否已存在（通过 expression 和 sentence 判断）
        for (const sen of payload.sentences) {
            // 尝试查找已存在的句子
            const existing = await this.idb.sentences
                .where("sentence").equals(sen.sentence)
                .and(s => s.expression === payload.expression)
                .first();

            if (existing) {
                // 更新已存在的句子
                await this.idb.sentences.update(existing._id as number, {
                    sentence: sen.sentence,
                    trans: sen.trans || '',
                    origin: sen.origin || '',
                    date,
                });
                sentenceIds.add(existing._id as number);
            } else {
                // 添加新句子
                const newSen = {
                    expression: payload.expression,
                    sentence: sen.sentence,
                    trans: sen.trans || '',
                    origin: sen.origin || '',
                    date,
                };
                const id = await this.idb.sentences.add(newSen);
                sentenceIds.add(id);
            }
        }

        // 删除不再需要的旧句子
        if (stored && stored.sentences && stored.sentences.length > 0) {
            const oldSentenceIds = stored.sentences as number[];
            const idsToDelete = oldSentenceIds.filter(id => !sentenceIds.has(id));

            if (idsToDelete.length > 0) {
                await this.idb.sentences
                    .where("_id")
                    .anyOf(idsToDelete)
                    .delete();
            }
        }

        const updatedWord = {
            expression: payload.expression,
            meaning: payload.meaning,
            status: payload.status,
            t: payload.t,
            notes: payload.notes || [],
            sentences: [...sentenceIds.values()],
            tags: [...new Set<string>(payload.tags || [])],
            connections: payload.connections || [],
            date,
        };

        if (stored) {
            await this.idb.expressions.update(stored._id as number, updatedWord);
        } else {
            await this.idb.expressions.add(updatedWord);
        }

        return 200;
    }

    async getTags(): Promise<string[]> {
        const allTags = new Set<string>();
        await this.idb.expressions.each(expr => {
            for (const t of expr.tags) {
                allTags.add(t);
            }
        });

        return [...allTags.values()];
    }

    async postIgnoreWords(payload: string[]): Promise<void> {
        // 已存在的单词仅置 status=0，保留释义/笔记/标签；不存在的才新建忽略记录
        await this.idb.transaction("rw", this.idb.expressions, async () => {
            for (const raw of payload) {
                const expression = raw.trim().toLowerCase();
                if (!expression) continue;

                const existing = await this.idb.expressions
                    .where("expression").equals(expression)
                    .first();

                if (existing) {
                    await this.idb.expressions.update(existing._id as number, {
                        status: 0,
                        date: moment().unix(),
                    });
                } else {
                    await this.idb.expressions.add({
                        expression,
                        meaning: "",
                        status: 0,
                        t: WordType.WORD,
                        notes: [],
                        sentences: [],
                        tags: [],
                        connections: [],
                        date: moment().unix()
                    } as ExpressionsTable);
                }
            }
        });
        return;
    }

    async tryGetSen(text: string): Promise<Sentence> {
        const stored = await this.idb.sentences.where("sentence").equals(text).first();
        return stored || null;
    }

    async getCount(): Promise<CountInfo> {
        const counts: { "WORD": number[], "PHRASE": number[]; } = {
            "WORD":  [0, 0, 0, 0, 0],
            "PHRASE": [0, 0, 0, 0, 0],
        };
        await this.idb.expressions.each(expr => {
            const bucket = counts[expr.t as WordType];
            if (bucket && expr.status >= 0 && expr.status <= 4) {
                bucket[expr.status]++;
            }
        });

        return {
            word_count: counts.WORD,
            phrase_count: counts.PHRASE
        };
    }

    async countSeven(): Promise<WordCount[]> {
        const spans: Span[] = [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const start = moment().subtract(6, "days").startOf("day");
            const from = start.add(i, "days");
            return {
                from: from.unix(),
                to: from.endOf("day").unix(),
            };
        });

        const res: WordCount[] = [];

        // 对每一天计算
        for (const span of spans) {
            // 当日
            const today = [0, 0, 0, 0, 0];
        await this.idb.expressions.filter(expr => {
            return expr.t == WordType.WORD &&
                expr.date >= span.from &&
                expr.date <= span.to &&
                expr.status >= 0 && expr.status <= 4;
        }).each(expr => {
            today[expr.status]++;
        });
        // 累计
        const accumulated = [0, 0, 0, 0, 0];
        await this.idb.expressions.filter(expr => {
            return expr.t == WordType.WORD &&
                expr.date <= span.to &&
                expr.status >= 0 && expr.status <= 4;
        }).each(expr => {
            accumulated[expr.status]++;
        });

            res.push({today, accumulated});
        }

        return res;
    }

    // ---- 导入导出（文件格式在外层 transfer.ts 统一处理，驱动只面对数据） ----

    /** 全量导出为统一数据结构：词条内嵌的 tags/notes 直接带出，句子按 _id 联表 */
    async exportData(): Promise<ExpressionInfo[]> {
        const [exprs, sentences] = await Promise.all([
            this.idb.expressions.toArray(),
            this.idb.sentences.toArray(),
        ]);
        const sentenceById = new Map(sentences.map((s) => [s._id, s]));

        return exprs.map((expr) => ({
            expression: expr.expression,
            meaning: expr.meaning,
            status: expr.status,
            t: expr.t,
            tags: [...(expr.tags ?? [])],
            notes: [...(expr.notes ?? [])],
            sentences: ((expr.sentences ?? []) as any[])
                .map((id) => sentenceById.get(id))
                .filter(Boolean)
                .map((s) => ({
                    expression: s.expression,
                    sentence: s.sentence,
                    trans: s.trans,
                    origin: s.origin,
                    date: s.date,
                })),
            connections: [...(expr.connections ?? [])],
            date: expr.date,
        }));
    }

    /** 清空重建导入：与历史导入语义一致（完整恢复），保留数据自带的原始时间 */
    async importData(items: ExpressionInfo[]): Promise<void> {
        await this.idb.delete();
        await this.idb.open();

        await this.idb.transaction(
            "rw",
            this.idb.expressions,
            this.idb.sentences,
            async () => {
                for (const item of items) {
                    if (!item?.expression) continue;
                    await this.postExpression(item, toUnixSeconds(item.date));
                }
            }
        );
    }

    async destroyAll() {
        await this.idb.delete();
        // 重新打开，保证实例销毁后仍可继续使用（空库）
        await this.idb.open();
    }

    async removeExpression(expression: string): Promise<boolean> {
        // 首先获取 expression 对象以获取关联的 sentences IDs
        const expr = await this.idb.expressions
            .where("expression").equals(expression)
            .first();

        if (!expr) {
            return false;
        }

        // 删除关联的 sentences
        if (expr.sentences && expr.sentences.length > 0) {
            await this.idb.sentences
                .where("_id")
                .anyOf(expr.sentences as number[])
                .delete();
        }

        // 删除 expression
        const deletedCount = await this.idb.expressions
            .where("expression").equals(expression)
            .delete();

        return deletedCount > 0;
    }
}


