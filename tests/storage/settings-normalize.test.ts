import { describe, expect, it } from "vitest";
import { normalizeStorageSetting } from "@/storage/settings-normalize";

/**
 * 回归背景：老版本 data.json 的 storage.drive 缺少新增驱动（csv/tedb）的键，
 * 设置面板 storageSettings 直接 drive[type]["storage_path"] 取值，
 * 切换存储类型时抛 "Cannot read properties of undefined (reading 'storage_path')"，
 * display() 中断导致设置页下半部分（导入导出/销毁等）全部消失，路径输入框显示空白。
 */
describe("normalizeStorageSetting 存储配置归一化", () => {
    it("老配置缺少 csv/tedb 驱动键时补齐默认值（切换存储类型不再崩溃）", () => {
        const legacy = {
            storage_type: "sqlite",
            storage_name: "WordDB",
            drive: {
                api: { port: 8086, host: "127.0.0.1", use_server: false, api_key: "" },
                indexed: {},
                sqlite3: { storage_path: "my-storage" },
            },
        };
        const s = normalizeStorageSetting(legacy);
        // 设置面板按 drive[type][key] 直接取值，缺键即 TypeError
        expect(s.drive["csv"]["storage_path"]).toBe("storage");
        expect(s.drive["tedb"]["storage_path"]).toBe("storage");
        expect(s.drive["tedb"]["durability"]).toBe("relaxed");
        // 用户已有自定义值必须保留
        expect(s.drive["sqlite3"]["storage_path"]).toBe("my-storage");
    });

    it("drive 缺失或形态非法时全部给默认值", () => {
        for (const drive of [undefined, null, "x", 42]) {
            const s = normalizeStorageSetting({ drive });
            expect(s.drive["sqlite3"]["storage_path"]).toBe("storage");
            expect(s.drive["csv"]["storage_path"]).toBe("storage");
            expect(s.drive["tedb"]["storage_path"]).toBe("storage");
            expect(s.drive["indexed"]).toEqual({});
        }
    });

    it("被清空的 storage_path 回填默认值（切换后路径不再显示空白）", () => {
        for (const bad of ["", "   "]) {
            const s = normalizeStorageSetting({
                storage_type: "csv",
                drive: { csv: { storage_path: bad } },
            });
            expect(s.drive["csv"]["storage_path"]).toBe("storage");
        }
    });

    it("storage_type 非法（含遗留 api）时回退 indexed，与 provider 兜底一致", () => {
        for (const type of ["api", "mongodb", "", undefined, null, 123]) {
            const s = normalizeStorageSetting({ storage_type: type } as never);
            expect(s.storage_type).toBe("indexed");
        }
        expect(normalizeStorageSetting({ storage_type: "tedb" }).storage_type).toBe("tedb");
        expect(normalizeStorageSetting({ storage_type: "sqlite" }).storage_type).toBe("sqlite");
    });

    it("tedb durability 只允许 strict/relaxed", () => {
        expect(normalizeStorageSetting({ drive: { tedb: { durability: "fast" } } }).drive["tedb"]["durability"]).toBe("relaxed");
        expect(normalizeStorageSetting({ drive: { tedb: { durability: "strict" } } }).drive["tedb"]["durability"]).toBe("strict");
        expect(normalizeStorageSetting({ drive: { tedb: {} } }).drive["tedb"]["durability"]).toBe("relaxed");
    });

    it("storage_name 空/缺省回退 WordDB，用户值保留", () => {
        expect(normalizeStorageSetting({}).storage_name).toBe("WordDB");
        expect(normalizeStorageSetting({ storage_name: "  " }).storage_name).toBe("WordDB");
        expect(normalizeStorageSetting({ storage_name: "My DB" }).storage_name).toBe("My DB");
    });

    it("不修改传入对象，输出全新对象（防 DEFAULT_SETTINGS 共享引用污染）", () => {
        const input = {
            storage_type: "csv",
            storage_name: "WordDB",
            drive: { csv: { storage_path: "a" } },
        };
        const snapshot = JSON.stringify(input);
        const s = normalizeStorageSetting(input);
        s.drive["csv"]["storage_path"] = "changed";
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("保留未知驱动的配置键，saveData 不丢历史/未来数据", () => {
        const s = normalizeStorageSetting({ drive: { futuredb: { foo: 1 } } });
        expect(s.drive["futuredb"]).toEqual({ foo: 1 });
    });

    it("重复归一化幂等（保存→重载→再归一化结果稳定）", () => {
        const once = normalizeStorageSetting({
            storage_type: "tedb",
            drive: { sqlite3: { storage_path: "custom" } },
        });
        const twice = normalizeStorageSetting(JSON.parse(JSON.stringify(once)));
        expect(twice).toEqual(once);
    });

    it("各驱动路径相互独立，来回切换存储类型互不覆盖", () => {
        const s = normalizeStorageSetting({ storage_type: "sqlite", drive: {} });
        s.drive["sqlite3"]["storage_path"] = "custom-sqlite";
        s.drive["tedb"]["storage_path"] = "custom-tedb";
        // 切到 csv 后 csv 有自己的默认路径，sqlite/tedb 已存值不变
        expect(s.drive["csv"]["storage_path"]).toBe("storage");
        expect(s.drive["sqlite3"]["storage_path"]).toBe("custom-sqlite");
        expect(s.drive["tedb"]["storage_path"]).toBe("custom-tedb");
    });
});
