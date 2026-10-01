export interface IAppendFileOptions {
    encoding?: BufferEncoding | null;
    mode?: number;
    flag?: string;
}
export declare const AppendFile: (file: string | Buffer | number, data: string | Buffer, options?: IAppendFileOptions) => Promise<null>;
