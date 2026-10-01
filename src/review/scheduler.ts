import { fsrsNext } from "./fsrs";
import { sm2ToFsrs } from "./migrate";
import { sm2Next } from "./sm2";
import { ReviewResponse, ReviewSettings, WordSchedule } from "./types";

/**
 * 调度装配统一入口：按设置选算法，词的既有算法与设置不一致时先换算。
 * - SM-2 记录 + FSRS 设置：先经 sm2ToFsrs 迁移，进度不丢（上游同款行为）
 * - FSRS 记录 + SM-2 设置：以 due/interval 近似为 SM-2 卡（ease 缺省 baseEase），spec 已知限制
 */
export function scheduleWord(
    current: WordSchedule | undefined,
    response: ReviewResponse,
    now: number,
    settings: ReviewSettings,
): WordSchedule {
    if (settings.algorithm === "FSRS") {
        const input = current && current.algorithm === "SM-2" ? sm2ToFsrs(current, now) : current;
        return fsrsNext(input, response, now, {
            requestRetention: settings.fsrsRetention,
            maximumInterval: settings.maximumInterval,
        });
    }
    const input = current && current.algorithm === "FSRS"
        ? { interval: current.interval, ease: settings.sm2BaseEase, due: current.due }
        : current;
    return sm2Next(input, response, now, {
        baseEase: settings.sm2BaseEase,
        easyBonus: settings.sm2EasyBonus,
        lapseFactor: settings.sm2LapseFactor,
        maximumInterval: settings.maximumInterval,
    });
}
