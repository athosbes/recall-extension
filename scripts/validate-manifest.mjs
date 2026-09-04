// Fails the build on the manifest mistakes that only surface when a human tries
// to load the extension, most of which Chrome reports as an opaque
// "Could not load manifest" with no detail.
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? path.join(root, "dist", "recall-chromium-extension");

const problems = [];

async function checkFile(relative, label) {
  try {
    await access(path.join(target, relative));
  } catch {
    problems.push(`${label} points at "${relative}", which is not in the package.`);
  }
}

const manifest = JSON.parse(await readFile(path.join(target, "manifest.json"), "utf8"));

if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3.");
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? "")) {
  problems.push(`version "${manifest.version}" is not a valid Chrome version (digits and dots only).`);
}
if (!manifest.name || !manifest.description) problems.push("name and description are required.");

const iconGroups = [
  ["icons", manifest.icons],
  ["action.default_icon", manifest.action?.default_icon],
];

for (const [group, icons] of iconGroups) {
  for (const [size, file] of Object.entries(icons ?? {})) {
    // Chrome does not support SVG for extension icons and rejects the load.
    if (!String(file).endsWith(".png")) {
      problems.push(`${group}[${size}] must be a .png, got "${file}".`);
    }
    await checkFile(String(file), `${group}[${size}]`);
  }
}

if (manifest.action?.default_popup) {
  await checkFile(manifest.action.default_popup, "action.default_popup");
}
if (manifest.background?.service_worker) {
  await checkFile(manifest.background.service_worker, "background.service_worker");
}
for (const entry of manifest.content_scripts ?? []) {
  for (const file of entry.js ?? []) await checkFile(file, "content_scripts.js");
}

// Checking that the entry points exist is not enough: a stale or partial build
// can leave an HTML file pointing at a hashed bundle that is no longer there,
// which installs cleanly and then renders a blank page.
async function checkReferences(relative, patterns) {
  let contents;
  try {
    contents = await readFile(path.join(target, relative), "utf8");
  } catch {
    return; // the missing-file check above already reported this
  }

  const referenced = new Set();
  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern)) referenced.add(match[1]);
  }

  for (const reference of referenced) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), reference));
    await checkFile(resolved, relative);
  }
}

const HTML_REFERENCES = [/<script[^>]+src="([^"]+)"/g, /<link[^>]+href="([^"]+\.css)"/g];
const MODULE_IMPORTS = [/(?:from|import)\s*"(\.[^"]+)"/g];

for (const page of ["index.html", "popup.html"]) {
  await checkReferences(page, HTML_REFERENCES);
}
if (manifest.background?.service_worker) {
  await checkReferences(manifest.background.service_worker, MODULE_IMPORTS);
}

async function walk(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) {
      problems.push(`"${prefix}${entry.name}" uses a Chrome-reserved name.`);
    }
    if (entry.isDirectory()) await walk(path.join(directory, entry.name), `${prefix}${entry.name}/`);
  }
}
await walk(target);

if (problems.length) {
  console.error("Manifest validation failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`manifest.json is valid (${manifest.name} ${manifest.version}).`);
