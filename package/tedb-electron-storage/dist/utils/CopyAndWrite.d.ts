import { TDurability } from '../types';
/**
 * Used to copy a file and then write to the src new data.
 * @param {string} dest
 * @param {string} src
 * @param data
 * @param {TDurability} durability
 * @returns {Promise<any>}
 * @constructor
 */
export declare const CopyAndWrite: (src: string, dest: string, data: any, durability?: TDurability) => Promise<any>;
