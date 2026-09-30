import { requestUrl, RequestUrlParam } from "obsidian"
import { detectWordLang, getLang } from "@/langs"

export async function search(
    text: string,
    native: string = "zh",
    foreign: string = "en"
): Promise<string | undefined> {
    // 母语词 → 译成外语；外语词 → 译成母语
    const direction = detectWordLang(text, native, foreign);
    const targetLang = direction === "native" ? getLang(foreign) : getLang(native);
    const target = targetLang?.deepl || "ZH";

    const payload = {
        text,
        source_lang: "auto",
        target_lang: target,
    };

    const data: RequestUrlParam = {
        url: "https://deeplx.1stg.me/translate",
        method: "POST",
        body: JSON.stringify(payload),
        contentType: "application/json"
    };

    try {
        const res = (await requestUrl(data)).json;
        if (res.code !== 200) throw new Error("Deeplx api source error.");

        return res.data;
    } catch (err) {
        console.error(err.message)
    }
}
