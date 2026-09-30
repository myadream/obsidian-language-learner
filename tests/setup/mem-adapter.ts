import * as fs from "fs";
import * as path from "path";
import { normalizePath } from "./obsidian-stub";

/**
 * 内存版 vault adapter，模拟 Obsidian 的 DataAdapter 子集：
 * exists / mkdir / read / write / readBinary / writeBinary
 * 并能从 node_modules 提供真实的 sql-wasm.wasm，供 SQLite 驱动初始化。
 */
export class MemVaultAdapter {
    files = new Map<string, string | Uint8Array>();
    dirs = new Set<string>();

    constructor() {
        this.dirs.add("");
    }

    /** 把真实的 sql-wasm.wasm 预置到 Obsidian 插件目录路径下 */
    provideSqlWasm(manifestId: string): void {
        const wasmPath = normalizePath(
            `.obsidian/plugins/${manifestId}/sql-wasm.wasm`
        );
        const from = path
            .resolve(__dirname, "../../node_modules/sql.js/dist/sql-wasm.wasm")
            .replace(/\\/g, "/");
        this.files.set(wasmPath, new Uint8Array(fs.readFileSync(from)));
    }

    private ensureDir(dir: string) {
        const parts = dir.split("/").filter(Boolean);
        let cur = "";
        for (const part of parts) {
            cur = cur ? `${cur}/${part}` : part;
            this.dirs.add(cur);
        }
    }

    async exists(p: string): Promise<boolean> {
        const np = normalizePath(p);
        return this.files.has(np) || this.dirs.has(np);
    }

    async mkdir(p: string): Promise<void> {
        this.ensureDir(normalizePath(p));
    }

    async read(p: string): Promise<string> {
        const data = this.files.get(normalizePath(p));
        if (typeof data !== "string") {
            throw new Error(`MemVaultAdapter: no text file at ${p}`);
        }
        return data;
    }

    async write(p: string, data: string): Promise<void> {
        const np = normalizePath(p);
        this.ensureDir(np.split("/").slice(0, -1).join("/"));
        this.files.set(np, data);
    }

    async readBinary(p: string): Promise<ArrayBuffer> {
        const data = this.files.get(normalizePath(p));
        if (!(data instanceof Uint8Array)) {
            throw new Error(`MemVaultAdapter: no binary file at ${p}`);
        }
        const copy = new ArrayBuffer(data.byteLength);
        new Uint8Array(copy).set(data);
        return copy;
    }

    async writeBinary(p: string, data: ArrayBuffer): Promise<void> {
        const np = normalizePath(p);
        this.ensureDir(np.split("/").slice(0, -1).join("/"));
        this.files.set(np, new Uint8Array(data));
    }

    async remove(p: string, recursive?: boolean): Promise<void> {
        const np = normalizePath(p);
        this.files.delete(np);
        if (recursive) {
            // 删除时需要快照，避免边遍历边修改集合
            for (const key of Array.from(this.files.keys())) {
                if (key.startsWith(np + "/")) this.files.delete(key);
            }
            for (const key of Array.from(this.dirs)) {
                if (key.startsWith(np)) this.dirs.delete(key);
            }
        }
    }

    getText(p: string): string {
        return this.files.get(normalizePath(p)) as string;
    }

    listFiles(): string[] {
        return [...this.files.keys()];
    }
}
