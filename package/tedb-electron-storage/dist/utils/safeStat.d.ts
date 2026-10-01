import { Stats } from 'graceful-fs';
export declare const safeStat: (path: string | Buffer) => Promise<Stats | boolean>;
