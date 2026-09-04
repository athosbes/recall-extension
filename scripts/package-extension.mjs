// Copies the Vite output into a folder that Chrome will accept as an unpacked
// extension, then verifies it. Chrome rejects any path segment starting with
// "_", so that is checked rather than assumed.
import { cp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "dist", "public");
const release = path.join(root, "dist", "recall-chromium-extension");

async function findReservedNames(directory) {
  const reserved = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.name.startsWith("_")) reserved.push(path.relative(directory, target));
      if (entry.isDirectory()) pending.push(target);
    }
  }
  return reserved;
}

await rm(release, { recursive: true, force: true });
await cp(source, release, { recursive: true });
await rm(path.join(release, ".gitkeep"), { force: true });

const reserved = await findReservedNames(release);
if (reserved.length) {
  throw new Error(`Chrome-reserved names found in the package: ${reserved.join(", ")}`);
}

await writeFile(
  path.join(release, "LOAD_IN_CHROME.txt"),
  [
    "Load this exact folder in chrome://extensions (Developer mode > Load unpacked):",
    "",
    "  dist/recall-chromium-extension",
    "",
    "Not the parent dist folder, and not a .zip file. manifest.json must sit at",
    "the root of the folder you select.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`Packaged extension ready in ${path.relative(root, release)}`);
