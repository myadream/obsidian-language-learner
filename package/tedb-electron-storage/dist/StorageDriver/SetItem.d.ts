import { IStorageDriverExtended, TDurability } from '../types';
export declare const makeDirCopy: (base: string, dir: string, data: any, durability?: TDurability) => Promise<any>;
export declare const backupDirWrite: (base: string, dir: string, data: any, durability?: TDurability) => Promise<any>;
/**
 * Main method
 * When setting an item it will check to see that the data can be converted back and forth
 * from string to an object before trying to write. It will also move current file
 * to the past location if the current file already exists. If not the current and past
 * will be written with the current data. This should only happen once unless both files
 * are removed.
 * @param {string} key
 * @param value
 * @param {IStorageDriverExtended} Storage
 * @returns {Promise<any>}
 * @constructor
 */
export declare const SetItem: (key: string, value: any, Storage: IStorageDriverExtended) => Promise<any>;
