// Stamps one version across package.json and the manifest.
//
// Releases take the version from the git tag, so the published zip can never
// disagree with the tag that produced it.
//
// Usage: node scripts/set-version.mjs v1.2.0
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.argv[2];

if (!raw) {
  console.error("Usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

const version = raw.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`"${raw}" is not a semver version.`);
  process.exit(1);
}

// A Chrome version is up to four dot-separated integers, so a prerelease suffix
// has to be dropped from the manifest even though npm keeps it.
const manifestVersion = version.split("-")[0];

const targets = [
  ["package.json", (json) => ({ ...json, version })],
  ["client/public/manifest.json", (json) => ({ ...json, version: manifestVersion })],
];

for (const [file, update] of targets) {
  const target = path.join(root, file);
  const json = JSON.parse(await readFile(target, "utf8"));
  await writeFile(target, `${JSON.stringify(update(json), null, 2)}\n`, "utf8");
}

console.log(`Version set to ${version} (manifest ${manifestVersion}).`);
