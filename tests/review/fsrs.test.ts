import { describe, expect, it } from "vitest";
import { fsrsNext } from "@/review/fsrs";
import { easeToDifficulty, sm2ToFsrs } from "@/review/migrate";
import { ReviewResponse, WordSchedule } from "@/review/types";

const DAY = 86400;
const NOW = 1700000000;
const P = { requestRetention: 0.9, maximumInterval: 36525 };

describe("fsrsNext 新卡", () => {
    // ts-fsrs enable_short_term 下，新卡 again/hard/good 进入 Learning 态：
    // due 为分钟级、scheduled_days = 0（由 ReviewService 的当日到期回插语义接手），仅 easy 直接毕业
    it.each(["again", "hard", "good"] as ReviewResponse[])(
        "%s → 短期 Learning 卡（state 1, interval 0, due > now）",
        (response) => {
            const s = fsrsNext(undefined, response, NOW, P);
            expect(s.algorithm).toBe("FSRS");
            expect(s.reps).toBe(1);
            expect(s.lapses).toBe(0);
            expect(s.stability).toBeGreaterThan(0);
            expect(s.state).toBe(1);
            expect(s.interval).toBe(0);
            expect(s.due).toBeGreaterThan(NOW);
            expect(s.ease).toBeUndefined();
        },
    );

    it("easy → 直接毕业 Review(2)，interval > 0", () => {
        const s = fsrsNext(undefined, "easy", NOW, P);
        expect(s.algorithm).toBe("FSRS");
        expect(s.state).toBe(2);
        expect(s.interval).toBeGreaterThan(0);
        expect(s.due).toBeGreaterThan(NOW + DAY);
        expect(s.ease).toBeUndefined();
    });

    it("确定性：同输入两次调用结果一致", () => {
        const a = fsrsNext(undefined, "good", NOW, P);
        const b = fsrsNext(undefined, "good", NOW, P);
        expect(a).toEqual(b);
    });
});

describe("fsrsNext 已有卡", () => {
    // interval 5、stability 5、difficulty 5、已复 3 次的复习态卡
    const current: WordSchedule = {
        algorithm: "FSRS",
        due: NOW + 5 * DAY,
        interval: 5,
        stability: 5,
        difficulty: 5,
        state: 2,
        reps: 3,
        lapses: 0,
        lastReview: NOW - 5 * DAY,
    };

    it("good → stability 增长, reps 4, state 仍 Review", () => {
        const s = fsrsNext(current, "good", NOW, P);
        expect(s.stability).toBeGreaterThan(5);
        expect(s.reps).toBe(4);
        expect(s.state).toBe(2);
        expect(s.due).toBeGreaterThan(NOW);
    });

    it("again → due 显著提前（短期重学）", () => {
        const s = fsrsNext(current, "again", NOW, P);
        expect(s.due).toBeLessThan(current.due);
        expect(s.lapses).toBe(1);
    });

    it("clamp maximumInterval：巨稳定卡 good → interval ≤ 36525", () => {
        const big: WordSchedule = {
            ...current,
            interval: 40000,
            stability: 40000,
            due: NOW,
            lastReview: NOW - 40000 * DAY,
        };
        const s = fsrsNext(big, "good", NOW, P);
        expect(s.interval).toBeLessThanOrEqual(36525);
    });
});

describe("easeToDifficulty", () => {
    it("undefined → 5.5；130 → 10；370 → 1；250 → 5.5", () => {
        expect(easeToDifficulty(undefined)).toBe(5.5);
        expect(easeToDifficulty(130)).toBe(10);
        expect(easeToDifficulty(370)).toBe(1);
        expect(easeToDifficulty(250)).toBe(5.5);
    });
});

describe("sm2ToFsrs", () => {
    it("interval 10 / ease 250 / due=now+10d 的 SM-2 卡", () => {
        const current: WordSchedule = {
            algorithm: "SM-2",
            due: NOW + 10 * DAY,
            interval: 10,
            ease: 250,
        };
        const s = sm2ToFsrs(current, NOW);
        expect(s.algorithm).toBe("FSRS");
        expect(s.due).toBe(NOW + 10 * DAY); // due 不变
        expect(s.interval).toBe(10);
        expect(s.stability).toBe(10);
        expect(s.difficulty).toBe(5.5);
        expect(s.lastReview).toBe(NOW); // due − interval
        expect(s.reps).toBe(3); // max(1, round(log2(11)))
        expect(s.lapses).toBe(0);
        expect(s.state).toBe(2); // Review
    });

    it("ease undefined → difficulty 5.5；ease 130 → difficulty 10", () => {
        const base: WordSchedule = { algorithm: "SM-2", due: NOW, interval: 10 };
        expect(sm2ToFsrs(base, NOW).difficulty).toBe(5.5);
        expect(sm2ToFsrs({ ...base, ease: 130 }, NOW).difficulty).toBe(10);
    });
});
