import { describe, it, expect } from "vitest";
import { makeDrive } from "../setup/drive-factory";
import { parseCsvTable } from "@/storage/drive/csv/csv";

describe("csv persistence across reopen", () => {
    it("flushes pending writes on close and reloads them from CSV files", async () => {
        const first = await makeDrive("csv");
        await first.drive.postExpression({
            expression: "durable",
            meaning: "持久化, 带逗号",
            status: 2,
            t: "WORD",
            tags: ["fruit"],
            notes: [],
            connections: [],
            date: 0,
            sentences: [
                { expression: "durable", sentence: "stay, alive", trans: "", origin: "" },
            ],
        } as any);

        // close 应把去抖中的写入强制落盘（异步写需要让事件循环跑完）
        first.drive.close();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // CSV 文件已写入
        const exprFile = first.adapter.listFiles().find((f) =>
            f.endsWith("expressions.csv")
        );
        expect(exprFile).toBeTruthy();

        // 逗号/引号正确转义
        const raw = first.adapter.getText(exprFile!);
        expect(raw).toContain('"持久化, 带逗号"');

        const rows = parseCsvTable<Record<string, string>>(raw);
        expect(rows).toHaveLength(1);
        expect(rows[0].meaning).toBe("持久化, 带逗号");

        // 重开后数据完整
        const second = await makeDrive("csv", {
            adapter: first.adapter,
            storageName: first.storageName,
        });
        const got = await second.drive.getExpression("durable");
        expect(got).not.toBeNull();
        expect(got!.meaning).toBe("持久化, 带逗号");
        expect(got!.tags).toEqual(["fruit"]);
        expect(got!.sentences.map((s) => s.sentence)).toEqual(["stay, alive"]);

        second.drive.close();
    });
});
