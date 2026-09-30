import zh from "./locale/zh";
import en from "./locale/en";
import zh_TW from "./locale/zh-TW";

const localeMap: { [k: string]: Partial<typeof en>; } = {
    en,
    zh,
    "zh-TW": zh_TW,
};

/**
 * 解析当前界面语言。每次 t() 调用时动态读取：
 * - Obsidian 把界面语言存在 localStorage["language"]（en/zh/zh-TW…）
 * - 未设置时跟随软件默认语言（Electron 的系统区域，即 navigator.language，
 *   如 zh-CN → 取 zh 基础码），而不是无脑回退英文
 * - 完全未知语言才回退英文
 */
function resolveLocale(): Partial<typeof en> {
    const stored = window.localStorage.getItem("language");
    const candidates = [stored, navigator?.language];
    for (const candidate of candidates) {
        if (!candidate) continue;
        if (localeMap[candidate]) {
            return localeMap[candidate];
        }
        // BCP-47 基础码回退：zh-CN → zh
        const base = candidate.split("-")[0];
        if (base && localeMap[base]) {
            return localeMap[base];
        }
    }
    return en;
}

export function t(text: keyof typeof en, ...args: any[]): string {
    const locale = resolveLocale();
    let result: string = (locale && locale[text]) || en[text] || String(text);
    // {0}/{1}/... 占位符插值（如错误消息带上具体原因）
    args.forEach((arg, i) => {
        result = result.replace(`{${i}}`, String(arg));
    });
    return result;
}
