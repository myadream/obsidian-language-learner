/**
 * 复现阅读页"完成阅读时添加忽略单词"的完整流程：
 * 1. 打开文章 → getStoredWords → 单词未知（不存在）
 * 2. addIgnores → postIgnoreWords
 * 3. 立即再查询（同会话 re-parse）
 * 4. close + 重新 open（模拟重启/重新打开文章）后再查询
 *
 * 三个驱动必须行为一致（用户报告 csv 不会添加忽略单词，sqlite 会）。
 */
import { describe, it, expect } from "vitest";
import { makeDrive, DriveFixture } from "../setup/drive-factory";

const DRIVES = ["indexed", "sqlite", "csv", "tedb"] as const;

const ARTICLE = "The quick brown fox jumps over the lazy dog.";

async function storedStatuses(fixture: DriveFixture): Promise<Map<string, number>> {
    const res = await fixture.drive.getStoredWords({
        article: ARTICLE.toLowerCase(),
        words: ["the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog"],
    });
    return new Map(res.words.map((w) => [w.text.toLowerCase(), w.status]));
}

describe.each(DRIVES)("%s drive reading-ignore flow", (type) => {
    it("ignored words persist across close/reopen", async () => {
        const fixture = await makeDrive(type);

        // 1. 阅读时这些单词都是新词
        let statuses = await storedStatuses(fixture);
        expect(statuses.size).toBe(0);

        // 2. 点击"完成阅读" → postIgnoreWords
        await fixture.drive.postIgnoreWords(["the", "of"]);

        // 3. 同会话内立即 re-parse，应能看到忽略状态
        statuses = await storedStatuses(fixture);
        expect(statuses.get("the")).toBe(0);

        // 4. close + 重新 open（模拟重启 Obsidian / 重新打开文章）
        // 与 StorageProvider.destroyed() 一致：close 返回的 Promise 必须等待，
        // 否则延迟落盘的写文件还在飞行中，重开读到旧文件
        await fixture.drive.close();
        await fixture.drive.open();

        statuses = await storedStatuses(fixture);
        expect(statuses.get("the")).toBe(0);
        expect(statuses.get("quick")).toBeUndefined();

        fixture.adapter.dispose();
    });
});
