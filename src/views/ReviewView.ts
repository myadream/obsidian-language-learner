import { ItemView, WorkspaceLeaf } from "obsidian";
import { createApp, App } from "vue";

import MainPlugin from "@/plugin";
import { t } from "@/lang/helper";
import ReviewPanel from "./ReviewPanel.vue";

export const REVIEW_ICON: string = "layers";
export const REVIEW_VIEW_TYPE: string = "langr-review";

export class ReviewView extends ItemView {
    vueApp: App;
    plugin: MainPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MainPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return REVIEW_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t("Review");
    }

    getIcon(): string {
        return REVIEW_ICON;
    }

    async onOpen() {
        const container = this.containerEl.children[1]; // view-content
        const content = container.createDiv({ cls: "langr-review-view" });

        this.vueApp = createApp(ReviewPanel);
        this.vueApp.config.globalProperties.container = content;
        this.vueApp.config.globalProperties.plugin = this.plugin;
        this.vueApp.mount(content);
    }

    async onClose() {
        this.vueApp.unmount();
    }
}
