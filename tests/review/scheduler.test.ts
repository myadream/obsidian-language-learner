import { describe, expect, it } from "vitest";
import { fsrsNext } from "@/review/fsrs";
import { sm2ToFsrs } from "@/review/migrate";
import { scheduleWord } from "@/review/scheduler";
import { sm2Next } from "@/review/sm2";
import { ReviewSettings, WordSchedule } from "@/review/types";

const DAY = 86400;
const NOW = 1700000000;
const FSRS_ON: ReviewSettings = {
    algorithm: "FSRS",
    fsrsRetention: 0.9,
    sm2BaseEase: 250,
    sm2EasyBonus: 1.3,
    sm2LapseFactor: 0.5,
    maximumInterval: 36525,
};
const SM2_ON: ReviewSettings = { ...FSRS_ON, algorithm: "SM-2" };
const SM2_PARAMS = { baseEase: 250, easyBonus: 1.3, lapseFactor: 0.5, maximumInterval: 36525 };

describe("scheduleWord 算法选择", () => {
    it("新卡 + FSRS 设置 → 直调 fsrsNext", () => {
        expect(scheduleWord(undefined, "good", NOW, FSRS_ON)).toEqual(
            fsrsNext(undefined, "good", NOW, { requestRetention: 0.9, maximumInterval: 36525 }),
        );
    });

    it("新卡 + SM-2 设置 → 直调 sm2Next", () => {
        expect(scheduleWord(undefined, "good", NOW, SM2_ON)).toEqual(
            sm2Next(undefined, "good", NOW, SM2_PARAMS),
        );
    });
});

describe("scheduleWord 跨算法换算", () => {
    it("SM-2 记录 + FSRS 设置 → 先 sm2ToFsrs 再调度，产出 FSRS 记录", () => {
        const current: WordSchedule = { algorithm: "SM-2", interval: 10, ease: 250, due: NOW + 10 * DAY };
        const migrated = sm2ToFsrs(current, NOW);
        expect(scheduleWord(current, "good", NOW, FSRS_ON)).toEqual(
            scheduleWord(migrated, "good", NOW, FSRS_ON),
        );
        expect(scheduleWord(current, "good", NOW, FSRS_ON).algorithm).toBe("FSRS");
    });

    it("FSRS 记录 + SM-2 设置 → 以 baseEase 近似为 SM-2 卡调度", () => {
        const current: WordSchedule = {
            algorithm: "FSRS",
            interval: 10,
            due: NOW + 10 * DAY,
            stability: 10,
            difficulty: 5.5,
            state: 2,
            reps: 3,
            lapses: 0,
            lastReview: NOW,
        };
        const expected = sm2Next({ interval: 10, ease: 250, due: NOW + 10 * DAY }, "good", NOW, SM2_PARAMS);
        expect(scheduleWord(current, "good", NOW, SM2_ON)).toEqual(expected);
    });
});
