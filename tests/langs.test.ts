import { describe, it, expect } from "vitest";
import {
    LANGS,
    detectScript,
    detectWordLang,
    getLang,
    langName,
    normalizeLangCode,
} from "@/langs";

describe("langs", () => {
    it("codes are unique and well-formed", () => {
        const codes = LANGS.map((l) => l.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const lang of LANGS) {
            expect(lang.deepl).toBeTruthy();
            expect(lang.bcp47).toBeTruthy();
            expect(lang.script).toBeTruthy();
            expect(lang.nameKey).toBeTruthy();
        }
    });

    it("getLang/langName/normalizeLangCode", () => {
        expect(getLang("kr")?.deepl).toBe("KO");
        expect(getLang("nope")).toBeUndefined();
        expect(langName("nope")).toBe("nope");
        expect(langName("en")).toBeTruthy();

        expect(normalizeLangCode("kr", "zh")).toBe("kr");
        expect(normalizeLangCode("xx", "zh")).toBe("zh");
        expect(normalizeLangCode(undefined, "en")).toBe("en");
    });
});

describe("detectScript", () => {
    it("detects major scripts", () => {
        expect(detectScript("apple")).toBe("latin");
        expect(detectScript("苹果")).toBe("han");
        expect(detectScript("こんにちは")).toBe("kana");
        expect(detectScript("안녕하세요")).toBe("hangul");
        expect(detectScript("123 🎉")).toBeNull();
    });
});

describe("detectWordLang", () => {
    it("classifies han text as native for Chinese natives", () => {
        expect(detectWordLang("苹果", "zh", "en")).toBe("native");
        expect(detectWordLang("apple", "zh", "en")).toBe("foreign");
    });

    it("hangul is native for Korean natives", () => {
        expect(detectWordLang("안녕", "kr", "en")).toBe("native");
        expect(detectWordLang("apple", "kr", "en")).toBe("foreign");
    });

    it("kana is foreign for Chinese natives, han falls back to native", () => {
        expect(detectWordLang("こんにちは", "zh", "jp")).toBe("foreign");
        // 纯汉字无法区分中日，native=zh 时视为母语
        expect(detectWordLang("漢字", "zh", "jp")).toBe("native");
    });

    it("same-script pairs default to foreign", () => {
        // en/fr 同为拉丁体系，无法区分时优先视为外语
        expect(detectWordLang("bonjour", "fr", "en")).toBe("foreign");
    });

    it("unrecognizable text defaults to foreign", () => {
        expect(detectWordLang("123", "zh", "en")).toBe("foreign");
    });
});
