import { TDurability } from '../types';
/**
 * Main method
 * Write data to past and current location
 * @param {string} fileLocation
 * @param {any} returnMany
 * @param {string} baseLocation
 * @param data
 * @param {TDurability} durability
 * @returns {Promise<any>}
 * @constructor
 */
export declare const WriteNewPastandBase: (fileLocation: string, returnMany: any, baseLocation: string, data: any, durability?: TDurability) => Promise<any>;
