# Changelog

All notable changes to Recall are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

First open-source release.

### Added

- **Already-saved detection.** Pages are keyed by a canonical URL that ignores tracking
  parameters, `www.`, fragments, ports and trailing slashes. The toolbar icon shows a ✓
  on a page already in your library, and the popup opens in update mode rather than
  creating a duplicate — with an explicit "save as a separate entry" escape hatch.
- **Library view.** Browse everything saved, sorted and filtered by collection, tag,
  type or site, with pagination.
- **Editing.** Any field of a saved resource can be changed afterwards; deleting offers
  an undo.
- **Collections.** Group related pages; a page can belong to several. Deleting a
  collection keeps its pages.
- **Editable tags** in the capture popup.
- CI on every pull request, and releases that take their version from the git tag.

### Changed

- Search now covers names, tags, notes, concepts, descriptions and addresses, and
  reports which field matched. It previously read only the name and description.
- Embeddings are computed once when a resource is saved instead of being recomputed for
  every resource on every keystroke.
- IndexedDB stores now have key paths and indexes (schema version 3). Existing data is
  migrated in place on first run.
- Backup restore merges by page address instead of overwriting the whole database, so
  restoring cannot silently drop collections or view history.
- The area screenshot runs in the service worker, so it survives the popup closing when
  you click the page, and the crop accounts for device pixel ratio.
- The metadata reader is injected on demand rather than running on every page you visit.
- Documentation is in English throughout.

### Fixed

- The extension now loads in Chrome at all: icons are PNG, not SVG, which Chrome
  rejects.
- The dashboard no longer crashes on records saved without a `source` field.
- The backup reminder notification now appears; it referenced an SVG icon that Chrome
  could not load.
- "Search Recall for …" in the context menu now actually runs the search.
- Fixed `Math.abs` called with two arguments in the screenshot selection code.
- Fixed the packaging error message printing its own source text instead of the
  offending filenames.
- Guarded a division by zero in the storage usage meter.

### Removed

- The unused Express + tRPC + Drizzle/MySQL backend, the OAuth login flow, the vendor
  telemetry collector and the demo pages inherited from the project scaffold. The
  dashboard no longer bundles an API client pointing at an endpoint that cannot exist
  inside an extension.

[Unreleased]: https://github.com/athosbes/recall-extension/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/athosbes/recall-extension/releases/tag/v1.0.0
