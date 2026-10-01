export interface IsafeReadFileOptions {
    encoding?: BufferEncoding | null;
    flag?: string;
}
/**
 * Read a file, resolving `false` only when the file does not exist.
 * Any other error (EACCES, EISDIR, ...) is rejected so callers can
 * distinguish "missing" from "unreadable" — the old implementation
 * silently reported every error on non-darwin platforms as "missing".
 */
export declare const safeReadFile: (path: string, options?: IsafeReadFileOptions) => Promise<any>;
