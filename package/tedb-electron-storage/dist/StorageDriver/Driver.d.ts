import { IStorageDriverExtended, Iexist, Isanitize, TDurability, IElectronStorageOptions } from '../types';
import { KeyedQueue } from '../utils';
import { AppDirectory } from '../AppDirectory/index';
export declare class ElectronStorage implements IStorageDriverExtended {
    allKeys: string[];
    allKeysSet: Set<string>;
    collectionPath: string;
    version: string;
    collection: string;
    dbName: string;
    durability: TDurability;
    lazyBackup: boolean;
    appDirectory: AppDirectory;
    operationQueue: KeyedQueue;
    /**
     * @param {string} db - database name (top level directory under the data dir)
     * @param {string} collection - collection name (sub directory of db)
     * @param {string} [dir] - optional custom data directory; defaults to the
     *        OS user-data location (e.g. ~/AppData/Local/<db> on Windows)
     * @param {IElectronStorageOptions} [options] - `durability: 'strict'` (default)
     *        fsyncs every write; `'relaxed'` skips fsyncs but keeps atomic
     *        renames — tear-free, faster, may lose the last writes on power loss.
     *        `lazyBackup` (default true) creates the past backup on a key's first
     *        update instead of its first write; `false` restores the legacy
     *        first-write-duplicates behavior
     */
    constructor(db: string, collection: string, dir?: string | null, options?: IElectronStorageOptions);
    /**
     * Record a persisted key. O(1) via the Set mirror; the array is kept for
     * order-stable public access to allKeys.
     */
    trackKey(key: string): void;
    /**
     * Drop a key after its files are gone. The Set guard makes repeats and
     * never-tracked keys no-ops without rescanning the array.
     */
    untrackKey(key: string): void;
    /**
     * Create the on-disk skeleton for this collection. Safe to call again
     * after clear() wiped the directory. `version` keeps its leading backtick
     * on purpose: it is the on-disk layout marker that collection scans
     * (Keys/Iterate/CollectionSanitize) filter on.
     */
    private ensureDirs;
    setItem(key: string, value: any): Promise<any>;
    getItem(key: string): Promise<any>;
    removeItem(key: string): Promise<null>;
    storeIndex(key: string, index: string): Promise<any>;
    fetchIndex(key: string): Promise<any[]>;
    removeIndex(key: string): Promise<null>;
    iterate(iteratorCallback: (value: any, key: string, iteratorNumber?: number) => any): Promise<any>;
    keys(): Promise<string[]>;
    exists(obj: Isanitize, index: any, fieldName: string): Promise<Iexist>;
    collectionSanitize(keys: string[]): Promise<null>;
    clear(): Promise<null>;
}
