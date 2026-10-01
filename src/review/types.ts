export type ReviewResponse = "again" | "hard" | "good" | "easy";

export type AlgorithmType = "FSRS" | "SM-2";

/** 复习调度状态，按 expression 关联存储在 schedules 表；无记录 = 新卡 */
export interface WordSchedule {
    algorithm: AlgorithmType;
    /** 到期时间，UNIX 秒 */
    due: number;
    /** 间隔天数（可为小数） */
    interval: number;
    /** SM-2 专用：ease 因子，初始 250，下限 130 */
    ease?: number;
    /** FSRS 专用字段 */
    stability?: number;
    difficulty?: number;
    /** ts-fsrs State：0 New / 1 Learning / 2 Review / 3 Relearning */
    state?: number;
    reps?: number;
    lapses?: number;
    /** 上次评分时间，UNIX 秒 */
    lastReview?: number;
}

/** schedules 表的一行：expression 与 expressions.expression 精确相等 */
export interface ReviewScheduleRecord {
    expression: string;
    schedule: WordSchedule;
}

/** 调度算法参数（由 settings 的 review_* 字段映射而来） */
export interface ReviewSettings {
    algorithm: AlgorithmType;
    fsrsRetention: number;
    sm2BaseEase: number;
    sm2EasyBonus: number;
    sm2LapseFactor: number;
    maximumInterval: number;
}
