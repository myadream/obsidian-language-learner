import { StorageProviderDriveType } from "./provider";

/** 本地文件类驱动的默认库内目录（sqlite3/csv/tedb 共用） */
export const DEFAULT_DRIVE_STORAGE_PATH = "storage";

/**
 * 各驱动的默认配置（键为 settings.storage.drive 的配置键，注意 sqlite 类型
 * 的配置键是 "sqlite3" 而枚举值是 "sqlite"）。新增驱动时必须在这里登记，
 * loadSettings 归一化后 drive 才保证每个驱动键齐全，设置面板与驱动实现
 * 可以直接 drive[type][key] 取值。
 */
export const DRIVE_DEFAULTS: Record<string, Record<string, any>> = {
    api: { port: 8086, host: "127.0.0.1", use_server: false, api_key: "" },
    indexed: {},
    sqlite3: { storage_path: DEFAULT_DRIVE_STORAGE_PATH },
    csv: { storage_path: DEFAULT_DRIVE_STORAGE_PATH },
    tedb: { storage_path: DEFAULT_DRIVE_STORAGE_PATH, durability: "relaxed" },
};

// 合法可选的存储类型。遗留 "api" 已停用（provider.register 对它的兜底就是
// 回退 indexed），归一化后统一落到 indexed，设置下拉框才能正确显示当前值
const DRIVE_TYPES = new Set<string>([
    StorageProviderDriveType.INDEXED,
    StorageProviderDriveType.SQLITE,
    StorageProviderDriveType.CSV,
    StorageProviderDriveType.TEDB,
]);

const DEFAULT_STORAGE_NAME = "WordDB";

/**
 * 归一化 settings.storage（loadSettings 专用，纯函数）：
 * - 老版本 data.json 缺少新增驱动（csv/tedb）的键时补默认值，切换存储类型
 *   不再因 drive[type] undefined 抛 "reading 'storage_path'" 崩溃；
 * - 被清空成 ""/空白 的 storage_path 回填默认值，路径输入框不再显示空白；
 * - storage_type 非法（含遗留 "api"）回退 indexed，与 provider.register 兜底一致；
 * - 输出全新对象且不改传入对象，避免 DEFAULT_SETTINGS.storage 被共享引用污染。
 * 未知驱动键原样保留，saveData 不丢历史数据。
 */
export function normalizeStorageSetting(saved: any) {
    const src = saved !== null && typeof saved === "object" ? saved : {};
    const savedDrive =
        src.drive !== null && typeof src.drive === "object" ? src.drive : {};

    const drive: Record<string, Record<string, any>> = {};
    for (const key of Object.keys(DRIVE_DEFAULTS)) {
        const config = Object.assign({}, DRIVE_DEFAULTS[key]);
        const savedConfig = savedDrive[key];
        if (savedConfig !== null && typeof savedConfig === "object") {
            Object.assign(config, savedConfig);
        }
        if (typeof config.storage_path === "string" && !config.storage_path.trim()) {
            config.storage_path = DRIVE_DEFAULTS[key].storage_path;
        }
        if (key === "tedb" && config.durability !== "strict") {
            config.durability = "relaxed";
        }
        drive[key] = config;
    }
    for (const key of Object.keys(savedDrive)) {
        if (!(key in drive)) {
            drive[key] = savedDrive[key];
        }
    }

    const storageType =
        typeof src.storage_type === "string" && DRIVE_TYPES.has(src.storage_type)
            ? src.storage_type
            : StorageProviderDriveType.INDEXED;
    const storageName =
        typeof src.storage_name === "string" && src.storage_name.trim()
            ? src.storage_name
            : DEFAULT_STORAGE_NAME;

    return { storage_type: storageType, storage_name: storageName, drive };
}
