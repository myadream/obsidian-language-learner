import {
    Editor,
    MarkdownView,
    Menu,
    Platform,
    Plugin,
    ViewState,
    WorkspaceLeaf,
} from "obsidian";
import {around} from "monkey-around";
import {App as VueApp, createApp} from "vue";

import {SEARCH_ICON, SEARCH_PANEL_VIEW, SearchPanelView} from "./views/SearchPanelView";
import {READING_ICON, READING_VIEW_TYPE, ReadingView} from "./views/ReadingView";
import {LEARN_ICON, LEARN_PANEL_VIEW, LearnPanelView} from "./views/LearnPanelView";
import {STAT_ICON, STAT_VIEW_TYPE, StatView} from "./views/StatView";
import {DATA_ICON, DATA_PANEL_VIEW, DataPanelView} from "./views/DataPanelView";
import {REVIEW_ICON, REVIEW_VIEW_TYPE, ReviewView} from "./views/ReviewView";

import {t} from "./lang/helper";
import {TextParser} from "./views/parser";
import {FrontMatterManager} from "./utils/frontmatter";
// import Server from "./api/server";

import {DEFAULT_SETTINGS, MyPluginSettings, SettingTab} from "./settings";
import store from "./store";
import {speakWord} from "./utils/pronounce";
import type {Position} from "./constant";
import {InputModal} from "./modals"

import Global from "./views/Global.vue";
import {normalizeStorageSetting} from "@/storage/settings-normalize";
import { StorageProvider } from "./storage/provider";


export const FRONT_MATTER_KEY: string = "langr";

export default class LanguageLearner extends Plugin {
    constants: { platform: "mobile" | "desktop"; };
    settings: MyPluginSettings;
    appEl: HTMLElement;
    vueApp: VueApp;
    storage: StorageProvider;
    // server: Server;
    parser: TextParser;
    markdownButtons: Record<string, HTMLElement> = {};
    frontManager: FrontMatterManager;
    store: typeof store = store;

