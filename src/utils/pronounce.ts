import { detectWordLang, getLang, LangDef } from "@/langs";

export interface PronOptions {
    native: string;
    foreign: string;
    /** 英语口音：0 美音 / 1 英音（沿用 review_prons 设置） */
    accent: "0" | "1";
}

const DICTVOICE_BASE = "http://dict.youdao.com/dictvoice";

/**
 * 按查询词所属语言（母语/外语）构造发音 URL。
 * - 英语沿用有道 type=0/1 美英口音参数；
 * - 其他语言使用有道 dictvoice 的 le 语言参数；
 * - 无法确定语言或不支持的语言返回 null，调用方回退 Web Speech。
 */
export function buildPronUrl(text: string, opts: PronOptions): string | null {
    const which = detectWordLang(text, opts.native, opts.foreign);
    const code = which === "native" ? opts.native : opts.foreign;
    const lang = getLang(code);
    if (!lang) {
        return null;
    }

    const audio = encodeURIComponent(text);
    if (lang.script === "latin" && lang.code === "en") {
        return `${DICTVOICE_BASE}?type=${opts.accent}&audio=${audio}`;
    }
    if (lang.dictvoiceLe) {
        return `${DICTVOICE_BASE}?le=${lang.dictvoiceLe}&audio=${audio}`;
    }
    return null;
}

/** Web Speech 兜底（桌面端 Electron 可用；无可用语音时静默失败） */
export function speakWithWebSpeech(text: string, lang: LangDef): void {
    if (typeof window === "undefined" || !window.speechSynthesis) {
        return;
    }
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang.bcp47;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn("speakWithWebSpeech failed", e);
    }
}

/**
 * 朗读一个词：母语词按母语配置发音，外语词按外语配置发音。
 * TTS 音源优先有道 dictvoice，失败时回退 Web Speech。
 */
export async function speakWord(text: string, opts: PronOptions): Promise<void> {
    if (!text) {
        return;
    }

    const url = buildPronUrl(text, opts);
    if (url) {
        try {
            await new Audio(url).play();
            return;
        } catch (e) {
            console.warn("dictvoice playback failed, falling back to speechSynthesis", e);
        }
    }

    const which = detectWordLang(text, opts.native, opts.foreign);
    const lang = getLang(which === "native" ? opts.native : opts.foreign);
    if (lang) {
        speakWithWebSpeech(text, lang);
    }
}
