import { IStorageDriverExtended } from '../types';
/**
 * Main method
 * Keys is a method that should return all the file keys
 * The storage Driver does hold the keys in memory but many occurrences
 * may remove a file from the file system and not remove the key from the
 * Storage driver
 * @param {IStorageDriverExtended} Storage
 * @returns {Promise<any>}
 * @constructor
 */
export declare const Keys: (Storage: IStorageDriverExtended) => Promise<any>;
