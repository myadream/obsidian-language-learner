import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";

// 发音模块打桩：断言朗读调用与参数
const speakWordMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/pronounce", (importOriginal) => importOriginal().then((m: any) => ({
    ...m,
    speakWord: (...args: any[]) => speakWordMock(...args),
})));

// useMessage 需要外层 NMessageProvider，测试里直接打桩
vi.mock("naive-ui", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        useMessage: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
    };
});

import WordMoreModal from "@/component/WordMoreModal.vue";
import WordCardList from "@/component/DataPanel/WordCardList.vue";
import LearnPanelModal from "@/views/LearnPanelModal.vue";
import { t } from "@/lang/helper";

function makePlugin(record?: any, postSpy?: any) {
    return {
        settings: {
            native: "zh",
            foreign: "en",
            review_prons: "0",
            storage: { storage_type: "idb" },
        },
        store: { dark: false },
        storage: {
            DB: () => ({
                getExpression: async () => record,
                postExpression: postSpy ?? (async () => 200),
                removeExpression: async () => {},
                getTags: async () => [],
            }),
            reRegister: async () => {},
        },
    };
}

function mountWithPlugin(comp: any, props: any, plugin: any) {
    return mount(comp, {
        props,
        global: {
            config: { globalProperties: { plugin } },
            // NModal 传送到 body，stub 后内容留在组件树内可查
            stubs: { teleport: true },
        },
    });
}

const FULL_RECORD = {
    expression: "resilient",
    meaning: "able to recover quickly; 有韧性的",
    status: 2,
    t: "WORD",
    tags: ["ielts"],
    notes: ["note one", "note two"],
    sentences: [
        { sentence: "A resilient person recovers.", trans: "有韧性的人能恢复。", origin: "book" },
        { sentence: "The economy proved resilient.", trans: null, origin: null },
    ],
};

beforeEach(() => {
    speakWordMock.mockClear();
});

describe("WordMoreModal 详情弹框", () => {
    it("有内容时：单词显示在内容区（而非仅标题）、展示含义、带发音按钮", async () => {
        const wrapper = mountWithPlugin(
            WordMoreModal,
            { word: "resilient", show: true },
            makePlugin(FULL_RECORD)
        );
        await flushPromises();
        await nextTick();

        const text = wrapper.text();
        // 单词在内容区（hero 区块）
        expect(wrapper.find(".word-hero .hero-word").text()).toBe("resilient");
        // 含义展示在内容区
        expect(wrapper.find(".hero-meaning").exists()).toBe(true);
        expect(text).toContain("有韧性的");
        // 发音按钮：单词 1 个 + 每条例句 1 个 = 3
        const pronBtns = wrapper.findAll("button.pron-button");
        expect(pronBtns.length).toBe(3);

        // 点击单词发音按钮 → speakWord(word)
        pronBtns[0].trigger("click");
        await flushPromises();
        expect(speakWordMock).toHaveBeenCalledWith(
            "resilient",
            expect.objectContaining({ native: "zh", foreign: "en", accent: "0" })
        );

        // 点击例句发音按钮 → 朗读例句原文（去除高亮标记）
        speakWordMock.mockClear();
        pronBtns[1].trigger("click");
        await flushPromises();
        expect(speakWordMock).toHaveBeenCalledWith(
            expect.stringContaining("A resilient person recovers."),
            expect.any(Object)
        );
    });

    it("详情为空时：仍显示单词与含义 + 空状态提示，而不是空白弹框", async () => {
        const wrapper = mountWithPlugin(
            WordMoreModal,
            { word: "emptyword", show: true },
            makePlugin({ ...FULL_RECORD, notes: [], sentences: [] })
        );
        await flushPromises();
        await nextTick();

        expect(wrapper.find(".word-hero .hero-word").text()).toBe("emptyword");
        expect(wrapper.find(".hero-meaning").exists()).toBe(true);
        expect(wrapper.find(".empty-state").exists()).toBe(true);
        expect(wrapper.text()).toContain(t("No notes or sentences for this word"));
    });

    it("单词不在数据库时：显示单词 + 空状态，不抛错", async () => {
        const wrapper = mountWithPlugin(
            WordMoreModal,
            { word: "ghostword", show: true },
            makePlugin(undefined)
        );
        await flushPromises();
        await nextTick();

        expect(wrapper.find(".word-hero .hero-word").text()).toBe("ghostword");
        expect(wrapper.find(".empty-state").exists()).toBe(true);
    });
});

describe("WordCardList 列表", () => {
    const rows = [
        {
            expr: "resilient",
            status: "Familiar",
            statusIndex: 2,
            meaning: "有韧性的",
            tags: ["ielts"],
            date: "2026-09-30",
            senNum: 1,
            noteNum: 1,
        },
        {
            expr: "emptyword",
            status: "Learning",
            statusIndex: 1,
            meaning: "",
            tags: [],
            date: "2026-09-29",
            senNum: 0,
            noteNum: 0,
        },
    ];

    it("每行带发音按钮，点击朗读对应单词", async () => {
        const wrapper = mount(WordCardList, {
            props: { data: rows },
            global: {
                config: { globalProperties: { plugin: makePlugin() } },
                stubs: { teleport: true, TransitionGroup: true },
            },
        });
        await flushPromises();

        const pronBtns = wrapper.findAll('button[aria-label="' + t("Pronounce") + '"]');
        expect(pronBtns.length).toBe(rows.length);

        await pronBtns[0].trigger("click");
        expect(speakWordMock).toHaveBeenCalledWith(
            "resilient",
            expect.objectContaining({ native: "zh", foreign: "en" })
        );
    });
});

describe("LearnPanelModal 提交流程", () => {
    it("提交时剔除空白笔记与空白例句卡片（不得入库垃圾数据）", async () => {
        const postSpy = vi.fn(async () => 200);
        const plugin = makePlugin(undefined, postSpy);
        const word = {
            expression: "testword",
            meaning: "测试含义",
            status: 1,
            t: "WORD",
            tags: [],
            notes: ["", "  ", "real note"],
            sentences: [
                { sentence: "", trans: "", origin: "" },
                { sentence: "A real sentence.", trans: "", origin: "" },
            ],
        };
        // 复刻真实流程：先挂载空 word，打开时再传入（触发 modal 的拷贝 watch）
        const wrapper = mountWithPlugin(LearnPanelModal, { word: {}, show: false }, plugin);
        await flushPromises();
        await wrapper.setProps({ word, show: true });
        await flushPromises();
        await nextTick();

        const submitBtn = wrapper
            .findAll("button")
            .find((b) => b.text().includes(t("Submit")));
        expect(submitBtn).toBeTruthy();
        await submitBtn!.trigger("click");
        await flushPromises();

        expect(postSpy).toHaveBeenCalledTimes(1);
        const saved = postSpy.mock.calls[0][0];
        expect(saved.notes).toEqual(["real note"]);
        expect(saved.sentences).toHaveLength(1);
        expect(saved.sentences[0].sentence).toBe("A real sentence.");
    });
});
