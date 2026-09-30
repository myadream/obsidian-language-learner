import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import DataPanel from "@/views/DataPanel.vue";
import store from "@/store";

// LearnPanelModal 会拖出 useLearn → ReadingView → ReadingArea 的重组件链，与本次测试无关
vi.mock("@/views/LearnPanelModal.vue", (): any => ({
    default: { name: "LearnPanelModal", props: ["show", "word"], render: (): null => null },
}));

/**
 * 回归测试：DataPanel 标签加载死循环。
 *
 * 历史 bug：expressions() 用 `tags.value.length === 0` 判断是否加载标签，
 * 当用户标签集为空时每次加载都会重新赋值 tags/checkedTags，
 * 触发 watch([selectedTags, mode]) → 回调再次 expressions() → 无限循环，
 * 页面反复重载且控制台持续打印 "Tags filter changed: [] Mode: and"。
 */
describe("DataPanel tag loading", () => {
    function makePlugin(dbTags: string[]) {
        let getAllCalls = 0;
        let getTagsCalls = 0;
        const fakeDB = {
            getAllExpressionSimple: async () => {
                getAllCalls++;
                // 死循环保护：bug 存在时调用数会无限增长，挂起 promise 链
                // 让测试能正常结束（修复后调用数恒为个位数，不会触到上限）
                if (getAllCalls > 8) {
                    return new Promise(() => {});
                }
                return {
                    data: [
                        {
                            expression: "apple",
                            meaning: "苹果",
                            status: 1,
                            t: "WORD",
                            tags: [],
                            note_num: 0,
                            sen_num: 0,
                            date: 1700000000,
                        },
                    ],
                    total: 1,
                    page: 1,
                    pageSize: 20,
                };
            },
            getTags: async () => {
                getTagsCalls++;
                // 真实驱动每次返回新数组实例（如 [...allTags.values()]），
                // 这正是触发 watch 循环的关键，fake 必须保持一致
                return [...dbTags];
            },
        };

        const plugin = {
            store,
            settings: {},
            storage: {
                DB: () => fakeDB,
                reRegister: async () => {},
            },
        };

        return {
            plugin,
            getCalls: () => ({ getAllCalls, getTagsCalls }),
        };
    }

    function mountPanel(plugin: any) {
        return mount(DataPanel, {
            global: {
                config: {
                    globalProperties: { plugin },
                },
                stubs: {
                    ActionButtons: true,
                    SearchFilterPanel: true,
                    TagFilter: true,
                    WordCardList: true,
                    LearnPanelModal: true,
                    NConfigProvider: true,
                    NMessageProvider: true,
                    NSpin: true,
                },
            },
        });
    }

    it("does not reload endlessly when the tag set is empty", async () => {
        const { plugin, getCalls } = makePlugin([]); // 空标签集：历史死循环场景
        mountPanel(plugin);

        await flushPromises();
        // 再跑一段事件循环：若无循环，总调用数应停留在个位数
        // （初始加载 1 次 + 标签赋值的可能一次性触发 ≤ 2）
        for (let i = 0; i < 15; i++) {
            await nextTick();
            await flushPromises();
        }

        expect(getCalls().getAllCalls).toBeLessThan(8);
    });

    it("loads tags exactly once even when empty", async () => {
        const { plugin, getCalls } = makePlugin([]);
        mountPanel(plugin);

        await flushPromises();
        for (let i = 0; i < 10; i++) {
            await nextTick();
            await flushPromises();
        }

        expect(getCalls().getTagsCalls).toBe(1);
    });

    it("reloads when the user changes tag selection (non-empty tags)", async () => {
        const { plugin, getCalls } = makePlugin(["fruit", "verb"]);
        const wrapper = mountPanel(plugin);

        await flushPromises();
        const before = getCalls().getAllCalls;
        for (let i = 0; i < 10; i++) {
            await nextTick();
            await flushPromises();
        }
        expect(getCalls().getAllCalls).toBe(before); // 稳定

        // 模拟用户勾选标签（v-model 写入 checkedTags）
        const vm = wrapper.vm as any;
        const checked = [...(vm.checkedTags ?? [])];
        checked[0] = true;
        vm.checkedTags = checked;
        await flushPromises();
        await nextTick();
        await flushPromises();

        expect(getCalls().getAllCalls).toBeGreaterThan(before);
        wrapper.unmount();
    });
});
