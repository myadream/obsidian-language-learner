import { IStorageDriverExtended } from '../types';
/**
 * An empty index (the placeholder entry tedb keeps for an index with no keys)
 * should not persist a base file. Detected by parsing instead of comparing
 * serialized literals, which the old implementation did — it broke as soon as
 * whitespace or key order differed.
 * @param {string} index
 * @returns {boolean}
 */
export declare const indexCheck: (index: string) => boolean;
export declare const StoreIndex: (key: string, index: string, Storage: IStorageDriverExtended) => Promise<any>;
