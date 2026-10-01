import { TDurability } from '../types';
/**
 * Crash-safe file write: the data is written to a uniquely named sibling temp
 * file, flushed to disk, then atomically renamed over the target. A crash or
 * power loss mid-write can only leave behind a stale temp file — readers never
 * observe a truncated or empty data file, which is what the old truncate-and-
 * write approach could produce. Temp file names never end in ".db" so
 * collection scans ignore any leftovers.
 *
 * `durability: 'relaxed'` skips the fsyncs (file + directory) while keeping
 * the atomic rename: writes stay tear-free but a power loss may drop the most
 * recent ones.
 */
export declare const SafeWrite: (filename: string, data: string | Buffer | Uint8Array, durability?: TDurability) => Promise<null>;
