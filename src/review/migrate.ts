import { WordSchedule } from "./types";

const DAY_SECONDS = 86400;
const LEGACY_MIN_EASE = 130;
const LEGACY_MAX_EASE = 370;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * SM-2 ease → FSRS difficulty（移植上游 easeToDifficulty）。
 * ease 缺省 → 5.5；ease 130 → 10、370 → 1（越易忘 difficulty 越高）。
 */
export function easeToDifficulty(ease: number | undefined): number {
    if (ease === undefined || ease === null) {
        return 5.5;
    }
    const clampedEase = clamp(ease, LEGACY_MIN_EASE, LEGACY_MAX_EASE);
    const normalized = (clampedEase - LEGACY_MIN_EASE) / (LEGACY_MAX_EASE - LEGACY_MIN_EASE);
    return clamp(10 - normalized * 9, 1, 10);
}

/**
 * SM-2 调度记录 → FSRS 记录（移植上游 sm2ScheduleToFsrsCard 语义）。
 * 用于设置切到 FSRS 后遇到旧 SM-2 记录时先换算再调度，进度不丢。
 */
export function sm2ToFsrs(current: WordSchedule, now: number): WordSchedule {
    const interval = Math.max(1, Math.round(current.interval ?? 1));
    const due = current.due ?? now;
    const lastReview = due - interval * DAY_SECONDS;
    return {
        algorithm: "FSRS",
        due,
        interval,
        stability: Math.max(0.1, interval),
        difficulty: easeToDifficulty(current.ease),
        state: 2, // State.Review
        reps: Math.max(1, Math.round(Math.log2(interval + 1))),
        lapses: 0,
        lastReview,
    };
}
