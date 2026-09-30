import { moment } from "obsidian";

/**
 * 把各种形态的时间值统一为 UNIX 秒：
 * - number 直接用；数字字符串转数字；日期字符串（如 "YYYY-MM-DD HH:mm:ss"）经 moment 解析；
 * - 解析失败或缺省时回退 fallback（默认当前时间）。
 * 导入文件里的 date 可能是历史导出的文本日期，也可能是 UNIX 秒，驱动写入前都必须归一化。
 */
export function toUnixSeconds(
    v: number | string | undefined | null,
    fallback?: number
): number {
    const fb = fallback ?? moment().unix();
    if (typeof v === "number" && Number.isFinite(v)) {
        return Math.floor(v);
    }
    if (typeof v === "string") {
        const s = v.trim();
        if (!s) return fb;
        if (/^-?\d+$/.test(s)) return parseInt(s, 10);
        const parsed = moment(s);
        if (parsed.isValid()) return parsed.unix();
    }
    return fb;
}
