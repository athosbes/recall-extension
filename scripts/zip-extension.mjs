// Zips the packaged extension and writes a checksum beside it.
//
// Implemented with Node's own zlib so the release workflow does not depend on a
// zip binary being installed on the runner.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "dist", "recall-chromium-extension");
const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const output = path.join(root, "dist", `recall-${version}.zip`);

// Instructions for loading the unpacked folder do not belong in the archive.
const EXCLUDED = new Set(["LOAD_IN_CHROME.txt"]);

async function collect(directory, prefix = "") {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (EXCLUDED.has(relative)) continue;
    if (entry.isDirectory()) {
      files.push(...(await collect(path.join(directory, entry.name), `${relative}/`)));
    } else {
      files.push(relative);
    }
  }
  return files;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const names = await collect(source);
const payload = [];
const central = [];
let offset = 0;

for (const name of names) {
  const data = await readFile(path.join(source, name));
  const compressed = deflateRawSync(data, { level: 9 });
  const nameBytes = Buffer.from(name, "utf8");
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 file names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  payload.push(local, nameBytes, compressed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(compressed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBytes.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBytes);

  offset += local.length + nameBytes.length + compressed.length;
}

const centralBuffer = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(centralBuffer.length, 12);
end.writeUInt32LE(offset, 16);

const archive = Buffer.concat([...payload, centralBuffer, end]);
await writeFile(output, archive);

const digest = createHash("sha256").update(archive).digest("hex");
await writeFile(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`, "utf8");

console.log(
  `${path.relative(root, output)} — ${names.length} files, ${(archive.length / 1024).toFixed(0)} KB`,
);
console.log(`sha256 ${digest}`);
