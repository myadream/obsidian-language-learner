import { describe, expect, it } from "vitest";
import { formatInterval } from "@/review/format";

describe("formatInterval", () => {
    it("小时/天/月/年分段", () => {
        expect(formatInterval(0.5)).toBe("12h");
        expect(formatInterval(3)).toBe("3d");
        expect(formatInterval(45)).toBe("1.5mo");
        expect(formatInterval(400)).toBe("1.1y");
    });

    it("0 或负间隔 → now（Again/短期立即重学）", () => {
        expect(formatInterval(0)).toBe("now");
        expect(formatInterval(-1)).toBe("now");
    });

    it("亚小时向上取整为 1h", () => {
        expect(formatInterval(10 / 1440)).toBe("1h"); // 10 分钟
    });
});
