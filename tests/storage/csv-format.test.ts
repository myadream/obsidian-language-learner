import { describe, it, expect } from "vitest";
import {
    parseCsvLine,
    parseCsvTable,
    stringifyCsvRow,
    stringifyCsvTable,
} from "@/storage/drive/csv/csv";

describe("csv serialization", () => {
    it("plain fields need no quoting", () => {
        expect(stringifyCsvRow(["apple", "苹果", 1, null, undefined])).toBe(
            "apple,苹果,1,,"
        );
    });

    it("quotes fields containing comma/quote/newline and escapes quotes", () => {
        expect(stringifyCsvRow(['say "hi", ok'])).toBe('"say ""hi"", ok"');
        expect(stringifyCsvRow(["line\nbreak"])).toBe('"line\nbreak"');
    });

    it("parseCsvLine handles quoted commas and escaped quotes", () => {
        expect(parseCsvLine('a,"b,c","d""e"')).toEqual(["a", "b,c", 'd"e']);
        expect(parseCsvLine("plain,row")).toEqual(["plain", "row"]);
    });

    it("table roundtrip preserves values", () => {
        const rows = [
            { _id: "1", expression: "apple", meaning: "含,逗号", status: "2", t: "WORD", date: "100" },
            { _id: "2", expression: 'qu"ote', meaning: "", status: "0", t: "WORD", date: "200" },
        ];
        const text = stringifyCsvTable(rows, ["_id", "expression", "meaning", "status", "t", "date"]);
        const parsed = parseCsvTable<Record<string, string>>(text);
        expect(parsed).toEqual(rows);
    });

    it("parses empty text to empty table", () => {
        expect(parseCsvTable("")).toEqual([]);
    });
});
