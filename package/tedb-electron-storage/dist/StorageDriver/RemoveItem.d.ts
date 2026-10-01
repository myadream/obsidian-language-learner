import { IStorageDriverExtended } from '../types';
/**
 * Main method
 * removing an item should also remove the backup.
 * @param {string} key
 * @param {IStorageDriverExtended} Storage
 * @returns {Promise<any>}
 * @constructor
 */
export declare const RemoveItem: (key: string, Storage: IStorageDriverExtended) => Promise<any>;
