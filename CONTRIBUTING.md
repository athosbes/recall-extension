# Contributing to Recall

Thanks for taking a look. Bug reports, small fixes and considered features are all
welcome.

## Ground rules

Recall is local-first, and that is the constraint everything else bends around:

- **No network calls.** Not for analytics, not for fonts, not for "just this one
  lookup". If a feature needs data from elsewhere, it needs an explicit opt-in and an
  issue to discuss it first.
- **No new permissions without a reason in the pull request.** Every entry in
  `manifest.json` is justified in the README's permissions table; adding one means
  updating that table.
- **Do not lose people's data.** Changes to `client/src/lib/memory.ts` need a
  migration and a test that proves existing records survive the upgrade.

## Getting set up

Node.js 22+ and pnpm 10+.

```bash
git clone https://github.com/<your-username>/recall-extension.git
cd recall-extension
pnpm install
pnpm build
pnpm package:extension
```

Load `dist/recall-chromium-extension` at `chrome://extensions` with Developer mode on.

## The loop

`pnpm dev` rebuilds on save. Chrome does not pick that up on its own:

- **Popup or dashboard changes** — close and reopen the popup, or reload the dashboard
  tab.
- **Service worker or content script changes** — press the reload arrow on the Recall
  card at `chrome://extensions`.

To debug: the service worker has an **Inspect views: service worker** link on that
card; the popup has one via right-click → Inspect; the dashboard is an ordinary tab.

## Before opening a pull request

```bash
pnpm format
pnpm check
pnpm lint
pnpm test
```

CI runs all of these plus a build, a package and a manifest validation on every pull
request, and uploads the built extension as an artifact so a reviewer can load your
branch.

## Where things live

| Area                                      | Path                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Storage, migrations, dedup                | `client/src/lib/memory.ts`                                                 |
| URL canonicalisation (the dedup key)      | `client/src/lib/url.ts`                                                    |
| Search ranking                            | `client/src/lib/retrieval.ts`                                              |
| Embeddings and the on-device AI seam      | `client/src/lib/ai.ts`                                                     |
| Service worker: badge, menus, screenshots | `client/src/background/index.ts`                                           |
| Page metadata reader                      | `client/public/content.js` (plain JS — it is injected as a classic script) |
| Capture popup                             | `client/src/popup.tsx`                                                     |
| Dashboard                                 | `client/src/pages/`                                                        |

`client/src/components/ui/` is vendored [shadcn/ui](https://ui.shadcn.com). Prefer
leaving those files alone; only the components actually used are kept.

## Style

- TypeScript, no `any` in new code.
- Prettier and ESLint decide formatting and lint; do not hand-tune around them.
- Comment the _why_, not the _what_ — particularly around IndexedDB and Chrome
  extension lifecycle behaviour, which is where the surprises are.
- Conventional-ish commit subjects (`fix:`, `feat:`, `docs:`, `chore:`) are appreciated
  but not enforced.

## Releases

Maintainers only. Update `CHANGELOG.md`, then push a `v*` tag; the workflow stamps the
version into `package.json` and `manifest.json`, builds, and publishes the release.
