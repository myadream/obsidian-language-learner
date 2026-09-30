import { t } from "./lang/helper";

/**
 * 语言的单一事实源：设置下拉、词典可用性、翻译目标语言、发音参数都以这里为准。
 *
 * code 沿用历史取值（jp/kr 而非 ja/ko），避免老用户设置迁移。
 */
export interface LangDef {
    code: string;
    /** locale 文件里的语言名 key */
    nameKey: string;
    /** DeepL API 语言代码（zh-TW 官方仅有简体 ZH，回退之） */
    deepl: string;
    /** Web Speech API 的 BCP-47 代码，作为发音兜底 */
    bcp47: string;
    /** 有道 dictvoice 的 le 参数；英语走 type=0/1 口音参数，不用 le */
    dictvoiceLe?: string;
    /** 文字体系：han（中日共用汉字）/ kana / hangul / latin */
    script: "han" | "kana" | "hangul" | "latin";
    /** Cambridge 词典的语种变体（仅英语学习相关语言可用该词典） */
    cambridge?: "en" | "en-chs" | "en-chz";
}

export const LANGS: LangDef[] = [
    { code: "zh",    nameKey: "Chinese",            deepl: "ZH", bcp47: "zh-CN", dictvoiceLe: "zh",  script: "han",   cambridge: "en-chs" },
    { code: "zh-TW", nameKey: "Traditional Chinese", deepl: "ZH", bcp47: "zh-TW", dictvoiceLe: "zh",  script: "han",   cambridge: "en-chz" },
    { code: "en",    nameKey: "English",            deepl: "EN", bcp47: "en-US",                     script: "latin", cambridge: "en" },
    { code: "jp",    nameKey: "Japanese",           deepl: "JA", bcp47: "ja-JP", dictvoiceLe: "jap", script: "kana" },
    { code: "kr",    nameKey: "Korean",             deepl: "KO", bcp47: "ko-KR", dictvoiceLe: "ko",  script: "hangul" },
    { code: "fr",    nameKey: "French",             deepl: "FR", bcp47: "fr-FR", dictvoiceLe: "fr",  script: "latin" },
    { code: "de",    nameKey: "Deutsch",            deepl: "DE", bcp47: "de-DE", dictvoiceLe: "de",  script: "latin" },
    { code: "es",    nameKey: "Spanish",            deepl: "ES", bcp47: "es-ES", dictvoiceLe: "es",  script: "latin" },
];

export const DEFAULT_NATIVE = "zh";
export const DEFAULT_FOREIGN = "en";

export function getLang(code: string): LangDef | undefined {
    return LANGS.find((l) => l.code === code);
}

export function langName(code: string): string {
    const lang = getLang(code);
    return lang ? t(lang.nameKey as any) : code;
}

/** 老配置里可能出现未支持的语言代码，做归一化 */
export function normalizeLangCode(code: string | undefined, fallback: string): string {
    return code && getLang(code) ? code : fallback;
}

const SCRIPT_TESTS: Array<{ script: LangDef["script"]; re: RegExp }> = [
    { script: "hangul", re: /[\uac00-\ud7af\u1100-\u11ff]/ },
    { script: "kana", re: /[\u3040-\u30ff]/ },
    { script: "han", re: /[\u4e00-\u9fff\u3400-\u4dbf]/ },
    { script: "latin", re: /[a-zA-Z\u00c0-\u024f]/ },
];

/** 检测一段文本的文字体系，无法识别时返回 null */
export function detectScript(text: string): LangDef["script"] | null {
    for (const { script, re } of SCRIPT_TESTS) {
        if (re.test(text)) {
            return script;
        }
    }
    return null;
}

/**
 * 判断查询词更可能属于母语还是外语。
 * 相同文字体系（如 zh/zh-TW、en/fr/de/es）无法进一步区分时，优先视为外语
 * （学习场景下更常查询外语词）。
 */
export function detectWordLang(
    text: string,
    native: string,
    foreign: string
): "native" | "foreign" {
    const script = detectScript(text);
    if (!script) {
        return "foreign";
    }

    const nativeScript = getLang(native)?.script;
    const foreignScript = getLang(foreign)?.script;

    if (nativeScript === script && foreignScript !== script) {
        return "native";
    }
    if (foreignScript === script && nativeScript !== script) {
        return "foreign";
    }
    // 双方同体系或均不匹配时，优先外语
    return "foreign";
}
