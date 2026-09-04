// Renders the committed SVG source into the PNG sizes the manifest needs.
// Chrome does not support SVG for extension icons, so the PNGs are committed
// and this script only needs to run when assets/icon.svg changes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "assets", "icon.svg");
const outputDir = path.join(root, "client", "public", "icons");
const sizes = [16, 32, 48, 128];

const svg = await readFile(source);
await mkdir(outputDir, { recursive: true });

for (const size of sizes) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(outputDir, `icon-${size}.png`), png);
  console.log(`icons/icon-${size}.png (${png.length} bytes)`);
}
