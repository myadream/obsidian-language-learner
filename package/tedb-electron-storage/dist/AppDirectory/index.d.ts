export interface IAppDirectory {
    col: string;
    platform: string;
    userData: () => string;
}
export declare class AppDirectory implements IAppDirectory {
    col: string;
    platform: string;
    dir: string | null;
    constructor(colName: string, dir: string | null);
    userData(): any;
}
