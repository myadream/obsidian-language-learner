import { describe, it, expect, beforeEach } from "vitest";
import { dicts, dictsForNative } from "@dict/list";
import { LANGS } from "@/langs";
import { search as deeplSearch } from "@dict/deepl/engine";
import { getSrcPage as cambridgeSrcPage } from "@dict/cambridge/engine";
import { __net } from "../setup/obsidian-stub";

describe("dictionary native-language metadata", () => {
    it("youdao and hjdict are Chinese-native only", () => {
        expect(dicts.youdao.nativeLangs).toEqual(["zh", "zh-TW"]);
        expect(dicts.hjdict.nativeLangs).toEqual(["zh", "zh-TW"]);
    });

    it("cambridge supports en/zh/zh-TW natives", () => {
        expect(dicts.cambridge.nativeLangs.sort()).toEqual(["en", "zh", "zh-TW"]);
    });

    it("deepl supports every configured language", () => {
        for (const lang of LANGS) {
            expect(dicts.deepl.nativeLangs).toContain(lang.code);
        }
    });

    it("dictsForNative filters correctly", () => {
        expect(dictsForNative("zh").sort()).toEqual(["cambridge", "deepl", "hjdict", "youdao"]);
        expect(dictsForNative("jp")).toEqual(["deepl"]);
        expect(dictsForNative("en").sort()).toEqual(["cambridge", "deepl"]);
    });

    it("descriptions render the native language name", () => {
        expect(dicts.deepl.description("jp")).toContain("Japanese");
        expect(dicts.youdao.description("zh")).toBeTruthy();
        expect(dicts.cambridge.description("zh-TW")).toBeTruthy();
    });
});

describe("deepl target language", () => {
    let captured: any[] = [];

    beforeEach(() => {
        captured = [];
        __net.requestUrl = async (param: any) => {
            captured.push(JSON.parse(param.body));
            return { json: { code: 200, data: "ok" } };
        };
    });

    it("translates a foreign word into the native language", async () => {
        await deeplSearch("apple", "zh", "en");
        expect(captured[0].target_lang).toBe("ZH");
    });

    it("translates a native word into the foreign language", async () => {
        await deeplSearch("苹果", "zh", "en");
        expect(captured[0].target_lang).toBe("EN");
    });

    it("korean native is mapped to KO (regression: kr was missing)", async () => {
        await deeplSearch("apple", "kr", "en");
        expect(captured[0].target_lang).toBe("KO");
    });

    it("chinese native word with japanese foreign goes to JA", async () => {
        await deeplSearch("苹果", "zh", "jp");
        expect(captured[0].target_lang).toBe("JA");
    });

    it("japanese foreign word with chinese native goes back to ZH", async () => {
        await deeplSearch("こんにちは", "zh", "jp");
        expect(captured[0].target_lang).toBe("ZH");
    });
});

describe("cambridge variant follows native setting", () => {
    it("zh native uses english-chinese-simplified", () => {
        const url = cambridgeSrcPage("apple", "zh");
        expect(url).toContain("english-chinese-simplified");
    });

    it("zh-TW native uses english-chinese-traditional", () => {
        const url = cambridgeSrcPage("apple", "zh-TW");
        expect(url).toContain("english-chinese-traditional");
    });

    it("en native uses english-only dictionary", () => {
        const url = cambridgeSrcPage("apple", "en");
        expect(url).toContain("datasetsearch=english&");
    });

    it("unsupported natives fall back to english-only", () => {
        const url = cambridgeSrcPage("apple", "ja");
        expect(url).toContain("datasetsearch=english&");
    });
});
