/**
 * Byte-exact copy via the kernel (no userland read/parse/write round trip).
 *
 * Two deliberate behavior changes vs the old implementation:
 * - No JSON parseability gate. A backup must preserve the previous generation
 *   verbatim — corrupted or not — so the recovery paths (GetItem/Keys/Iterate)
 *   stay the only place that decides what "unusable" means.
 * - Any IO failure (including a missing source, e.g. the base file vanished
 *   between the caller's existence check and the copy) rejects, so callers
 *   abort the write instead of silently skipping the backup and breaking the
 *   "past is the previous generation of base" invariant.
 */
export declare const CopyFile: (src: string, dest: string) => Promise<null>;
