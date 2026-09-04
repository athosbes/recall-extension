# Recall

**A bookmark that remembers why you saved it.**

[![CI](https://github.com/athosbes/recall-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/athosbes/recall-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)

A browser bookmark is a URL and a title. Six months later that is not enough to find
anything. Recall captures the page _and_ the context — what it is, what it was for, the
text you had selected, the note you left yourself — and lets you find it again by
describing the problem rather than remembering the title.

Everything lives in your browser's IndexedDB. No account, no server, no network calls.

---

## What it does

- **Capture with context.** Click the toolbar icon on any page. Recall fills in the
  title, description, type, concepts and tags from the page itself, and picks up any
  text you had selected. Edit anything before saving.
- **Tells you when a page is already saved.** The toolbar icon shows a ✓ on pages
  already in your library, and the popup opens in update mode instead of quietly
  creating a duplicate. Matching ignores tracking parameters, `www.`, fragments and
  trailing slashes, so the same page reached from a newsletter link still matches.
- **A library you can actually work with.** Browse everything you saved, sort it,
  filter by collection, tag, type or site, and edit any field afterwards — name, tags,
  notes, URL, collection. Deleting offers an undo.
- **Search that reads more than the title.** Matches names, tags, notes, concepts,
  descriptions and addresses, and tells you which field matched.
- **Collections.** Group related pages; a page can sit in several.
- **Backup and restore.** Export the whole library as JSON. Restoring merges by page
  address, so bringing a backup back never leaves you with two copies of a page you
  re-captured in the meantime.

---

## Install

### From a release

1. Download `recall-<version>.zip` from [Releases](../../releases).
2. Unzip it.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder — the one containing
   `manifest.json`.

Not on the Chrome Web Store yet.

### From source

Requires Node.js 22+ and pnpm 10+.

```bash
git clone https://github.com/athosbes/recall-extension.git
cd recall-extension
pnpm install
pnpm build
pnpm package:extension
```

Then load `dist/recall-chromium-extension` as an unpacked extension.

---

## Using it

| Action                           | How                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Capture the current page         | Click the toolbar icon, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on macOS) |
| Save selected text with the page | Select text, right-click → **Save selection to Recall**                                                                              |
| Search from a page               | Select text, right-click → **Search Recall for …**                                                                                   |
| Open the library                 | The **Library & settings** link at the bottom of the popup                                                                           |
| Check if a page is saved         | The ✓ badge on the toolbar icon                                                                                                      |

---

## Permissions

Recall asks for the narrowest set that makes the features work. There are no
`host_permissions` and no content script registered against `<all_urls>` — the page
reader is injected only into the tab you are capturing, only when you capture it.

| Permission      | Why                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `activeTab`     | Read the title, URL and metadata of the tab you are capturing, at the moment you invoke Recall |
| `scripting`     | Inject the metadata reader into that one tab on demand                                         |
| `storage`       | Remember your preferences and backup reminders (your library itself lives in IndexedDB)        |
| `contextMenus`  | The right-click save and search entries                                                        |
| `alarms`        | The periodic "you have not backed up in a while" check                                         |
| `notifications` | Show that reminder                                                                             |

---

## Your data

Captures, notes, tags and screenshots are written to IndexedDB in your browser
profile, and nothing else. Recall makes no network requests — you can verify that in
the Network tab, or by reading `client/src/`, which contains no `fetch` call at all.

The flip side of that is real: **if the browser profile goes, so does your library.**
Recall asks the browser for persistent storage and reminds you to back up weekly or
every 50 captures, but exporting now and then is worth the ten seconds.

---

## Development

```bash
pnpm install
pnpm dev                  # rebuild on change; reload the extension in chrome://extensions
pnpm check                # TypeScript
pnpm lint                 # ESLint
pnpm test                 # Vitest
pnpm build                # production build into dist/public
pnpm package:extension    # loadable folder in dist/recall-chromium-extension
pnpm validate:manifest    # the checks Chrome performs, with readable errors
pnpm zip                  # build, package and archive with a checksum
```

```text
├── assets/icon.svg              # icon source; `pnpm icons` renders the PNGs
├── client/
│   ├── public/                  # manifest.json, content.js, generated icons
│   ├── src/
│   │   ├── background/          # service worker: badge, context menus, screenshots
│   │   ├── components/          # UI, including the vendored shadcn subset
│   │   ├── lib/                 # storage, URL canonicalisation, retrieval, embeddings
│   │   ├── pages/               # dashboard: library, search, settings
│   │   └── popup.tsx            # the capture popup
│   ├── index.html               # dashboard
│   └── popup.html               # popup
├── scripts/                     # icon generation, packaging, versioning, zipping
└── .github/workflows/           # CI on every PR, release on every v* tag
```

Storage goes through the `MemoryRepository` interface in
[`client/src/lib/memory.ts`](client/src/lib/memory.ts). `IndexedDbRepository` is the
only implementation today; that interface is the seam where a synced backend would
plug in without the UI knowing.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

---

## Releasing

The git tag is the source of truth for the version. CI stamps it into both
`package.json` and `manifest.json`, so a published zip can never disagree with the tag
that built it.

```bash
# update CHANGELOG.md first
git tag v1.1.0
git push origin v1.1.0
```

The workflow lints, type-checks, tests, builds, packages, validates the manifest, then
publishes a GitHub Release with the zip, its SHA-256, and the matching changelog
section.

---

## Roadmap

- On-device embeddings via [Google AI Edge LiteRT-LM](https://ai.google.dev/edge),
  behind an opt-in setting with the model downloaded on demand — see
  [docs/local-ai.md](docs/local-ai.md). The `AIProvider` interface is already the
  extension point; nothing is bundled, so the extension stays small.
- Relationships between saved pages ("alternative to", "used with").
- Optional end-to-end encrypted sync, for people who want their library on more than
  one machine.
- Firefox support (the code is close; the manifest and packaging are not).

---

## License

[MIT](LICENSE)
