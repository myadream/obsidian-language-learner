import { ReviewSettings } from "./types";

interface ReviewSettingFields {
    review_algorithm: "FSRS" | "SM-2";
    review_fsrs_retention: number;
    review_sm2_base_ease: number;
    review_sm2_easy_bonus: number;
    review_sm2_lapse_factor: number;
    review_maximum_interval: number;
}

/** settings 的 review_* 字段 → 调度算法参数（review 模块不反向依赖 settings 类型） */
export function reviewSettingsFrom(settings: ReviewSettingFields): ReviewSettings {
    return {
        algorithm: settings.review_algorithm,
        fsrsRetention: settings.review_fsrs_retention,
        sm2BaseEase: settings.review_sm2_base_ease,
        sm2EasyBonus: settings.review_sm2_easy_bonus,
        sm2LapseFactor: settings.review_sm2_lapse_factor,
        maximumInterval: settings.review_maximum_interval,
    };
}
