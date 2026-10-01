/**
 * Serializes asynchronous operations per key.
 *
 * Operations queued with the same key run strictly in submission order,
 * operations with different keys run in parallel. The internal chain tail
 * never rejects, so one failed operation does not block the operations
 * queued behind it, while the promise returned to the caller still
 * propagates that operation's own result or failure.
 */
export declare class KeyedQueue {
    private readonly chains;
    enqueue<T>(key: string, operation: () => Promise<T>): Promise<T>;
    /**
     * Resolves once every operation that was queued at call time has settled.
     * Used as a barrier before whole-collection actions such as clear().
     */
    pending(): Promise<null>;
}
