import {
    createEmptyCard,
    fsrs,
    generatorParameters,
    Rating,
    State,
    type Card,
    type CardInput,
    type Grade,
} from "ts-fsrs";
import { ReviewResponse, WordSchedule } from "./types";

export interface FsrsParams {
    requestRetention: number;
    maximumInterval: number;
}

const DAY_SECONDS = 86400;

const GRADES: Record<ReviewResponse, Grade> = {
    again: Rating.Again,
    hard: Rating.Hard,
    good: Rating.Good,
    easy: Rating.Easy,
};

function toCardInput(s: WordSchedule, now: number): CardInput {
    return {
        due: new Date(s.due * 1000),
        stability: s.stability ?? 0,
        difficulty: s.difficulty ?? 0,
        elapsed_days: s.lastReview !== undefined
            ? Math.max(0, Math.floor((now - s.lastReview) / DAY_SECONDS))
            : 0,
        scheduled_days: Math.max(0, Math.round(s.interval)),
        reps: s.reps ?? 0,
        lapses: s.lapses ?? 0,
        state: (s.state ?? State.New) as State,
        learning_steps: s.learningSteps ?? 0,
        last_review: s.lastReview !== undefined ? new Date(s.lastReview * 1000) : undefined,
    };
}

function toWordSchedule(card: Card, now: number): WordSchedule {
    return {
        algorithm: "FSRS",
        due: Math.floor(card.due.getTime() / 1000),
        interval: card.scheduled_days,
        stability: card.stability,
        difficulty: card.difficulty,
        state: card.state as number,
        reps: card.reps,
        lapses: card.lapses,
        learningSteps: card.learning_steps,
        lastReview: now,
    };
}

/**
 * FSRS 调度（ts-fsrs 封装）。now/due/lastReview 一律 UNIX 秒，内部转 Date。
 * 新卡（current 为 undefined）走 createEmptyCard；已有卡经 CardInput 直转。
 */
export function fsrsNext(
    current: WordSchedule | undefined,
    response: ReviewResponse,
    now: number,
    params: FsrsParams,
): WordSchedule {
    const scheduler = fsrs(
        generatorParameters({
            request_retention: params.requestRetention,
            maximum_interval: params.maximumInterval,
            enable_short_term: true,
        }),
    );
    const nowDate = new Date(now * 1000);
    const recordLog = scheduler.next(
        current === undefined ? createEmptyCard(nowDate) : toCardInput(current, now),
        nowDate,
        GRADES[response],
    );
    return toWordSchedule(recordLog.card, now);
}
