import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// 发音模块打桩
const speakWordMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/pronounce", (importOriginal) => importOriginal().then((m: any) => ({
    ...m,
    speakWord: (...args: any[]) => speakWordMock(...args),
})));

import ReviewPanel from "@/views/ReviewPanel.vue";
import { makeDrive, DriveFixture } from "../setup/drive-factory";
import { ExpressionInfo, WordType } from "@/storage/interface";
import type StorageDrive from "@/storage/drive";

const DAY = 86400;

function makeInfo(over: Partial<ExpressionInfo> = {}): ExpressionInfo {
    return {
        expression: "w",
        meaning: "m",
        status: 1,
        t: WordType.WORD,
        tags: [],
        notes: [],
        sentences: [],
        connections: [],
        date: Date.now() / 1000,
        ...over,
    };
}

function makePlugin(drive: StorageDrive) {
    return {
        settings: {
            native: "zh",
            foreign: "en",
            review_prons: "0",
            review_algorithm: "SM-2",
            review_fsrs_retention: 0.9,
            review_sm2_base_ease: 250,
            review_sm2_easy_bonus: 1.3,
            review_sm2_lapse_factor: 0.5,
            review_maximum_interval: 36525,
            review_show_interval: true,
        },
        store: { dark: false },
        storage: { DB: () => drive },
    };
}

function mountPanel(plugin: any, props: any = {}) {
    return mount(ReviewPanel, {
        props,
        global: {
            config: { globalProperties: { plugin } },
            stubs: { teleport: true },
        },
    });
}

function buttonByText(wrapper: any, text: string) {
    return wrapper.findAll("button").find((b: any) => b.text().includes(text));
}

/**
 * flushPromises 只冲微任务；Dexie 写事务的回调落在宏任务里，
 * 评分后的组件推进（落库 → next()）需要再让出一轮宏任务才能稳定可见。
 */
async function settle() {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await flushPromises();
}

describe("ReviewPanel", () => {
    let fixture: DriveFixture;

    beforeEach(async () => {
        fixture = await makeDrive("indexed");
        speakWordMock.mockClear();
    });
    afterEach(() => {
        fixture.drive.close();
        fixture.adapter.dispose();
    });

    async function seedTwoWords() {
        const now = Date.now() / 1000;
        await fixture.drive.postExpression(
            makeInfo({ expression: "apple", meaning: "苹果", date: now - 100 })
        );
        await fixture.drive.postExpression(
            makeInfo({ expression: "banana", meaning: "香蕉", date: now - 50 })
        );
        // apple 到期（延迟 1 天的复习卡），banana 新卡
        await fixture.drive.putSchedule("apple", {
            algorithm: "SM-2", due: now - DAY, interval: 10, ease: 250,
        });
        return now;
    }

    it("到期卡先出：正面显示单词与进度，显示答案后四键带间隔预览", async () => {
        await seedTwoWords();
        const wrapper = mountPanel(makePlugin(fixture.drive));
        await flushPromises();

        expect(wrapper.text()).toContain("apple");
        expect(wrapper.text()).toContain("1 / 2");

        await buttonByText(wrapper, "Show Answer")!.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("苹果");
        // delay 1 天：good = (10 + 0.5) * 2.5 = 26.3 天
        const goodBtn = buttonByText(wrapper, "Good")!;
        expect(goodBtn.text()).toContain("26d");
        expect(buttonByText(wrapper, "Again")!.text()).toContain("now");
    });

    it("评分落库并推进队列；全部完成后进完成页", async () => {
        await seedTwoWords();
        const wrapper = mountPanel(makePlugin(fixture.drive));
        await settle();

        await buttonByText(wrapper, "Show Answer")!.trigger("click");
        await settle();
        await buttonByText(wrapper, "Good")!.trigger("click");
        await settle();

        // apple 的调度已落库：interval 26.3 天、ease 250
        const sched = await fixture.drive.getSchedule("apple");
        expect(sched!.algorithm).toBe("SM-2");
        expect(sched!.interval).toBe(26.3);
        expect(sched!.ease).toBe(250);
        expect(sched!.due).toBeGreaterThan(Date.now() / 1000);

        // 推进到 banana（新卡正面）
        expect(wrapper.text()).toContain("banana");
        expect(wrapper.text()).toContain("2 / 2");

        await buttonByText(wrapper, "Show Answer")!.trigger("click");
        await settle();
        await buttonByText(wrapper, "Good")!.trigger("click");
        await settle();

        expect(wrapper.text()).toContain("Review Complete");
        expect(wrapper.text()).toContain("Reviewed 2 cards");
        // banana 也已落库（新卡 good → 2.5 天）
        const banana = await fixture.drive.getSchedule("banana");
        expect(banana!.interval).toBe(2.5);
    });

    it("面板不在前台（焦点在外部输入框）时不响应全局快捷键", async () => {
        await seedTwoWords();
        const wrapper = mountPanel(makePlugin(fixture.drive));
        await settle();

        // 模拟用户焦点在别处的输入框（编辑器/弹框输入）
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        try {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
            await settle();
            // 仍在正面：Space 未触发显示答案
            expect(wrapper.text()).toContain("apple");
            expect(wrapper.text()).not.toContain("苹果");
        } finally {
            input.remove();
        }
    });

    it("调度抛错：该词跳过、会话推进，完成页给出跳过计数", async () => {
        const now = await seedTwoWords();
        const plugin = makePlugin(fixture.drive);
        // 真服务的包装：applyReview 恒抛错
        const { ReviewService } = await import("@/review/review-service");
        const real = new (ReviewService as any)(fixture.drive, () => ({
            algorithm: "SM-2", fsrsRetention: 0.9, sm2BaseEase: 250,
            sm2EasyBonus: 1.3, sm2LapseFactor: 0.5, maximumInterval: 36525,
        }));
        const failing = {
            buildQueue: (...args: any[]) => real.buildQueue(...args),
            applyReview: async () => { throw new Error("boom"); },
        };

        const wrapper = mountPanel(plugin, { service: failing });
        await settle();

        await buttonByText(wrapper, "Show Answer")!.trigger("click");
        await settle();
        await buttonByText(wrapper, "Good")!.trigger("click");
        await settle();
        // 第二张同样跳过
        await buttonByText(wrapper, "Show Answer")!.trigger("click");
        await settle();
        await buttonByText(wrapper, "Good")!.trigger("click");
        await settle();

        expect(wrapper.text()).toContain("Review Complete");
        expect(wrapper.text()).toContain("Skipped 2 cards (scheduling error)");
        // 失败服务不能写库：apple 的调度仍是种子原值（seedTwoWords 的到期卡）
        expect(await fixture.drive.getSchedule("apple")).toEqual({
            algorithm: "SM-2", due: now - DAY, interval: 10, ease: 250,
        });
    });
});
