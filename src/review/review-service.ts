import StorageDrive from "@/storage/drive";
import { ExpressionInfoSimple } from "@/storage/interface";
import { scheduleWord } from "./scheduler";
import { ReviewResponse, ReviewSettings, WordSchedule } from "./types";

export interface ReviewQueueItem {
    expression: string;
    info: ExpressionInfoSimple;
    schedule?: WordSchedule;
}

export interface ReviewQueue {
    /** 已到期（schedule.due <= now），due 升序 */
    due: ReviewQueueItem[];
    /** 新卡（无调度记录），date 升序 */
    newItems: ReviewQueueItem[];
    /** 未来到期的词数 */
    futureCount: number;
}

/**
 * 复习业务层：词条与调度按 expression 内存 join 分桶（与 DataPanel 全量加载模式一致），
 * 评分经 scheduler 装配后落库。
 */
export class ReviewService {
    constructor(
        private drive: StorageDrive,
        private getSettings: () => ReviewSettings,
    ) {}

    async buildQueue(now: number): Promise<ReviewQueue> {
        const [simplies, scheduleRecords] = await Promise.all([
            this.drive.getAllExpressionSimple(false),
            this.drive.getAllSchedules(),
        ]);
        const scheduleByExpression = new Map(
            scheduleRecords.map((r) => [r.expression, r.schedule]),
        );

        const due: ReviewQueueItem[] = [];
        const newItems: ReviewQueueItem[] = [];
        let futureCount = 0;
        for (const info of simplies.data) {
            const schedule = scheduleByExpression.get(info.expression);
            if (!schedule) {
                newItems.push({ expression: info.expression, info, schedule: undefined });
            } else if (schedule.due <= now) {
                due.push({ expression: info.expression, info, schedule });
            } else {
                futureCount++;
            }
        }
        due.sort((a, b) => a.schedule!.due - b.schedule!.due);
        newItems.sort((a, b) => Number(a.info.date) - Number(b.info.date));
        return { due, newItems, futureCount };
    }

    /** 评分落库，返回新调度与"当日到期"判定（回插队尾依据） */
    async applyReview(
        expression: string,
        current: WordSchedule | undefined,
        response: ReviewResponse,
        now: number,
    ): Promise<{ schedule: WordSchedule; dueToday: boolean }> {
        const schedule = scheduleWord(current, response, now, this.getSettings());
        await this.drive.putSchedule(expression, schedule);
        return { schedule, dueToday: isDueToday(schedule.due, now) };
    }
}

/** 当日到期（含 FSRS 短期 / SM-2 Again 的分钟级 due）：due <= now 所在日 23:59:59 */
function isDueToday(due: number, now: number): boolean {
    const d = new Date(now * 1000);
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    return due <= Math.floor(endOfDay.getTime() / 1000);
}
