import StorageDrive from "@/storage/drive";
import { WordSchedule } from "./types";

export interface SrMigrateResult {
    /** md 中的总块数 */
    total: number;
    /** 命中库内词条并写入调度 */
    matched: number;
    /** 词已不在库中，跳过 */
    skipped: number;
    /** 块无 SR 调度注释 */
    withoutSchedule: number;
}

/** 单条 <!--SR:...--> 的内部内容 → 调度；多段取最后一段；无法解析 → null */
export function parseSrComment(inner: string): WordSchedule | null {
    const segments = inner.split("!").filter((s) => s.trim().length > 0);
    if (segments.length === 0) {
        return null;
    }
    const last = segments[segments.length - 1].trim();
    if (last.startsWith("fsrs,")) {
        return parseFsrsSegment(last.slice("fsrs,".length));
    }
    return parseSm2Segment(last);
}

/** SM-2 段：<YYYY-MM-DD>,<interval>,<ease> */
function parseSm2Segment(segment: string): WordSchedule | null {
    const parts = segment.split(",").map((p) => p.trim());
    if (parts.length !== 3) {
        return null;
    }
    const dueMs = Date.parse(parts[0]);
    const interval = Number(parts[1]);
    const ease = Number(parts[2]);
    if (!Number.isFinite(dueMs) || !Number.isFinite(interval) || !Number.isFinite(ease)) {
        return null;
    }
    return { algorithm: "SM-2", due: Math.floor(dueMs / 1000), interval, ease };
}

/**
 * FSRS 段：!fsrs,<ISOdue>,<interval>,<stability>,<difficulty>,<state>,<reps>,<lapses>,<learningSteps>,<ISOlastReview>
 * 字段序以上游序列化器（rep-item-schedule-info-fsrs.formatScheduleAsSRHtmlComment）为准
 */
function parseFsrsSegment(segment: string): WordSchedule | null {
    const parts = segment.split(",").map((p) => p.trim());
    if (parts.length !== 9) {
        return null;
    }
    const dueMs = Date.parse(parts[0]);
    if (!Number.isFinite(dueMs)) {
        return null;
    }
    const num = (v: string): number | null => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const interval = num(parts[1]);
    const stability = num(parts[2]);
    const difficulty = num(parts[3]);
    const state = num(parts[4]);
    const reps = num(parts[5]);
    const lapses = num(parts[6]);
    const learningSteps = num(parts[7]);
    if (
        interval === null || stability === null || difficulty === null ||
        state === null || reps === null || lapses === null
    ) {
        return null;
    }
    // lastReview 为 "-" 表示无记录
    const lastMs = parts[8] === "-" ? NaN : Date.parse(parts[8]);
    return {
        algorithm: "FSRS",
        due: Math.floor(dueMs / 1000),
        interval,
        stability,
        difficulty,
        state,
        reps,
        lapses,
        learningSteps: learningSteps ?? undefined,
        lastReview: Number.isFinite(lastMs) ? Math.floor(lastMs / 1000) : undefined,
    };
}

/**
 * 解析旧导出的 SR 复习文件（review_database.md）：
 * 逐 #word 块提取 expression（## 标题后的第一个非空行）与块内 <!--SR:...--> 调度。
 * 无注释的块 schedule 为 undefined。
 */
export function parseSrWords(md: string): { expression: string; schedule?: WordSchedule }[] {
    const lines = md.split(/\r?\n/);
    const blocks: { expression: string; schedule?: WordSchedule }[] = [];

    let inBlock = false;
    let seenHeading = false;
    let expression = "";
    let comment = "";

    const flush = () => {
        if (!inBlock || !expression) {
            return;
        }
        const match = comment.match(/<!--SR:(.*?)-->/);
        const schedule = match ? parseSrComment(match[1]) ?? undefined : undefined;
        blocks.push({ expression, schedule });
    };

    for (const line of lines) {
        if (line.trim() === "#word") {
            flush();
            inBlock = true;
            seenHeading = false;
            expression = "";
            comment = "";
            continue;
        }
        if (!inBlock) {
            continue;
        }
        if (!seenHeading && line.startsWith("## ")) {
            seenHeading = true;
            continue;
        }
        if (seenHeading && !expression) {
            if (line.trim().length > 0) {
                expression = line.trim();
            }
            continue;
        }
        if (line.includes("<!--SR:")) {
            comment += line;
        }
    }
    flush();

    return blocks;
}

/**
 * 手动迁移入口：解析 md → 按 expression 精确匹配库内词条 → 覆盖写调度。
 * 词已不在库中的跳过计数；可重复执行（覆盖写，无累积）。
 */
export async function migrateFromSr(drive: StorageDrive, md: string): Promise<SrMigrateResult> {
    const blocks = parseSrWords(md);
    let matched = 0;
    let skipped = 0;
    let withoutSchedule = 0;

    for (const block of blocks) {
        if (!block.schedule) {
            withoutSchedule++;
            continue;
        }
        const expr = await drive.getExpression(block.expression);
        if (!expr) {
            skipped++;
            continue;
        }
        await drive.putSchedule(block.expression, block.schedule);
        matched++;
    }
    return { total: blocks.length, matched, skipped, withoutSchedule };
}
