/**
 * 插件 UI 语言必须跟随 Obsidian 的界面语言：
 * - localStorage["language"] 有值时（en/zh/zh-TW）用该语言
 * - 未设置时跟随软件默认语言（navigator.language，如 zh-CN → zh）
 * - 未知语言回退英文
 * - t() 必须每次调用动态读取（Obsidian 切换语言后无需重启即生效）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { t } from "@/lang/helper";

function setAppLanguage(value: string | null) {
    if (value === null) {
        window.localStorage.removeItem("language");
    } else {
        window.localStorage.setItem("language", value);
    }
}

function setNavigatorLanguage(value: string) {
    Object.defineProperty(window.navigator, "language", {
        value,
        configurable: true,
    });
}

describe("lang helper follows app language", () => {
    beforeEach(() => {
        setAppLanguage(null);
        setNavigatorLanguage("en-US");
    });

    it("uses localStorage language when set", () => {
        setAppLanguage("zh");
        expect(t("Ignore")).toBe("无视");
    });

    it("falls back to navigator.language when localStorage unset", () => {
        setAppLanguage(null);
        setNavigatorLanguage("zh-CN");
        expect(t("Ignore")).toBe("无视");
    });

    it("maps base language for BCP-47 codes (zh-TW)", () => {
        setAppLanguage(null);
        setNavigatorLanguage("zh-TW");
        const zhText = t("Ignore");
        // zh-TW 词表存在时用繁体，否则退到 zh/英文——不能是英文
        expect(zhText).not.toBe("Ignore");
    });

    it("unknown language falls back to English", () => {
        setAppLanguage("fr");
        expect(t("Ignore")).toBe("Ignore");
    });

    it("t() reads language dynamically (no restart needed)", () => {
        setAppLanguage("en");
        expect(t("Ignore")).toBe("Ignore");
        setAppLanguage("zh");
        expect(t("Ignore")).toBe("无视");
    });
});
