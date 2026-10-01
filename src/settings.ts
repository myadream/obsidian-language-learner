import {App, Modal, Notice, PluginSettingTab, Setting, debounce} from "obsidian";

// import Server from "./api/server";
import LanguageLearner from "./plugin";
import {t} from "./lang/helper";
import enLocale from "./lang/locale/en";
import {WarningModal, ImportFormatModal, ExportFormatModal} from "./modals"
import {importFromFile, exportToFile} from "./storage/transfer"
import {dicts} from "@dict/list";
import {LANGS} from "./langs";
import store from "./store";
import { StorageProviderDriveType } from "./storage/provider";
import { DEFAULT_DRIVE_STORAGE_PATH } from "./storage/settings-normalize";
import {ExpressionInfoSimple} from "@/storage/interface";
import { migrateFromSr } from "./review/migrate-from-sr";

/** 从 SR 文件迁移复习进度的确认弹框：可改路径，确认后解析 <!--SR:...--> 回填 schedules */
class SrMigrateModal extends Modal {
    constructor(private plugin: LanguageLearner) {
        super(plugin.app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: t("Migrate SR Progress") });
        contentEl.createEl("p", { text: t("SR migration confirm") });

        const input = contentEl.createEl("input", {
            type: "text",
            value: this.plugin.settings.review_database,
        });
        input.classList.add("langr-migrate-path-input");
        input.style.width = "100%";

        const btnRow = contentEl.createDiv();
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "12px";

        const cancel = btnRow.createEl("button", { text: t("Cancel") });
        cancel.onclick = () => this.close();

