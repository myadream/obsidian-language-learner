import { IStorageDriverExtended } from '../types';
/**
 * Main method
 * removing an index should also remove its backup
 * @param {string} key
 * @param {IStorageDriverExtended} Storage
 * @returns {Promise<any>}
 * @constructor
 */
export declare const RemoveIndex: (key: string, Storage: IStorageDriverExtended) => Promise<any>;
