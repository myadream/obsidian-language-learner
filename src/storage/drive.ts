import {
    ArticleWords, WordsPhrase, Sentence,
    ExpressionInfo, ExpressionInfoSimple, CountInfo, WordCount, ReviewWord
} from "./interface";

export interface Paginate {
    pageSize: number, page: number
}

export interface PaginateResult<T> {
    data: T, total: number, page: number, pageSize: number
}

export interface SortParams {
    [key: string]: any
}

abstract class StorageDrive {
    abstract open(): Promise<void>;
    // close 允许返回 Promise：驱动在 close 时把未落盘的延迟写入刷盘（CSV/SQLite 延迟持久化），
    // 调用方（StorageProvider.destroyed）必须 await，否则重开/卸载时读到旧文件造成数据丢失
    abstract close(): void | Promise<void>;
    // 在文章中寻找之前记录过的单词和词组
    abstract getStoredWords(payload: ArticleWords): Promise<WordsPhrase>;
    // 查询单个单词/词组的全部信息
    abstract getExpression(expression: string): Promise<ExpressionInfo>;
    //获取一批单词的简略信息
    abstract getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]>;
    // 某一时间之后添加的全部单词
    abstract getExpressionAfter(time: string): Promise<ReviewWord[]>;
    // 获取全部单词的简略信息
    abstract getAllExpressionSimple(ignores?: boolean, sort?: SortParams, search?: SortParams, paginate?: Paginate): Promise<PaginateResult<any>>;
    // 发送单词信息到数据库保存；date 可选（导入路径用它保留原始时间），缺省取当前时间
    abstract postExpression(payload: ExpressionInfo, date?: number): Promise<number>;
    // 移除单词
    abstract removeExpression(expression: string): Promise<boolean>;
    // 获取所有tag
    abstract getTags(): Promise<string[]>;
    // 批量发送单词，全部标记为ignore
    abstract postIgnoreWords(payload: string[]): Promise<void>;
    // 查询一个例句是否已经记录过
    abstract tryGetSen(text: string): Promise<Sentence>;
    // 获取各类单词的个数
    abstract getCount(): Promise<CountInfo>;
    // 获取7天内的统计信息
    abstract countSeven(): Promise<WordCount[]>;
    // 销毁数据库
    abstract destroyAll(): Promise<void>;
    // 导出全部数据：只负责把库内容变成统一的 ExpressionInfo 列表，不感知文件格式；
    // JSON/CSV/SQLite3 等文件格式的解析与序列化统一在外层 src/storage/transfer.ts
    abstract exportData(): Promise<ExpressionInfo[]>;
    // 导入外层解析好的数据（统一 ExpressionInfo 列表）。
    // 合并语义由驱动决定：indexed 为清空重建（完整恢复），csv/sqlite 为按 expression 覆盖合并。
    // date 语义：写入时保留数据自带的时间（ UNIX 秒），仅缺省时才取当前时间
    abstract importData(items: ExpressionInfo[]): Promise<void>;
}


export default StorageDrive;