        const confirm = btnRow.createEl("button", {
            text: t("Migrate"),
            cls: "mod-cta",
        });
        confirm.onclick = async () => {
            const path = input.value.trim();
            if (!path) {
                this.close();
                return;
            }
            this.plugin.settings.review_database = path;
            await this.plugin.saveSettings();

            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (!file || "children" in file) {
                new Notice(t("SR file not found: {0}", path));
                return;
            }
            try {
                const md = await this.plugin.app.vault.read(file as any);
                const result = await migrateFromSr(this.plugin.storage.DB(), md);
                new Notice(t(
                    "Migrated: {0} matched, {1} skipped, {2} without SR record",
                    result.matched, result.skipped, result.withoutSchedule,
                ));
                this.close();
            } catch (e) {
                console.error("[SR migrate] failed", e);
                new Notice(t("SR migration failed: {0}", String(e)));
            }
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

export interface MyPluginSettings {
    self_server: boolean;
    self_port: number;
    // lang
    native: string;
    foreign: string;
    // search
    popup_search: boolean;
    auto_pron: boolean;
    function_key: "ctrlKey" | "altKey" | "metaKey" | "disable";
    dictionaries: { [K in string]: { enable: boolean, priority: number; } };
    dict_height: string;
    // reading
    word_count: boolean;
    default_paragraphs: string;
    font_size: string;
    font_family: string;
    line_height: string;
    use_machine_trans: boolean;

    storage: StorageSetting;

    // SR 迁移源文件：旧复习导出文件路径，作为"从 SR 文件迁移复习进度"的源
    review_database: string;
    // review
    review_prons: "0" | "1";
    review_algorithm: "FSRS" | "SM-2";
    review_fsrs_retention: number;
    review_sm2_base_ease: number;
    review_sm2_easy_bonus: number;
    review_sm2_lapse_factor: number;
    review_maximum_interval: number;
}

export interface StorageSetting {
    storage_type: StorageProviderDriveType,

    storage_name: string;

    // 驱动配置
    drive: { [K in string]: any };
}

// 存储 drive 配置的键与枚举值不同（sqlite 类型的配置键是 "sqlite3"）
const DRIVE_CONFIG_KEY: Record<string, string> = {
    [StorageProviderDriveType.SQLITE]: "sqlite3",
    [StorageProviderDriveType.CSV]: "csv",
    [StorageProviderDriveType.TEDB]: "tedb",
    [StorageProviderDriveType.INDEXED]: "indexed",
    [StorageProviderDriveType.API]: "api",
};

// 带库内目录表单的本地文件类驱动；sqlite/csv/tedb 表单待遇一致
const LOCAL_DIR_TYPES = [
    StorageProviderDriveType.SQLITE,
    StorageProviderDriveType.CSV,
    StorageProviderDriveType.TEDB,
];

// 各驱动 Database Dir 表单的描述文案（sqlite 无描述）
type DirDescKey =
    | "CSV files are stored under this vault folder"
    | "TeDB data files are stored under this vault folder (desktop only)";

const DIR_DESC: Partial<Record<StorageProviderDriveType, DirDescKey>> = {
    [StorageProviderDriveType.CSV]: "CSV files are stored under this vault folder",
    [StorageProviderDriveType.TEDB]: "TeDB data files are stored under this vault folder (desktop only)",
};

const DEFAULT_STORAGE_PATH = DEFAULT_DRIVE_STORAGE_PATH;

export const DEFAULT_SETTINGS: MyPluginSettings = {

    self_server: false,
    self_port: 3002,
    // lang
    native: "zh",
    foreign: "en",
    // search
    popup_search: true,
    auto_pron: true,
    function_key: "ctrlKey",
    dictionaries: {
        "youdao": {enable: true, priority: 1},
        "cambridge": {enable: true, priority: 2},
        "hjdict": {enable: true, priority: 3},
        "deepl": {enable: true, priority: 4},
    },
    dict_height: "250px",

    // storage
    storage: {
        storage_type: StorageProviderDriveType.INDEXED,
        storage_name: "WordDB",
        drive: {
            "api": {
                port: 8086,
                host: "127.0.0.1",
                use_server: false,
                api_key: "",
            },
            "indexed": {
            },
            "sqlite3":{
                storage_path: "storage",
            },
            "csv": {
                storage_path: "storage",
            },
            "tedb": {
                storage_path: "storage",
                // relaxed 跳过 fsync 保留原子写（快约 2~3 倍）；strict 每写都 fsync
                durability: "relaxed",
            },

        }
    },

    // SR 迁移源
    review_database: "",
    // reading
    default_paragraphs: "4",
    font_size: "15px",
    font_family: '"Times New Roman"',
    line_height: "1.8em",
    use_machine_trans: true,
    word_count: true,
    // review
    review_prons: "0",
    review_algorithm: "FSRS",
    review_fsrs_retention: 0.9,
    review_sm2_base_ease: 250,
    review_sm2_easy_bonus: 1.3,
    review_sm2_lapse_factor: 0.5,
    review_maximum_interval: 36525,
};

export class SettingTab extends PluginSettingTab {
    plugin: LanguageLearner;

    constructor(app: App, plugin: LanguageLearner) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const {containerEl} = this;

        containerEl.empty();
        containerEl.createEl("h1", {text: "Settings for Language Learner"});

        this.langSettings(containerEl);
        this.querySettings(containerEl);
        this.storageSettings(containerEl);
        // 复习调度紧随存储设置（SR 迁移源也在该组），相关设置聚在一起
        this.reviewSettings(containerEl);
        this.readingSettings(containerEl);
        // this.selfServerSettings(containerEl);
    }

    /**
     * 驱动配置自愈读取：键缺失或形态非法时就地补空对象再返回。
     * 正常情况下 loadSettings 的归一化已保证每个驱动键齐全，这里兜底
     * 异常数据（如被外部编辑过的 data.json），保证设置页永不因缺键崩溃。
     */
    private driveConfig(storageType: StorageProviderDriveType): Record<string, any> {
        const drive = this.plugin.settings.storage.drive;
        const key = DRIVE_CONFIG_KEY[storageType] || storageType;
        if (!drive[key] || typeof drive[key] !== "object") {
            drive[key] = {};
        }
        return drive[key];
    }

    langSettings(containerEl: HTMLElement) {
        containerEl.createEl("h3", {text: t("Language")});

        new Setting(containerEl)
            .setName(t("Native"))
            .addDropdown(native => {
                for (const lang of LANGS) {
                    native.addOption(lang.code, t(lang.nameKey as keyof typeof enLocale));
                }
                native
                    .setValue(this.plugin.settings.native)
                    .onChange(async (value) => {
                        this.plugin.settings.native = value;
                        await this.plugin.saveSettings();
                        this.display();
                    });
                return native;
            }
            );

        new Setting(containerEl)
            .setName(t("Foreign"))
            .addDropdown(foreign => {
                for (const lang of LANGS) {
                    foreign.addOption(lang.code, t(lang.nameKey as keyof typeof enLocale));
                }
                foreign
                    .setValue(this.plugin.settings.foreign)
                    .onChange(async (value) => {
                        this.plugin.settings.foreign = value;
                        await this.plugin.saveSettings();
                        this.display();
                    });
                return foreign;
            }
            );

    }

    querySettings(containerEl: HTMLElement) {
        containerEl.createEl("h3", {text: t("Translate")});

        new Setting(containerEl)
            .setName(t("Popup Search Panel"))
            .setDesc(t("Use a popup search panel"))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.popup_search)
                .onChange(async (value) => {
                    this.plugin.settings.popup_search = value;
                    this.plugin.store.popupSearch = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t("Auto pronounce"))
            .setDesc(t("Auto pronounce when searching"))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.auto_pron)
                .onChange(async (value) => {
                    this.plugin.settings.auto_pron = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t("Word Select"))
            .setDesc(t("Press function key and select text to translate"))
            .addDropdown(funcKey => funcKey
                .addOption("ctrlKey", "Ctrl")
                .addOption("altKey", "Alt")
                .addOption("metaKey", "Meta")
                .addOption("disable", t("Disable"))
                .setValue(this.plugin.settings.function_key)
                .onChange(async (value: "ctrlKey" | "altKey" | "metaKey" | "disable") => {
                    this.plugin.settings.function_key = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl("h4", {text: t("Dictionaries")});

        const createDictSetting = (id: string, name: string, description: string) => {
            new Setting(containerEl)
                .setName(name)
                .setDesc(description)
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.dictionaries[id].enable)
                    .onChange((value) => {
                        this.plugin.settings.dictionaries[id].enable = value;
                        this.plugin.store.dictsChange = !this.plugin.store.dictsChange;
                        this.plugin.saveSettings();
                    }))
                .addDropdown(num => num
                    .addOption("1", "1")
                    .addOption("2", "2")
                    .addOption("3", "3")
                    .addOption("4", "4")
                    .addOption("5", "5")
                    .addOption("6", "6")
                    .addOption("7", "7")
                    .addOption("8", "8")
                    .addOption("9", "9")
                    .addOption("10", "10")
                    .setValue(this.plugin.settings.dictionaries[id].priority.toString())
                    .onChange(async (value: string) => {
                        this.plugin.settings.dictionaries[id].priority = parseInt(value);
                        this.plugin.store.dictsChange = !this.plugin.store.dictsChange;
                        await this.plugin.saveSettings();
                    })
                );
        };

        Object.keys(dicts).forEach((dict: keyof typeof dicts) => {
            // 当前母语下不可用的词典不展示设置项
            if (!dicts[dict].nativeLangs.includes(this.plugin.settings.native)) {
                return;
            }
            createDictSetting(dict, dicts[dict].name, dicts[dict].description(this.plugin.settings.native));
        });

        new Setting(containerEl)
            .setName(t("Dictionary Height"))
            .addText(text => text
                .setValue(this.plugin.settings.dict_height)
                .onChange(debounce(async (value) => {
                    this.plugin.settings.dict_height = value;
                    store.dictHeight = value;
                    await this.plugin.saveSettings();
                }, 500))
            );
    }


    storageSettings(containerEl: HTMLElement) {
        containerEl.createEl("h3", {text: t("IndexDB Database")});

        new Setting(containerEl)
            .setName(t("Database Type"))
            .addDropdown(funcKey => funcKey
                .addOption(StorageProviderDriveType.INDEXED, StorageProviderDriveType.INDEXED)
                .addOption(StorageProviderDriveType.SQLITE, StorageProviderDriveType.SQLITE)
                .addOption(StorageProviderDriveType.CSV, StorageProviderDriveType.CSV)
                .addOption(StorageProviderDriveType.TEDB, StorageProviderDriveType.TEDB)
                .setValue(this.plugin.settings.storage.storage_type)
                .onChange(async (value: StorageProviderDriveType) => {
                    this.plugin.settings.storage.storage_type = value;
                    this.plugin.storage.sync(this.plugin);

                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        new Setting(containerEl)
            .setName(t("Database Name"))
            .setDesc(t("Reopen DB after changing database name"))
            .addText(text => text
                .setValue(this.plugin.settings.storage.storage_name)
                .onChange(debounce(async (name) => {
                    this.plugin.settings.storage.storage_name = name;
                    this.plugin.storage.sync(this.plugin);

                    await this.plugin.saveSettings();
                }, 1000, true))
            )
            .addButton(button => button
                .setButtonText(t("Reopen"))
                .onClick(async () => {
                    await this.plugin.storage.reRegister(this.plugin.settings.storage.storage_type);
                    new Notice("DB is Reopened");
                })
            );


        // 本地文件类驱动（sqlite/csv/tedb）共用同一套 Database Dir 表单；
        // driveConfig 内部自愈缺失键，切换存储类型后不会因 drive[type] undefined
        // 抛 "reading 'storage_path'" 而中断 display()（下半个设置页随之消失）
        const storageType = this.plugin.settings.storage.storage_type;
        if (LOCAL_DIR_TYPES.includes(storageType)) {
            const config = this.driveConfig(storageType);
            const dirSetting = new Setting(containerEl).setName(t("Database Dir"));
            const desc = DIR_DESC[storageType];
            if (desc) {
                dirSetting.setDesc(t(desc));
            }
            dirSetting.addText(text => text
                .setValue(config.storage_path || DEFAULT_STORAGE_PATH)
                .onChange(debounce(async (path) => {
                    // 输入被清空时落默认值，避免持久化空路径
                    config.storage_path = path.trim() || DEFAULT_STORAGE_PATH;
                    this.plugin.storage.sync(this.plugin);

                    await this.plugin.saveSettings();
                }, 1000, true))
            );
        }

        // tedb：库内相对目录 + 持久化等级（仅桌面端可用，移动端回退 IndexedDB）
        if (storageType === StorageProviderDriveType.TEDB) {
            new Setting(containerEl)
                .setName(t("Durability"))
                .setDesc(t("relaxed skips fsync (about 2-3x faster); strict fsyncs every write"))
                .addDropdown(dropdown => dropdown
                    .addOption("relaxed", "relaxed")
                    .addOption("strict", "strict")
                    .setValue(this.driveConfig(StorageProviderDriveType.TEDB).durability || "relaxed")
                    .onChange(async (value: string) => {
                        this.driveConfig(StorageProviderDriveType.TEDB).durability = value;
                        this.plugin.storage.sync(this.plugin);

                        await this.plugin.saveSettings();
                    })
                );
        }


        // if (this.plugin.settings.storage.storage_type === StorageProviderDriveType.API) {
        //     new Setting(containerEl)
        //         .setName(t("Use https"))
        //         .setDesc(t("Be sure your server enabled https"))
        //         .addToggle(toggle => toggle
        //             .setDisabled(this.plugin.settings.storage.drive["api"].use_server)
        //             .setValue(this.plugin.settings.storage.drive["api"].use_https)
        //             .onChange(async (use_https) => {
        //                 this.plugin.settings.storage.drive["api"].use_https = use_https;
        //                 this.plugin.storage.sync(this.plugin);
        //                 await this.plugin.saveSettings();
        //                 this.display();
        //             })
        //         );

        //     this.plugin.settings.storage.drive["api"].use_https && new Setting(containerEl)
        //         .setName(t("Api Key"))
        //         .setDesc(
        //             t("Input your api-key for authentication")
        //         )
        //         .addText((text) =>
        //             text
        //                 .setValue(this.plugin.settings.storage.drive["api"].api_key)
        //                 .setDisabled(this.plugin.settings.storage.drive["api"].use_server)
        //                 .onChange(debounce(async (api_key) => {
        //                     this.plugin.settings.storage.drive["api"].api_key = api_key;
        //                     this.plugin.storage.sync(this.plugin);
        //                     await this.plugin.saveSettings();
        //                     this.display();
        //                 }, 500, true))
        //         );

        //     new Setting(containerEl)
        //         .setName(t("Server Host"))
        //         .setDesc(
        //             t("Your server's host name (like 11.11.11.11 or baidu.com)")
        //         )
        //         .addText((text) =>
        //             text
        //                 .setValue(this.plugin.settings.storage.drive["api"].host)
        //                 .setDisabled(this.plugin.settings.storage.drive["api"].use_server)
        //                 .onChange(debounce(async (host) => {
        //                     this.plugin.settings.storage.drive["api"].host = host;
        //                     this.plugin.storage.sync(this.plugin);
        //                     await this.plugin.saveSettings();
        //                 }, 500, true))
        //         );

        //     new Setting(containerEl)
        //         .setName(t("Server Port"))
        //         .setDesc(
        //             t('An integer between 1024-65535. It should be same as "PORT" variable in .env file of server')
        //         )
        //         .addText((text) =>
        //             text
        //                 .setValue(String(this.plugin.settings.storage.drive["api"].port))
        //                 .onChange(debounce(async (port) => {
        //                     const p = Number(port);
        //                     if (!isNaN(p) && p >= 1023 && p <= 65535) {
        //                         this.plugin.settings.storage.drive["api"].port = p;
        //                         this.plugin.storage.sync(this.plugin);

        //                         await this.plugin.saveSettings();
        //                     } else {
        //                         new Notice(t("Wrong port format"));
        //                     }
        //                 }, 500, true))
        //         );

        // }


        // 导入导出数据库（文件格式解析统一在外层 storage/transfer.ts，驱动只处理数据）
        new Setting(containerEl)
            .setName(t("Import & Export"))
            .setDesc(t("Warning: Import will override current database"))
            .addButton(button => button
                .setButtonText(t("Import"))
                .onClick(async () => {
                    const modal = new ImportFormatModal(this.plugin.app, async (format: 'json' | 'csv' | 'sqlite3', file: File) => {
                        try {
                            await importFromFile(this.plugin, this.plugin.storage.DB(), file, format);
                            new Notice(t("Import successful"));
                        } catch (error) {
                            new Notice(t("Import failed: {0}", error.message || String(error)));
                            console.error('Import error:', error);
                        }
                    });
                    modal.open();
                })
            )
            .addButton(button => button
                .setButtonText(t("Export"))
                .onClick(async () => {
                    const modal = new ExportFormatModal(this.plugin.app, async (format: 'json' | 'csv') => {
                        try {
                            await exportToFile(this.plugin, this.plugin.storage.DB(), format);
                            new Notice(t("Export successful"));
                        } catch (error) {
                            new Notice(t("Export failed: {0}", error.message || String(error)));
                            console.error('Export error:', error);
                        }
                    });
                    modal.open();
                })
            );
        // 获取所有非无视单词
        new Setting(containerEl)
            .setName(t("Export"))
            .addButton(button => button
                .setButtonText(t("Export Word"))
                .onClick(async () => {
                    const resp = await this.plugin.storage.DB().getAllExpressionSimple(true);
                    const words = resp.data as ExpressionInfoSimple[];

                    const ignores = words.filter(w => (w.status !== 0 && w.t !== "PHRASE")).map(w => w.expression);
                    await navigator.clipboard.writeText(ignores.join("\n"));
                    new Notice(t("Copied to clipboard"));
                }))
            .addButton(button => button
                .setButtonText(t("Export Word and Phrase"))
                .onClick(async () => {
                    const resp = await this.plugin.storage.DB().getAllExpressionSimple(true);
                    const words = resp.data as ExpressionInfoSimple[];

                    const ignores = words.filter(w => w.status !== 0).map(w => w.expression);
                    await navigator.clipboard.writeText(ignores.join("\n"));
                    new Notice(t("Copied to clipboard"));
                })
            );

        // 获取所有无视单词
        new Setting(containerEl)
            .setName(t("Export Ignores"))
            .addButton(button => button
                .setButtonText(t("Export"))
                .onClick(async () => {
                    const resp = await this.plugin.storage.DB().getAllExpressionSimple(true);
                    const words = resp.data as ExpressionInfoSimple[];

                    const ignores = words.filter(w => w.status === 0).map(w => w.expression);
                    await navigator.clipboard.writeText(ignores.join("\n"));
                    new Notice(t("Copied to clipboard"));
                })
            );

        // 销毁数据库
        new Setting(containerEl)
            .setName(t("Destroy Database"))
            .setDesc(t("Destroy all stuff and start over"))
            .addButton(button => button
                .setButtonText(t("Destroy"))
                .setWarning()
                .onClick(async () => {
                    const modal = new WarningModal(
                        this.app,
                        t("Are you sure you want to destroy your database?"),
                        async () => {
                            await this.plugin.storage.DB().destroyAll();
                            await this.plugin.storage.destroyed();
                            await this.plugin.storage.syncSetting(this.plugin).drive(this.plugin.settings.storage.storage_type);

                            new Notice("已清空");
                        });
                    modal.open();
                })
            );
    }

    readingSettings(containerEl: HTMLElement) {
        containerEl.createEl("h3", {text: t("Reading Mode")});

        new Setting(containerEl)
            .setName(t("Font Size"))
            .setDesc(t("Like 15px or 1.5em"))
            .addText(text => text
                .setValue(this.plugin.settings.font_size)
                .onChange(debounce(async (value) => {
                    this.plugin.settings.font_size = value;
                    this.plugin.store.fontSize = value;
                    await this.plugin.saveSettings();
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("Font Family"))
            .addText(text => text
                .setValue(this.plugin.settings.font_family)
                .onChange(debounce(async (value) => {
                    this.plugin.settings.font_family = value;
                    this.plugin.store.fontFamily = value;
                    await this.plugin.saveSettings();
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("Line Height"))
            .addText(text => text
                .setValue(this.plugin.settings.line_height)
                .onChange(debounce(async (value) => {
                    this.plugin.settings.line_height = value;
                    this.plugin.store.lineHeight = value;
                    await this.plugin.saveSettings();
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("Default Paragraphs"))
            .addDropdown(num => num
                .addOption("2", "1")
                .addOption("4", "2")
                .addOption("8", "4")
                .addOption("16", "8")
                .addOption("32", "16")
                .addOption("all", "All")
                .setValue(this.plugin.settings.default_paragraphs)
                .onChange(async (value: string) => {
                    this.plugin.settings.default_paragraphs = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t("Use Machine Translation"))
            .setDesc(t("Auto translate sentences"))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.use_machine_trans)
                .onChange(async (use_machine_trans) => {
                    this.plugin.settings.use_machine_trans = use_machine_trans;
                    await this.plugin.saveSettings();
                })
            );
        new Setting(containerEl)
            .setName(t("Open count bar"))
            .setDesc(t("Count the word number of different type of article"))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.word_count)
                .onChange(async (value) => {
                    this.plugin.settings.word_count = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    reviewSettings(containerEl: HTMLElement) {
        containerEl.createEl("h3", {text: t("Review")});

        new Setting(containerEl)
            .setName(t("SR migration source file"))
            .setDesc(t("SR migration source description"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.review_database)
                    .onChange(async (path) => {
                        this.plugin.settings.review_database = path;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("Accent"))
            .setDesc(t("Choose your preferred accent") + " (" + t("Only applies to English") + ")")
            .addDropdown(accent => accent
                .addOption("0", t("American"))
                .addOption("1", t("British"))
                .setValue(this.plugin.settings.review_prons)
                .onChange(async (value: "0" | "1") => {
                    this.plugin.settings.review_prons = value;
                    await this.plugin.saveSettings();
                })
            );

        // ---- 复习调度 ----

        new Setting(containerEl)
            .setName(t("Scheduling algorithm"))
            .setDesc(t("Scheduling algorithm description"))
            .addDropdown(algo => algo
                .addOption("FSRS", "FSRS")
                .addOption("SM-2", "SM-2")
                .setValue(this.plugin.settings.review_algorithm)
                .onChange(async (value: "FSRS" | "SM-2") => {
                    this.plugin.settings.review_algorithm = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t("FSRS desired retention"))
            .setDesc(t("FSRS desired retention description"))
            .addSlider(slider => slider
                .setLimits(0.5, 1, 0.01)
                .setValue(this.plugin.settings.review_fsrs_retention)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.review_fsrs_retention = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t("SM-2 base ease"))
            .setDesc(t("SM-2 base ease description"))
            .addText(text => text
                .setValue(String(this.plugin.settings.review_sm2_base_ease))
                .onChange(debounce(async (value) => {
                    const n = Number.parseFloat(value);
                    if (Number.isFinite(n) && n >= 130) {
                        this.plugin.settings.review_sm2_base_ease = n;
                        await this.plugin.saveSettings();
                    }
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("SM-2 easy bonus"))
            .setDesc(t("SM-2 easy bonus description"))
            .addText(text => text
                .setValue(String(this.plugin.settings.review_sm2_easy_bonus))
                .onChange(debounce(async (value) => {
                    const n = Number.parseFloat(value);
                    if (Number.isFinite(n) && n >= 1) {
                        this.plugin.settings.review_sm2_easy_bonus = n;
                        await this.plugin.saveSettings();
                    }
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("SM-2 lapse factor"))
            .setDesc(t("SM-2 lapse factor description"))
            .addText(text => text
                .setValue(String(this.plugin.settings.review_sm2_lapse_factor))
                .onChange(debounce(async (value) => {
                    const n = Number.parseFloat(value);
                    if (Number.isFinite(n) && n > 0 && n <= 1) {
                        this.plugin.settings.review_sm2_lapse_factor = n;
                        await this.plugin.saveSettings();
                    }
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("Maximum interval (days)"))
            .setDesc(t("Maximum interval description"))
            .addText(text => text
                .setValue(String(this.plugin.settings.review_maximum_interval))
                .onChange(debounce(async (value) => {
                    const n = Number.parseFloat(value);
                    if (Number.isFinite(n) && n >= 1) {
                        this.plugin.settings.review_maximum_interval = n;
                        await this.plugin.saveSettings();
                    }
                }, 500))
            );

        new Setting(containerEl)
            .setName(t("Migrate SR Progress"))
            .setDesc(t("Migrate SR Progress description"))
            .addButton(button => button
                .setButtonText(t("Migrate"))
                .onClick(() => {
                    new SrMigrateModal(this.plugin).open();
                })
            );
    }

    // selfServerSettings(containerEl: HTMLElement) {
    //     containerEl.createEl("h3", {text: t("As Server")});

    //     new Setting(containerEl)
    //         .setName(t("Self as Server"))
    //         .setDesc(t("Make plugin a server and interact with chrome extension"))
    //         .addToggle(toggle => toggle
    //             .setValue(this.plugin.settings.self_server)
    //             .onChange(async (self_server) => {
    //                 this.plugin.settings.self_server = self_server;
    //                 if (self_server) {
    //                     this.plugin.server = new Server(this.plugin, this.plugin.settings.self_port);
    //                     await this.plugin.server.start();
    //                 } else {
    //                     await this.plugin.server?.close();
    //                     this.plugin.server = null;
    //                 }
    //                 await this.plugin.saveSettings();
    //                 this.display();
    //             })
    //         );

    //     new Setting(containerEl)
    //         .setName(t("Server Port"))
    //         .setDesc(
    //             t("when changing port, you should restart the server")
    //         )
    //         .addText((text) =>
    //             text
    //                 .setValue(String(this.plugin.settings.self_port))
    //                 .onChange(debounce(async (port) => {
    //                     const p = Number(port);
    //                     if (!isNaN(p) && p >= 1023 && p <= 65535) {
    //                         this.plugin.settings.self_port = p;
    //                         await this.plugin.saveSettings();
    //                     } else {
    //                         new Notice(t("Wrong port format"));
    //                     }
    //                 }, 1000, true))
    //         );

    // }

}

