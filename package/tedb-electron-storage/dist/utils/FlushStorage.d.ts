export interface IFlushStorageOptions {
    filename: string;
    isDir: boolean;
}
export declare const FlushStorage: (options: string | IFlushStorageOptions) => Promise<null>;
