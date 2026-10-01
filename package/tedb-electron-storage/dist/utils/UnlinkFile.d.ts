/**
 * Delete a file, tolerating a missing file (ENOENT) so "delete if exists"
 * call sites stay simple. Every other error rejects — the old implementation
 * resolved unconditionally, hiding real failures such as EPERM on Windows.
 */
export declare const UnlinkFile: (path: string | Buffer) => Promise<null>;