    async onload() {
        // 读取设置
        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));

        this.registerConstants();

        // // 打开数据库
        // this.db = this.settings.use_server
        //     ? new WebDb(this.settings.port)
        //     : new LocalDb(this);
        // await this.db.open();

        this.storage = new StorageProvider(this);
        await this.storage.drive(this.settings.storage.storage_type);

        // 设置解析器
        this.parser = new TextParser(this);
        this.frontManager = new FrontMatterManager(this.app);

        // 打开内置服务器
        // this.server = this.settings.self_server
        //     ? new Server(this, this.settings.self_port)
        //     : null;
        // await this.server?.start();

        // test
        // this.addCommand({
        // 	id: "langr-test",
        // 	name: "Test for langr",
        // 	callback: () => new Notice("hello!")
        // })

        this.initStore();

        this.addCommands();
        this.registerCustomViews();
        this.registerReadingToggle();
        this.registerContextMenu();
        this.registerMouseup();
        this.registerEvent(
            this.app.workspace.on("css-change", () => {
                store.dark = document.body.hasClass("theme-dark");
                store.themeChange = !store.themeChange;
            })
        );

        // 创建全局app用于各种浮动元素
        this.appEl = document.body.createDiv({cls: "langr-app"});
        this.vueApp = createApp(Global);
        this.vueApp.config.globalProperties.plugin = this;
        this.vueApp.mount(this.appEl);
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(SEARCH_PANEL_VIEW);
        this.app.workspace.detachLeavesOfType(LEARN_PANEL_VIEW);
        this.app.workspace.detachLeavesOfType(DATA_PANEL_VIEW);
        this.app.workspace.detachLeavesOfType(STAT_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(READING_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(REVIEW_VIEW_TYPE);

        this.storage?.destroyed().catch((e) =>
            console.error("[StorageProvider] flush on unload failed", e)
        );
        // this.server?.close();

        this.vueApp.unmount();
        this.appEl.remove();
        this.appEl = null;
    }

    registerConstants() {
        this.constants = {
            platform: Platform.isMobile ? "mobile" : "desktop",
        };
    }

    initStore() {
        this.store.dark = document.body.hasClass("theme-dark");
        this.store.themeChange = false;
        this.store.fontSize = this.settings.font_size;
        this.store.fontFamily = this.settings.font_family;
        this.store.lineHeight = this.settings.line_height;
        this.store.popupSearch = this.settings.popup_search;
        this.store.searchPinned = false;
        this.store.dictsChange = false;
        this.store.dictHeight = this.settings.dict_height;
    }

    addCommands() {
        // 注册复习命令
        this.addCommand({
            id: "langr-review-open",
            name: t("Start Review"),
            callback: () => {
                this.activateView(REVIEW_VIEW_TYPE, "tab");
            },
        });

        // 注册查词命令
        this.addCommand({
            id: "langr-search-word-select",
            name: t("Translate Select"),
            callback: () => {
                const selection = window.getSelection().toString().trim();
                this.queryWord(selection);
            },
        });
        this.addCommand({
            id: "langr-search-word-input",
            name: t("Translate Input"),
            callback: () => {
                const modal = new InputModal(this.app, (text) => {
                    this.queryWord(text);
                });
                modal.open();
            },
        });
    }

    registerCustomViews() {
        // 注册查词面板视图
        this.registerView(
            SEARCH_PANEL_VIEW,
            (leaf) => new SearchPanelView(leaf, this)
        );
        this.addRibbonIcon(SEARCH_ICON, t("Open word search panel"), () => {
            this.activateView(SEARCH_PANEL_VIEW, "left");
        });

        // 注册新词面板视图
        this.registerView(
            LEARN_PANEL_VIEW,
            (leaf) => new LearnPanelView(leaf, this)
        );
        this.addRibbonIcon(LEARN_ICON, t("Open new word panel"), () => {
            this.activateView(LEARN_PANEL_VIEW, "right");
        });

        // 注册阅读视图
        this.registerView(
            READING_VIEW_TYPE,
            (leaf) => new ReadingView(leaf, this)
        );

        // 注册统计视图
        this.registerView(STAT_VIEW_TYPE, (leaf) => new StatView(leaf, this));
        this.addRibbonIcon(STAT_ICON, t("Open statistics"), async () => {
            this.activateView(STAT_VIEW_TYPE, "right");
        });

        // 注册复习视图
        this.registerView(REVIEW_VIEW_TYPE, (leaf) => new ReviewView(leaf, this));
        this.addRibbonIcon(REVIEW_ICON, t("Start Review"), async () => {
            this.activateView(REVIEW_VIEW_TYPE, "tab");
        });

        //注册单词列表视图
        this.registerView(
            DATA_PANEL_VIEW,
            (leaf) => new DataPanelView(leaf, this)
        );
        this.addRibbonIcon(DATA_ICON, t("Data Panel"), async () => {
            this.activateView(DATA_PANEL_VIEW, "tab");
        });
    }

    async setMarkdownView(leaf: WorkspaceLeaf, focus: boolean = true) {
        await leaf.setViewState(
            {
                type: "markdown",
                state: leaf.view.getState(),
                //popstate: true,
            } as ViewState,
            {focus}
        );
    }

    async setReadingView(leaf: WorkspaceLeaf) {
        await leaf.setViewState({
            type: READING_VIEW_TYPE,
            state: leaf.view.getState(),
            //popstate: true,
        } as ViewState);
    }

    // 在MardownView的扩展菜单加一个转为Reading模式的选项
    registerReadingToggle = () => {
        this.register(
            around(MarkdownView.prototype, {
                onPaneMenu(next) {
                    return function (m: Menu) {
                        const file = this.file;
                        const cache = file.cache
                            ? this.app.metadataCache.getFileCache(file)
                            : null;

                        if (!file ||
                            !cache?.frontmatter || 
                            !cache?.frontmatter[FRONT_MATTER_KEY]
                        ) {
                            return next.call(this, m);
                        }

                        m.addItem((item) => {
                            item.setTitle(t("Open as Reading View"))
                                .setIcon(READING_ICON)
                                .onClick(() => {
                                    this.setReadingView(this.leaf);
                                });
                        });

                        next.call(this, m);
                    };
                },
            })
        );

        // 增加标题栏切换阅读模式和mardown模式的按钮
        const self = this; // eslint-disable-line @typescript-eslint/no-this-alias
        this.register(
            around(WorkspaceLeaf.prototype, {
                setViewState(next) {
                    return function (state: ViewState, ...rest: any[]): Promise<void> {
                        return (next.apply(this, [state, ...rest]) as Promise<void>).then(() => {
                            // 只在 MarkdownView 类型的 leaf 上执行
                            if (state.type === "markdown" && state.state?.file && this.view instanceof MarkdownView) {
                                const cache = this.app.metadataCache
                                    .getCache(state.state.file);
                                if (cache?.frontmatter && cache.frontmatter[FRONT_MATTER_KEY]) {
                                    if (!this.markdownButtons) {
                                        this.markdownButtons = {};
                                    }
                                    if (!this.markdownButtons["reading"]) {
                                        // 在软件初始化的时候，view上面可能没有 addAction 这个方法
                                        setTimeout(() => {
                                            this.markdownButtons["reading"] =
                                                (this.view as MarkdownView).addAction(
                                                    "view",
                                                    t("Open as Reading View"),
                                                    () => {
                                                        self.setReadingView(this);
                                                    }
                                                );
                                            this.markdownButtons["reading"].addClass("change-to-reading");

                                        })
                                    }
                                } else {
                                    (this.view.actionsEl as HTMLElement)
                                        ?.querySelectorAll(".change-to-reading")
                                        .forEach(el => el.remove());
                                    if (this.markdownButtons) {
                                        this.markdownButtons["reading"] = null;
                                    }
                                }
                            } else {
                                if (this.markdownButtons) {
                                    this.markdownButtons["reading"] = null;
                                }
                            }
                        });
                    };
                },
            })
        );
    };

    async queryWord(word: string, target?: HTMLElement, evtPosition?: Position): Promise<void> {
        if (!word) return;

        if (!this.settings.popup_search) {
            await this.activateView(SEARCH_PANEL_VIEW, "left");
        }

        if (target && Platform.isDesktopApp) {
            await this.activateView(LEARN_PANEL_VIEW, "right");
        }

        dispatchEvent(new CustomEvent('obsidian-langr-search', {
            detail: {selection: word, target, evtPosition}
        }));

        if (this.settings.auto_pron) {
            speakWord(word, {
                native: this.settings.native,
                foreign: this.settings.foreign,
                accent: this.settings.review_prons,
            });
        }
    }

    // 管理所有的右键菜单
    registerContextMenu() {
        const addMemu = (mu: Menu, selection: string) => {
            mu.addItem((item) => {
                item.setTitle(t("Search word"))
                    .setIcon("info")
                    .onClick(async () => {
                        this.queryWord(selection);
                    });
            });
        };
        // markdown 编辑模式 右键菜单
        this.registerEvent(
            this.app.workspace.on(
                "editor-menu",
                (menu: Menu, editor: Editor, _view: MarkdownView) => {
                    const selection = editor.getSelection();
                    if (selection || selection.trim().length === selection.length) {
                        addMemu(menu, selection);
                    }
                }
            )
        );
        // markdown 预览模式 右键菜单
        this.registerDomEvent(document.body, "contextmenu", (evt) => {
            if ((evt.target as HTMLElement).matchParent(".markdown-preview-view")) {
                const selection = window.getSelection().toString().trim();
                if (!selection) return;

                evt.preventDefault();
                const menu = new Menu();

                addMemu(menu, selection);

                menu.showAtMouseEvent(evt);
            }
        });
    }

    // 管理所有的左键抬起
    registerMouseup() {
        this.registerDomEvent(document.body, "pointerup", (evt) => {
            const target = evt.target as HTMLElement;
            if (!target.matchParent(".stns")) {
                // 处理普通模式
                const funcKey = this.settings.function_key;
                if ((funcKey === "disable" || evt[funcKey] === false)
                    && !(this.store.searchPinned && !target.matchParent("#langr-search,#langr-learn-panel"))
                ) return;

                const selection = window.getSelection().toString().trim();
                if (!selection) return;

                evt.stopImmediatePropagation();
                this.queryWord(selection, null, {x: evt.pageX, y: evt.pageY});
                return;
            }
        });
    }

    async loadSettings() {
        const data = (await this.loadData()) || {};
        const savedDictionaries =
            typeof data.dictionaries === "object" && data.dictionaries !== null
                ? data.dictionaries
                : {};
        const dictionaries = Object.fromEntries(
            Object.entries(DEFAULT_SETTINGS.dictionaries).map(([id, defaults]) => [
                id,
                Object.assign({}, defaults, savedDictionaries[id]),
            ])
        );
        const settings: { [K in string]: any } = Object.assign(
            {},
            DEFAULT_SETTINGS,
            { dictionaries }
        );
        for (const key in DEFAULT_SETTINGS) {
            const k = key as keyof typeof DEFAULT_SETTINGS;
            if (k === "dictionaries" || k === "storage" || data[k] === undefined) {
                continue;
            }

            if (typeof DEFAULT_SETTINGS[k] === "object") {
                Object.assign(settings[k], data[k]);
            } else {
                settings[k] = data[k];
            }
        }

        // storage 整体走归一化：老配置缺新增驱动（csv/tedb）键时补默认值、
        // 被清空的 storage_path 回填默认值、非法 storage_type 回退 indexed；
        // 归一化输出全新对象，避免 Object.assign 把 DEFAULT_SETTINGS.storage
        // 污染成共享引用（同一会话内二次加载会用脏默认值）
        settings.storage = normalizeStorageSetting(data.storage);

        (this.settings as any) = settings;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView(VIEW_TYPE: string, side: "left" | "right" | "tab") {
        if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length === 0) {
            let leaf;
            switch (side) {
                case "left":
                    leaf = this.app.workspace.getLeftLeaf(false);
                    break;
                case "right":
                    leaf = this.app.workspace.getRightLeaf(false);
                    break;
                case "tab":
                    leaf = this.app.workspace.getLeaf("tab");
                    break;
            }
            await leaf.setViewState({
                type: VIEW_TYPE,
                active: true,
            });
        }
        this.app.workspace.revealLeaf(
            this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]
        );
    }
}
