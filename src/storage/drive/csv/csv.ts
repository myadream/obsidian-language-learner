/**
 * CSV 行的序列化与解析（RFC 4180 风格）：
 * - 字段含逗号/引号/换行时加引号，内部引号翻倍；
 * - 解析支持带引号字段内的逗号与转义引号。
 */

export function csvNeedsQuote(field: string): boolean {
    return /[",\r\n]/.test(field);
}

export function stringifyCsvRow(fields: Array<string | number | null | undefined>): string {
    return fields
        .map((f) => {
            const s = f === null || f === undefined ? "" : String(f);
            if (csvNeedsQuote(s)) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        })
        .join(",");
}

/** 解析单行 CSV（不含行尾换行符），处理引号内逗号与 "" 转义 */
export function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            values.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    values.push(current);
    return values;
}

/** 解析整段 CSV 文本为对象数组；首行为表头；跳过空行 */
export function parseCsvTable<T extends Record<string, string>>(text: string): T[] {
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) {
        return [];
    }

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row = {} as T;
        headers.forEach((h, i) => {
            (row as any)[h] = values[i] ?? "";
        });
        return row;
    });
}

/** 把对象数组序列化为 CSV 文本（含表头） */
export function stringifyCsvTable<T extends Record<string, any>>(
    rows: T[],
    headers: Array<keyof T & string>
): string {
    const head = stringifyCsvRow(headers);
    const body = rows.map((row) => stringifyCsvRow(headers.map((h) => row[h])));
    return [head, ...body].join("\n") + "\n";
}
