import { describe, it, expect } from "vitest";
import { buildPronUrl } from "@/utils/pronounce";

const ZH_EN = { native: "zh", foreign: "en", accent: "0" as const };
const EN_JP = { native: "en", foreign: "jp", accent: "1" as const };

describe("buildPronUrl", () => {
    it("english word uses accent type param", () => {
        const url = buildPronUrl("apple", ZH_EN);
        expect(url).toContain("dictvoice?type=0");
        expect(url).toContain("audio=apple");
    });

    it("accent 1 (British) is respected for english", () => {
        const url = buildPronUrl("apple", EN_JP);
        expect(url).toContain("type=1");
    });

    it("native word follows the native language config", () => {
        // 母语中文词 → le=zh
        const url = buildPronUrl("苹果", ZH_EN);
        expect(url).toContain("le=zh");
        expect(url).not.toContain("type=");
    });

    it("foreign non-english word follows the foreign language config", () => {
        // 外语日语词 → le=jap
        const url = buildPronUrl("こんにちは", EN_JP);
        expect(url).toContain("le=jap");
    });

    it("korean words map to ko", () => {
        const url = buildPronUrl("안녕", { native: "zh", foreign: "kr", accent: "0" });
        expect(url).toContain("le=ko");
    });

    it("returns null for unsupported language codes", () => {
        expect(
            buildPronUrl("apple", { native: "xx", foreign: "yy", accent: "0" })
        ).toBeNull();
    });
});
