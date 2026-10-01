// DEBUG HARNESS: 从 Obsidian 安装目录的 asar 包里提取 app.css / 列出文件
// asar 头格式：8 字节 pickle 头 + 4 字节 JSON 长度 + JSON 索引，随后是文件内容
import { readFileSync, writeFileSync } from "node:fs";

const [,, asarPath, mode, outPath] = process.argv;
const buf = readFileSync(asarPath);

const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString("utf8", 16, 16 + jsonLen));
const dataStart = 8 + buf.readUInt32LE(4);

if (mode === "list") {
    const walk = (node, prefix) => {
        for (const [name, child] of Object.entries(node.files || {})) {
            if (child.files) walk(child, prefix + name + "/");
            else if (!child.unpacked && child.size) {
                if (/\.(css|js|html)$/.test(name) && prefix === "") {
                    console.log(name, child.size);
                }
            }
        }
    };
    walk(json, "");
} else if (mode === "extract") {
    const file = json.files[outPath];
    if (!file || file.unpacked) {
        console.error("not found in asar:", outPath);
        process.exit(1);
    }
    const content = buf.slice(dataStart + Number(file.offset), dataStart + Number(file.offset) + file.size);
    const dest = outPath.replace(/.*\//, "");
    writeFileSync(dest, content);
    console.log("extracted", dest, file.size, "bytes");
}
