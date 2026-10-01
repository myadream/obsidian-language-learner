import { IStorageDriverExtended } from '../types';
/**
 * Base method
 * Test if the base file IE the current file exists
 * if So -> test if the location is readable
 * if Not -> does the backup dir exist?
 *  if So -> test backup if readable
 *  if Not -> resolve nothing
 * @param {string} key
 * @param {IStorageDriverExtended} Storage
 * @returns {Promise<any>}
 * @constructor
 */
export declare const GetItem: (key: string, Storage: IStorageDriverExtended) => Promise<any>;
