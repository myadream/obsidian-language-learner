/** 调度间隔的人类可读格式（评分按钮预览用） */
export function formatInterval(days: number): string {
    if (days <= 0) {
        return "now"; // Again / FSRS 短期：立即重学
    }
    if (days < 1) {
        return `${Math.max(1, Math.round(days * 24))}h`;
    }
    if (days < 30) {
        return `${Math.round(days)}d`;
    }
    if (days < 365) {
        return `${(days / 30).toFixed(1)}mo`;
    }
    return `${(days / 365).toFixed(1)}y`;
}
