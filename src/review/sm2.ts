import { ReviewResponse, WordSchedule } from "./types";

export interface Sm2Params {
    baseEase: number;
    easyBonus: number;
    lapseFactor: number;
    maximumInterval: number;
}

const DAY_SECONDS = 86400;
const MIN_EASE = 130;

/**
 * SM-2 调度（移植 obsidian-spaced-repetition 的 osrSchedule 语义，值对象进出）。
 * 新卡（current 为 undefined）：interval 初值 1.0 天、ease 初值 baseEase、delay 0。
 * delay 只影响下次间隔且按分支折算（Good 半算 / Hard 四分之一算）。
 */
export function sm2Next(
    current: Pick<WordSchedule, "interval" | "ease" | "due"> | undefined,
    response: ReviewResponse,
    now: number,
    params: Sm2Params,
): WordSchedule {
    const isNew = current === undefined;
    // 与上游一致：参与计算的基础间隔至少 1 天（Again 分支固定归 0，不受影响）
    const interval = isNew ? 1.0 : Math.max(1, current.interval);
    let ease = isNew ? params.baseEase : current.ease ?? params.baseEase;
    const delay = isNew ? 0 : Math.max(0, (now - current.due) / DAY_SECONDS);

    let next: number;
    switch (response) {
        case "easy":
            ease += 20;
            next = (interval + delay) * (ease / 100) * params.easyBonus;
            break;
        case "good":
            next = (interval + delay / 2) * (ease / 100);
            break;
        case "hard":
            ease = Math.max(MIN_EASE, ease - 20);
            next = Math.max(1, (interval + delay / 4) * params.lapseFactor);
            break;
        case "again":
            ease = Math.max(MIN_EASE, ease - 20);
            next = 0;
            break;
    }

    next = Math.min(next, params.maximumInterval);
    next = Math.round(next * 10) / 10;
    return { algorithm: "SM-2", due: now + next * DAY_SECONDS, interval: next, ease };
}
