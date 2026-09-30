import { MemVaultAdapter } from "./mem-adapter";
import { IndexedStorageDrive } from "@/storage/drive/Indexed/handler";
import { Sqlite3StorageDrive } from "@/storage/drive/sqlite3/handle";
import { CsvStorageDrive } from "@/storage/drive/csv/handle";
import { TedbStorageDrive } from "@/storage/drive/tedb/handle";
import StorageDrive from "@/storage/drive";

export const MANIFEST_ID = "obsidian-language-learner";

export interface DriveFixture {
    drive: StorageDrive;
    adapter: MemVaultAdapter;
    storageName: string;
}

let nameCounter = 0;

export interface MakeDriveOptions {
    /** 复用已有 adapter（用于持久化/迁移测试） */
    adapter?: MemVaultAdapter;
    /** 指定数据库名（用于预置旧数据库的测试） */
    storageName?: string;
    /** tedb durability 等级（默认 relaxed，测试更快） */
    durability?: "strict" | "relaxed";
}

/**
 * 构造一个带独立内存文件系统/独立 IndexedDB 的存储驱动实例。
 * type: "indexed" | "sqlite" | "csv" | "tedb"
 */
export async function makeDrive(
    type: "indexed" | "sqlite" | "csv" | "tedb",
    opts: MakeDriveOptions = {}
): Promise<DriveFixture> {
    const adapter = opts.adapter || new MemVaultAdapter();
    const storageName =
        opts.storageName || `TestDB_${type}_${++nameCounter}_${Date.now()}`;

    const plugin: any = {
        manifest: { id: MANIFEST_ID },
        app: { vault: { adapter } },
        settings: {
            storage: {
                storage_type: type,
                storage_name: storageName,
                drive: {
                    indexed: {},
                    sqlite3: { storage_path: "storage" },
                    csv: { storage_path: "storage" },
                    tedb: {
                        storage_path: "storage",
                        durability: opts.durability || "relaxed",
                    },
                },
            },
        },
    };

    let drive: StorageDrive;
    if (type === "indexed") {
        drive = new IndexedStorageDrive(plugin);
    } else if (type === "csv") {
        drive = new CsvStorageDrive(plugin);
    } else if (type === "tedb") {
        drive = new TedbStorageDrive(plugin);
    } else {
        adapter.provideSqlWasm(MANIFEST_ID);
        drive = new Sqlite3StorageDrive(plugin);
    }

    await drive.open();
    return { drive, adapter, storageName };
}
