import Plugin from "@/plugin";
import StorageDrive from "./drive";
// import { ApiStorageDrive } from './drive/api/handler';
import { IndexedStorageDrive } from './drive/Indexed/handler';
import {Sqlite3StorageDrive} from "@/storage/drive/sqlite3/handle";
import {CsvStorageDrive} from "@/storage/drive/csv/handle";
import {TedbStorageDrive} from "@/storage/drive/tedb/handle";
import {Platform} from "obsidian";

export class StorageProvider {

    private plugin: Plugin = null;
    private useConnect: StorageDrive = null;

    public constructor(plugin: Plugin) {
        this.syncSetting(plugin)
    }

    public syncSetting(plugin: Plugin): StorageProvider {
        this.plugin = plugin;
        return this
    }

    public DB(): StorageDrive | null {
        return this.useConnect;
    }

    public async drive(drive: string): Promise<StorageDrive> {
        await this.destroyed();

        this.useConnect = this.register(drive);

        await this.useConnect.open();

        return this.useConnect;
    }

    // 销毁所有服务；等待驱动把未落盘的延迟写入刷完，避免重开/卸载丢数据
    public async destroyed(): Promise<void> {
        if (this.useConnect) {
            await this.useConnect.close();
            this.useConnect = null;
        }
    }

    public sync(plugin: Plugin) {
        this.syncSetting(plugin)
        this.reRegister(plugin.settings.storage.storage_type);
    }

    public async reRegister(drive: string): Promise<StorageDrive> {
        return await this.drive(drive);
    }

    private register(drive: string): StorageDrive {
        switch (drive) {
            // API 驱动暂未启用；老配置残留 "api" 时回退到 IndexedDB，避免启动崩溃
            // case StorageProviderDriveType.API:
                // return new ApiStorageDrive(
                //     this.plugin.settings.storage.drive["api"]["host"],
                //     this.plugin.settings.storage.drive["api"]["port"],
                //     this.plugin.settings.storage.drive["api"]["use_https"],
                //     this.plugin.settings.storage.drive["api"]["api_key"],
                // );
            case StorageProviderDriveType.SQLITE:
                return new Sqlite3StorageDrive(this.plugin);
            case StorageProviderDriveType.CSV:
                return new CsvStorageDrive(this.plugin);
            case StorageProviderDriveType.TEDB:
                // tedb 依赖 Node fs（window.require），仅桌面端可用；
                // 移动端选择该类型时回退 IndexedDB，open() 内还有二次兜底
                if (!Platform.isDesktopApp) {
                    console.warn(
                        "[StorageProvider] tedb storage is desktop-only, falling back to indexed"
                    );
                    break;
                }
                return new TedbStorageDrive(this.plugin);
            case StorageProviderDriveType.INDEXED:
            default:
                if (drive !== StorageProviderDriveType.INDEXED) {
                    console.warn(
                        `[StorageProvider] unknown or disabled storage drive "${drive}", falling back to indexed`
                    );
                }
                return new IndexedStorageDrive(this.plugin);
        }
    }
}

export enum StorageProviderDriveType {
    API = 'api',
    INDEXED = 'indexed',
    SQLITE = 'sqlite',
    CSV = 'csv',
    TEDB = 'tedb',
}
