import { describe, it, expect } from "vitest";
import { makeDrive } from "../setup/drive-factory";

describe("sqlite persistence across reopen", () => {
    it("flushes pending writes on close and reloads them on open", async () => {
        const first = await makeDrive("sqlite");
        await first.drive.postExpression({
            expression: "durable",
            meaning: "持久化",
            status: 2,
            t: "WORD",
            tags: [],
            notes: [],
            connections: [],
            date: 0,
            sentences: [
                { expression: "durable", sentence: "stay alive", trans: "", origin: "" },
            ],
        } as any);

        // close 应把去抖中的写入强制落盘（异步写需要让事件循环跑完）
        first.drive.close();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const dbFile = first.adapter.listFiles().find((f) =>
            f.endsWith(`${first.storageName}.sqlite`)
        );
        expect(dbFile).toBeTruthy();

        // 用同一个 adapter 和库名重新打开，数据应完整
        const second = await makeDrive("sqlite", {
            adapter: first.adapter,
            storageName: first.storageName,
        });

        const got = await second.drive.getExpression("durable");
        expect(got).not.toBeNull();
        expect(got!.meaning).toBe("持久化");
        expect(got!.sentences.map((s) => s.sentence)).toEqual(["stay alive"]);

        second.drive.close();
    });
});
