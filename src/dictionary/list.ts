import { t } from "@/lang/helper";
import { LANGS, langName } from "@/langs";
import Youdao from "./youdao/View.vue";
import Cambridge from "./cambridge/View.vue";
import HJdict from "./hjdict/View.vue";
import DeepL from "./deepl/View.vue";

// 有道/沪江为 X<=>中文 词典，仅在中文母语下可用
const ZH_NATIVES = ["zh", "zh-TW"];
const ALL_NATIVES = LANGS.map((l) => l.code);

const dicts = {
    "youdao": {
        name: t("Youdao"),
        /** 支持的母语列表；SearchPanel 与设置页据此过滤 */
        nativeLangs: ZH_NATIVES,
        description: (native: string) => `${t("English")} <=> ${langName(native)}`,
        Cp: Youdao
    },
    "cambridge": {
        name: t("Cambridge"),
        nativeLangs: [...ZH_NATIVES, "en"],
        description: (native: string) => `English => ${langName(native)}`,
        Cp: Cambridge
    },
    "hjdict": {
        name: t("Hujiang"),
        nativeLangs: ZH_NATIVES,
        description: (native: string) =>
            `${t("English")},${t("Japanese")}, ${t("Korean")}, ${t("Spanish")}, ${t("French")}, ${t("Deutsch")} <=> ${langName(native)}`,
        Cp: HJdict
    },
    "deepl": {
        name: "DeepL",
        nativeLangs: ALL_NATIVES,
        description: (native: string) => `All <=> ${langName(native)}`,
        Cp: DeepL
    }
};

/** 当前母语下可用的词典 id 列表（不区分是否启用） */
export function dictsForNative(native: string): string[] {
    return (Object.keys(dicts) as Array<keyof typeof dicts>).filter(
        (id) => dicts[id].nativeLangs.includes(native)
    );
}

export { dicts };
