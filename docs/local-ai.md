# On-device AI

Recall's search is deliberately unglamorous today, and the plan for making it smarter
is deliberately conservative. This document records the intent so the seam does not
rot, and so nobody adds a 400 MB model to the repository by surprise.

## What ships today

`client/src/lib/ai.ts` defines one interface and one implementation:

```ts
export interface AIProvider {
  id: string;
  name: string;
  ready: boolean;
  dimensions: number;
  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
}
```

`DeterministicProvider` hashes tokens into a 128-dimension bag-of-words vector and
normalises it. It needs no download, no network, no WASM, and it runs in under a
millisecond. It also carries no semantics whatsoever: it cannot tell you that "browser
automation" and "headless testing" are related.

That is why `client/src/lib/retrieval.ts` leads with weighted lexical matching across
name, tags, concepts, description, notes and URL, and lets the vector only break ties
between results that already score alike. Search stays honest about what it is.

Embeddings are written once, by `putResource`, and keyed by a hash of the text they
came from (`embeddingInputHash`), so editing a note recomputes exactly one vector and
nothing else.

## The intended upgrade: LiteRT-LM

[Google AI Edge](https://ai.google.dev/edge) provides LiteRT (formerly TensorFlow Lite)
and LiteRT-LM for running small models on-device. A quantised embedding model —
EmbeddingGemma is the obvious candidate — would give Recall genuine semantic search
while keeping the local-first promise completely intact.

Constraints that shape how it must be added:

1. **Nothing is bundled.** A published extension has to stay small enough to install
   quickly, and the Chrome Web Store package limit is real. The model is downloaded on
   demand, after the user opts in, and stored as a `Blob` in IndexedDB.
2. **It is opt-in and reversible.** A setting turns it on; turning it off deletes the
   model and falls back to the deterministic provider. Neither direction may lose a
   saved resource.
3. **The default keeps working.** Anyone who never enables it gets exactly today's
   behaviour with no extra bytes downloaded.
4. **It stays offline.** One download, from a URL the user can see, with a checksum
   verified before the model is used. After that, no network.

## Sketch of the work

- Add `LiteRtProvider implements AIProvider`, lazily initialising the runtime and
  reporting `ready: false` until the model is present.
- Reintroduce a `model_files` object store (removed in schema version 3 because nothing
  used it) to hold the downloaded blob, with a recorded SHA-256.
- Register the provider in `aiProviders` and make `activeProvider()` consult a setting
  rather than always returning the deterministic one.
- Handle the dimension change. Vectors from different providers are not comparable, so
  switching providers has to re-embed the library — a background pass over
  `resources`, driven by `embeddingInputHash`, with visible progress. `embeddingKind`
  already exists on `MemoryResource` to record which provider produced each vector.
- Raise `semanticScore`'s weight in `retrieval.ts` only when the active provider is a
  real model.

## Alternatives considered

- **Chrome's built-in Prompt API** (`window.ai`) is simpler but Chrome-only,
  origin-trial gated, and not an embedding API. Worth revisiting if it stabilises.
- **transformers.js / ONNX Runtime Web** works today and is the shortest path, at the
  cost of a larger runtime and no path to the Android/desktop targets LiteRT covers.
- **A hosted embedding API** is off the table: it would break the one promise the
  project makes.
