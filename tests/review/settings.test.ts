import { describe, expect, it } from "vitest";
import { reviewSettingsFrom } from "@/review/settings";
import { DEFAULT_SETTINGS } from "@/settings";

describe("reviewSettingsFrom", () => {
    it("把 settings 的 review_* 七字段映射为 ReviewSettings", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            review_algorithm: "SM-2" as const,
            review_fsrs_retention: 0.85,
            review_sm2_base_ease: 260,
            review_sm2_easy_bonus: 1.4,
            review_sm2_lapse_factor: 0.6,
            review_maximum_interval: 3650,
        };
        expect(reviewSettingsFrom(settings as any)).toEqual({
            algorithm: "SM-2",
            fsrsRetention: 0.85,
            sm2BaseEase: 260,
            sm2EasyBonus: 1.4,
            sm2LapseFactor: 0.6,
            maximumInterval: 3650,
        });
    });

    it("默认设置映射：FSRS / 0.9 / 250 / 1.3 / 0.5 / 36525", () => {
        expect(reviewSettingsFrom({ ...DEFAULT_SETTINGS } as any)).toEqual({
            algorithm: "FSRS",
            fsrsRetention: 0.9,
            sm2BaseEase: 250,
            sm2EasyBonus: 1.3,
            sm2LapseFactor: 0.5,
            maximumInterval: 36525,
        });
    });
});
