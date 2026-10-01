import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeDrive, DriveFixture } from "../setup/drive-factory";
import { migrateFromSr, parseSrComment, parseSrWords } from "@/review/migrate-from-sr";
import { WordType } from "@/storage/interface";

const SM2_DUE = Date.UTC(2024, 2, 1) / 1000;        // 2024-03-01
const SM2_DUE2 = Date.UTC(2024, 4, 10) / 1000;      // 2024-05-10
const FSRS_DUE = Date.UTC(2024, 4, 1) / 1000;       // 2024-05-01T00:00:00.000Z
const FSRS_LAST = Date.UTC(2024, 3, 18) / 1000;     // 2024-04-18T00:00:00.000Z

describe("parseSrComment", () => {
    it("SM-2 单段 → due/interval/ease", () => {
        expect(parseSrComment("2024-03-01,12,250")).toEqual({
            algorithm: "SM-2", due: SM2_DUE, interval: 12, ease: 250,
        });
    });

    it("SM-2 多段取最后一段", () => {
        expect(parseSrComment("2024-03-01,4,270!2024-05-10,9,250")).toEqual({
            algorithm: "SM-2", due: SM2_DUE2, interval: 9, ease: 250,
        });
    });

    it("FSRS 段全字段解析（learningSteps 保留）", () => {
        expect(parseSrComment("!fsrs,2024-05-01T00:00:00.000Z,13.2,5.1,5.5,2,7,1,0,2024-04-18T00:00:00.000Z")).toEqual({
            algorithm: "FSRS",
            due: FSRS_DUE,
            interval: 13.2,
            stability: 5.1,
            difficulty: 5.5,
            state: 2,
            reps: 7,
            lapses: 1,
            learningSteps: 0,
            lastReview: FSRS_LAST,
        });
    });

    it("FSRS lastReview 为 '-' → undefined", () => {
        const s = parseSrComment("!fsrs,2024-05-01T00:00:00.000Z,13.2,5.1,5.5,2,7,1,0,-");
        expect(s).not.toBeNull();
        expect(s!.lastReview).toBeUndefined();
    });

    it("非法段 → null", () => {
        expect(parseSrComment("")).toBeNull();
        expect(parseSrComment("not-a-date,1,250")).toBeNull();
        expect(parseSrComment("!fsrs,broken")).toBeNull();
    });
});

describe("parseSrWords", () => {
    const md = [
        "#flashcards",
        "",
        "#word",
        "## apple ",
        "",
        "apple",
        "??",
        "苹果",
        "",
        "<!--SR:2024-03-01,12,250-->",
        "#word",
        "## run",
        "",
        "run",
        "??",
        "跑",
        "",
        "**Notes**:",
        "note1",
        "<!--SR:!fsrs,2024-05-01T00:00:00.000Z,13.2,5.1,5.5,2,7,1,0,-->", // lastReview "-"
        "#word",
        "## dog",
        "",
        "dog",
        "??",
        "狗",
    ].join("\n");

    it("逐块提取 expression 与调度；无 SR 注释的块 schedule 缺省", () => {
        const blocks = parseSrWords(md);
        expect(blocks).toHaveLength(3);

        expect(blocks[0].expression).toBe("apple");
        expect(blocks[0].schedule).toEqual({ algorithm: "SM-2", due: SM2_DUE, interval: 12, ease: 250 });

        expect(blocks[1].expression).toBe("run");
        expect(blocks[1].schedule!.algorithm).toBe("FSRS");

        expect(blocks[2].expression).toBe("dog");
        expect(blocks[2].schedule).toBeUndefined();
    });
});

describe("migrateFromSr", () => {
    let fixture: DriveFixture;

    beforeEach(async () => {
        fixture = await makeDrive("indexed");
    });
    afterEach(() => {
        fixture.drive.close();
        fixture.adapter.dispose();
    });

    const seedWord = (expression: string) =>
        fixture.drive.postExpression({
            expression, meaning: "m", status: 1, t: WordType.WORD,
            tags: [], notes: [], sentences: [], connections: [], date: 1700000000,
        });

    it("库内词匹配写库，库外词跳过；重复执行覆盖写不累积", async () => {
        await seedWord("apple"); // 库内
        // "ghost" 不在库中

        const md = [
            "#word",
            "## apple",
            "",
            "apple",
            "??",
            "苹果",
            "<!--SR:2024-03-01,12,250-->",
            "#word",
            "## ghost",
            "",
            "ghost",
            "??",
            "鬼",
            "<!--SR:2024-03-01,4,270-->",
        ].join("\n");

        const r1 = await migrateFromSr(fixture.drive, md);
        expect(r1).toEqual({ total: 2, matched: 1, skipped: 1, withoutSchedule: 0 });
        expect(await fixture.drive.getSchedule("apple")).toEqual({
            algorithm: "SM-2", due: SM2_DUE, interval: 12, ease: 250,
        });

        // 第二次执行：覆盖写，计数不累积
        const r2 = await migrateFromSr(fixture.drive, md);
        expect(r2.matched).toBe(1);
        expect(await fixture.drive.getSchedule("apple")).toEqual({
            algorithm: "SM-2", due: SM2_DUE, interval: 12, ease: 250,
        });
    });

    it("大小写不一致时按库内大小写回写（否则 join 不到成孤儿）", async () => {
        // csv 驱动的 getExpression 对混合大小写行也是大小写不敏感命中
        const csv = await makeDrive("csv");
        try {
            await csv.drive.postExpression({
                expression: "Apple", meaning: "苹果", status: 1, t: WordType.WORD,
                tags: [], notes: [], sentences: [], connections: [], date: 1700000000,
            });

            const md = [
                "#word",
                "## apple",
                "",
                "apple",
                "??",
                "苹果",
                "<!--SR:2024-03-01,12,250-->",
            ].join("\n");

            const r = await migrateFromSr(csv.drive, md);
            expect(r.matched).toBe(1);
            // 库内大小写的键可取到
            expect(await csv.drive.getSchedule("Apple")).toEqual({
                algorithm: "SM-2", due: SM2_DUE, interval: 12, ease: 250,
            });
            // md 原样大小写不产生孤儿
            expect(await csv.drive.getSchedule("apple")).toBeUndefined();
        } finally {
            csv.drive.close();
            csv.adapter.dispose();
        }
    });

    it("全部块无 SR 注释 → matched 0, withoutSchedule 计数", async () => {
        await seedWord("dog");
        const r = await migrateFromSr(fixture.drive, "#word\n## dog\n\ndog\n??\n狗\n");
        expect(r).toEqual({ total: 1, matched: 0, skipped: 0, withoutSchedule: 1 });
        expect(await fixture.drive.getSchedule("dog")).toBeUndefined();
    });
});
