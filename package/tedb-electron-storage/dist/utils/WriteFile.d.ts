export interface IWriteFileOptions {
    encoding?: BufferEncoding | null;
    mode?: number;
    flag?: string;
}
export declare const WriteFile: (file: string | Buffer | number, data: string | Buffer | Uint8Array, options?: IWriteFileOptions) => Promise<null>;
