// DEBUG HARNESS — 内存版假插件/假数据库，模拟 plugin.storage.DB() 的查询面。
// 数据形态对齐 src/storage/interface.ts 的 ExpressionInfo 与 DataPanel 的分页响应。
import { reactive } from "vue";
import store from "@/store";
import { ReviewScheduleRecord, WordSchedule } from "@/review/types";

export interface FakeWord {
    expression: string;
    meaning: string | null;
    status: number;
    t: "WORD" | "PHRASE";
    tags: string[];
    notes: string[];
    sentences: { sentence: string; trans: string | null; origin: string | null }[];
    connections: string[];
    date: number;
    /** getExpression 对不存在的词返回 undefined，用于空详情场景 */
    missing?: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

export function createSeedWords(): FakeWord[] {
    return [
        {
            expression: "resilient",
            meaning: "able to recover quickly from difficulties; 有韧性的、能快速恢复的",
            status: 2,
            t: "WORD",
            tags: ["ielts", "adj"],
            notes: [
                "从 rebound（反弹）联想记忆：被压弯又弹回来。",
                "resilience n. 韧性；resiliently adv.",
            ],
            sentences: [
                {
                    sentence: "A resilient person can recover from setbacks quickly.",
                    trans: "有韧性的人能从挫折中快速恢复。",
                    origin: "The Pragmatic Programmer",
                },
                {
                    sentence: "The local economy proved resilient to the shock.",
                    trans: "当地经济在冲击面前表现出韧性。",
                    origin: "The Economist",
                },
            ],
            connections: [],
            date: now - 1 * DAY,
        },
        {
            expression: "ephemeral",
            meaning:
                "lasting for a very short time; 短暂的、转瞬即逝的。另见 fleeting / transient / transitory，均表示持续时间极短，但 ephemeral 更常用于形容美好事物的易逝，带文学色彩；在生物学中也可描述朝生暮死的昆虫或短命的花。",
            status: 4,
            t: "WORD",
            tags: ["gre"],
            notes: [],
            sentences: [
                {
                    sentence: "Fame in the internet age is often ephemeral.",
                    trans: "互联网时代的名气往往是转瞬即逝的。",
                    origin: null,
                },
            ],
            connections: [],
            date: now - 2 * DAY,
        },
        {
            expression: "emptyword",
            meaning: "暂无笔记与例句的词",
            status: 1,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
            connections: [],
            date: now - 3 * DAY,
        },
        {
            expression: "take it for granted",
            meaning: "认为理所当然；不予重视",
            status: 3,
            t: "PHRASE",
            tags: ["phrase"],
            notes: [],
            sentences: [
                {
                    sentence: "We take it for granted that the sun will rise tomorrow.",
                    trans: "我们想当然地认为太阳明天会升起。",
                    origin: "日常口语",
                },
            ],
            connections: [],
            date: now - 4 * DAY,
        },
        {
            expression: "candid",
            meaning: "truthful and straightforward; 坦率的",
            status: 1,
            t: "WORD",
            tags: ["ielts"],
            notes: ["candid photo 抓拍照；candidly adv."],
            sentences: [],
            connections: [],
            date: now - 5 * DAY,
        },
        {
            expression: "ubiquitous",
            meaning: "present everywhere; 无处不在的",
            status: 3,
            t: "WORD",
            tags: ["gre", "adj"],
            notes: [],
            sentences: [
                {
                    sentence: "Smartphones have become ubiquitous in modern life.",
                    trans: "智能手机在现代生活中已无处不在。",
                    origin: null,
                },
            ],
            connections: [],
            date: now - 6 * DAY,
        },
        {
            expression: "meticulous",
            meaning: "showing great attention to detail; 一丝不苟的",
            status: 2,
            t: "WORD",
            tags: ["ielts"],
            notes: [],
            sentences: [],
            connections: [],
            date: now - 7 * DAY,
        },
        {
            expression: "pragmatic",
            meaning: "dealing with things sensibly and realistically; 务实的",
            status: 4,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
            connections: [],
            date: now - 8 * DAY,
        },
        {
            expression: "albeit",
            meaning: "although; 尽管（连词）",
            status: 3,
            t: "WORD",
            tags: ["gre"],
            notes: [],
            sentences: [],
            connections: [],
            date: now - 9 * DAY,
        },
        {
            expression: "nuance",
            meaning: "a subtle difference in meaning; 细微差别",
            status: 2,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
            connections: [],
            date: now - 10 * DAY,
        },
    ];
}

export function createFakePlugin(seed: FakeWord[] = createSeedWords()) {
    let words = seed;

    const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

    // fake schedules 关联表：到期 / 未来 / 新卡三档（其余词均无调度 = 新卡）
    const sec = (ms: number) => Math.floor(ms / 1000);
    const schedules = new Map<string, WordSchedule>([
        ["resilient", {
            algorithm: "FSRS", due: sec(now - 3600 * 1000), interval: 5,
            stability: 5, difficulty: 5, state: 2, reps: 3, lapses: 0,
            learningSteps: 0, lastReview: sec(now - 5 * DAY),
        }],
        ["ephemeral", { algorithm: "SM-2", due: sec(now + 7 * DAY), interval: 7, ease: 250 }],
    ]);

    const db = {
        getAllExpressionSimple: async (
            _ignores: boolean,
            sort: Record<string, "asc" | "desc"> = {},
            search: any = undefined,
            paginate: { page: number; pageSize: number } = { page: 0, pageSize: 20 }
        ) => {
            let rows = words.slice();
            if (search?.expression) {
                rows = rows.filter((w) => w.expression.includes(search.expression));
            }
            if (search?.meaning) {
                rows = rows.filter((w) => (w.meaning || "").includes(search.meaning));
            }
            if (search?.status !== undefined) {
                rows = rows.filter((w) => w.status === search.status);
            }
            if (search?.t) {
                rows = rows.filter((w) => w.t === search.t);
            }
            if (Array.isArray(search?.tags) && search.tags.length > 0) {
                rows = rows.filter((w) => search.tags.some((tg: string) => w.tags.includes(tg)));
            }
            const field = Object.keys(sort)[0] || "date";
            const order = sort[field] || "desc";
            rows.sort((a, b) => {
                const va = field === "date" ? a.date : a.status;
                const vb = field === "date" ? b.date : b.status;
                return order === "asc" ? va - vb : vb - va;
            });
            const total = rows.length;
            const page = paginate.page ?? 0;
            const pageSize = paginate.pageSize ?? 20;
            const data = rows.slice(page * pageSize, (page + 1) * pageSize).map((w) => ({
                expression: w.expression,
                meaning: w.meaning,
                status: w.status,
                t: w.t,
                tags: w.tags,
                note_num: w.notes.length,
                sen_num: w.sentences.length,
                date: w.date,
            }));
            return { data, total, page, pageSize };
        },
        getTags: async () => [...new Set(words.flatMap((w) => w.tags))],
        getExpression: async (expr: string) => {
            const w = words.find((x) => x.expression === expr);
            return w ? clone(w) : undefined;
        },
        postExpression: async (data: any) => {
            const i = words.findIndex((x) => x.expression === data.expression);
            if (i >= 0) words[i] = clone(data);
            else words = [clone(data), ...words];
            return 200;
        },
        removeExpression: async (expr: string) => {
            words = words.filter((x) => x.expression !== expr);
        },
        tryGetSen: async () => null,
        // Stat.vue 消费的统计接口（内存近似值，仅供 UI 调试）
        countSeven: async () =>
            Array.from({ length: 7 }, (_, i) => ({
                today: [0, 0, 0, 0, 0],
                accumulated: i === 6 ? [1, 2, 2, 2, 2] : [0, 0, 0, 0, 0],
            })),
        getCount: async () => ({ word_count: [1, 2, 2, 2, 2], phrase_count: [0, 1, 0, 0, 0] }),
        // ---- 复习调度（schedules 关联表） ----
        getSchedule: async (expr: string) => schedules.get(expr),
        putSchedule: async (expr: string, schedule: WordSchedule) => {
            schedules.set(expr, schedule);
        },
        getAllSchedules: async (): Promise<ReviewScheduleRecord[]> =>
            [...schedules].map(([expression, schedule]) => ({ expression, schedule })),
        importSchedules: async (items: ReviewScheduleRecord[]) => {
            for (const item of items) schedules.set(item.expression, item.schedule);
        },
    };

    const plugin = {
        store,
        settings: {
            storage: { storage_type: "idb" },
            auto_refresh_db: false,
            auto_pron: false,
            use_machine_trans: false,
            native: "zh",
            foreign: "en",
            review_prons: "0" as const,
            function_key: "ctrlKey",
            // 复习调度设置（对齐 settings.ts 默认值）
            review_algorithm: "FSRS" as const,
            review_fsrs_retention: 0.9,
            review_sm2_base_ease: 250,
            review_sm2_easy_bonus: 1.3,
            review_sm2_lapse_factor: 0.5,
            review_maximum_interval: 36525,
            review_show_interval: true,
            review_database: "",
        },
        app: { workspace: {} },
        storage: {
            DB: () => db,
            reRegister: async () => {},
        },
        refreshTextDB: async () => {},
    };

    return reactive(plugin);
}
