/**
 * Upper bound on how many file descriptors a single collection-wide scan
 * (keys/iterate/sanitize/clear) may hold open at once. Without a bound,
 * scanning a large collection fires one read per file simultaneously and
 * can exhaust the process fd limit long before graceful-fs kicks in.
 * 128 keeps a 100k-file scan fd-safe while hiding per-open latency.
 */
export declare const IO_LIMIT = 128;
/**
 * Array.map with a concurrency cap: at most `limit` invocations of `fn` are
 * in flight at any time, results keep their original positions, and the
 * returned promise rejects with the first failure.
 */
export declare const mapPool: <T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) => Promise<R[]>;
