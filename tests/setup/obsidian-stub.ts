/**
 * obsidian 模块的测试替身。
 * 只实现 src 中实际用到的 API；网络类函数通过 __net 由测试按用例注入。
 */
import moment from "moment";

export { moment };

export const Platform = {
    isMobile: false,
    isMobileApp: false,
    isDesktop: true,
    isDesktopApp: true,
};

export function normalizePath(path: string): string {
    return path.replace(/([\\/])+/g, "/").replace(/(^\/|\/$)/g, "");
}

export class Notice {
    constructor(public message: string) {}
}

// ---- 网络请求 ----
export const __net = {
    request: null as null | ((param: any) => Promise<string>),
    requestUrl: null as null | ((param: any) => Promise<any>),
};

export interface RequestUrlParam {
    url: string;
    method?: string;
    body?: any;
    contentType?: string;
    headers?: Record<string, string>;
}

export async function request(param: RequestUrlParam): Promise<string> {
    if (!__net.request) {
        throw new Error("obsidian-stub: request() not mocked for this test");
    }
    return __net.request(param);
}

export async function requestUrl(param: RequestUrlParam): Promise<any> {
    if (!__net.requestUrl) {
        throw new Error("obsidian-stub: requestUrl() not mocked for this test");
    }
    return __net.requestUrl(param);
}

export function sanitizeHTMLToDom(html: string): DocumentFragment {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const frag = document.createDocumentFragment();
    frag.append(...Array.from(doc.body.childNodes));
    return frag;
}

export function debounce<T extends (...args: any[]) => any>(
    cb: T,
    delay = 0,
    resetTimer = false
): ((...args: Parameters<T>) => void) & { cancel(): void } {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wrapped = (...args: Parameters<T>) => {
        if (resetTimer || timer === null) {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                cb(...args);
            }, delay);
        }
    };
    (wrapped as any).cancel = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };
    return wrapped as any;
}

export function parseYaml(_text: string): any {
    throw new Error("obsidian-stub: parseYaml not implemented");
}

export function stringifyYaml(_value: any): string {
    throw new Error("obsidian-stub: stringifyYaml not implemented");
}

// ---- 以下为类型/类占位，仅为让被测模块可解析 ----
export class TFile {
    path = "";
}

export class Menu {}

export class Modal {}

export class Plugin {}

export class PluginSettingTab {}

export class ItemView {}

export class TextFileView {}

export class MarkdownView {}

export class MarkdownRenderer {}

export class Setting {
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addDropdown() { return this; }
    addButton() { return this; }
}
