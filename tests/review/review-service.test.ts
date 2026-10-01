import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeDrive, DriveFixture } from "../setup/drive-factory";
import { ReviewService } from "@/review/review-service";
import { ExpressionInfo, WordType } from "@/storage/interface";
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

function makeInfo(over: Partial<ExpressionInfo> = {}): ExpressionInfo {
    return {
        expression: "w",
        meaning: "m",
        status: 1,
        t: WordType.WORD,
        tags: [],
        notes: [],
        sentences: [],
        connections: [],
        date: NOW,
        ...over,
    };
}

const sched = (due: number): WordSchedule => ({ algorithm: "SM-2", due, interval: 10, ease: 250 });

describe("ReviewService", () => {
    let fixture: DriveFixture;

    beforeEach(async () => {
        fixture = await makeDrive("indexed");
    });
    afterEach(() => {
        fixture.drive.close();
        fixture.adapter.dispose();
    });

    it("buildQueue 分桶：到期/新卡/未来；忽略 status0 与孤儿调度", async () => {
        // w4 date 最早 → 新卡桶排最前；w3 未来；w2 到期；w5 被忽略
        await fixture.drive.postExpression(makeInfo({ expression: "w1", date: NOW + 100 }), NOW + 100);
        await fixture.drive.postExpression(makeInfo({ expression: "w2", date: NOW + 200 }), NOW + 200);
        await fixture.drive.postExpression(makeInfo({ expression: "w3", date: NOW + 300 }), NOW + 300);
        await fixture.drive.postExpression(makeInfo({ expression: "w4", date: NOW + 50 }), NOW + 50);
        await fixture.drive.postExpression(makeInfo({ expression: "w5", status: 0 }), NOW);

        await fixture.drive.putSchedule("w2", sched(NOW - DAY));
        await fixture.drive.putSchedule("w3", sched(NOW + 10 * DAY));
        await fixture.drive.putSchedule("ghost", sched(NOW - DAY)); // 词已不存在的孤儿记录

        const svc = new ReviewService(fixture.drive, () => FSRS_ON);
        const q = await svc.buildQueue(NOW);

        expect(q.due.map((i) => i.expression)).toEqual(["w2"]);
        expect(q.newItems.map((i) => i.expression)).toEqual(["w4", "w1"]);
        expect(q.futureCount).toBe(1);
    });

    it("applyReview 落库并返回 dueToday 判定：短期回插 true → 毕业 false → again true", async () => {
        await fixture.drive.postExpression(makeInfo({ expression: "w4" }), NOW);

        const svc = new ReviewService(fixture.drive, () => FSRS_ON);
        // FSRS 短期：新卡 good 进 Learning（分钟级 due）→ 当日回插
        const first = await svc.applyReview("w4", undefined, "good", NOW);
        expect(await fixture.drive.getSchedule("w4")).toEqual(first.schedule);
        expect(first.dueToday).toBe(true);

        // 二次 good 毕业 → Review，间隔跨日
        const second = await svc.applyReview("w4", first.schedule, "good", NOW);
        expect(second.dueToday).toBe(false);

        // again → 立即重学
        const again = await svc.applyReview("w4", second.schedule, "again", NOW);
        expect(again.dueToday).toBe(true);
    });
});
