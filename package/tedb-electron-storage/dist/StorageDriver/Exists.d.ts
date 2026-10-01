import { IStorageDriverExtended, Isanitize, Iexist } from '../types';
/**
 * Should act as a find where if an item does not exist check the backup file
 * If the backup exists replace if parsable. If unparsable remove backup
 * and send back that the file does not exist.
 *
 * Should only remove files if intended to send back false
 * @param {Isanitize} obj
 * @param index
 * @param {string} fieldName
 * @param {IStorageDriverExtended} Storage
 * @returns {Promise<Iexist>}
 * @constructor
 */
export declare const Exists: (obj: Isanitize, index: any, fieldName: string, Storage: IStorageDriverExtended) => Promise<Iexist>;
