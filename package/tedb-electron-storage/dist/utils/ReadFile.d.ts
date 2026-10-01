import { Stats } from 'graceful-fs';
import { IsafeReadFileOptions } from './index';
export declare const ReadFile: (path: string, stats: Stats, options?: IsafeReadFileOptions) => Promise<string | null>;
