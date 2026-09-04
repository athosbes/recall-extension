import type { MemoryResource } from "@/types/memory";

/**
 * Pluggable text embedder.
 *
 * The default implementation needs no download and no network. It is the seam
 * for an on-device model (Google AI Edge LiteRT-LM is the intended one) which
 * would register here behind an opt-in setting — see docs/local-ai.md. Nothing
 * above this module knows which provider produced a vector, only that all
 * vectors in the store share a dimension.
 */
export interface AIProvider {
  id: string;
  name: string;
  ready: boolean;
  dimensions: number;
  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
}

const DIMENSIONS = 128;

/**
 * A hashed bag-of-words vector: each token is hashed into a bucket and the
 * result is L2-normalized. Cheap, stable across runs, and good enough to rank
 * near-duplicates — but it carries no semantics, which is why lexical scoring
 * leads in retrieval.ts and this only breaks ties.
 */
export class DeterministicProvider implements AIProvider {
  id = "deterministic";
  name = "Deterministic (no download)";
  ready = true;
  dimensions = DIMENSIONS;

  async initialize() {}

  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    for (const token of tokenize(text)) {
      vector[hashText(token) % DIMENSIONS] += 1;
    }
    const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
    return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
  }
}

export const aiProviders: Record<string, AIProvider> = {
  deterministic: new DeterministicProvider(),
};

export const activeProvider = (): AIProvider => aiProviders.deterministic;

export const embedText = (text: string) => activeProvider().embed(text);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

/** FNV-1a. Used both for embedding buckets and for change detection. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The text a resource's embedding is derived from. */
export function embeddingInputOf(
  resource: Pick<MemoryResource, "name" | "description" | "notes" | "tags" | "concepts">,
) {
  return [resource.name, resource.description, resource.notes, ...resource.tags, ...resource.concepts]
    .filter(Boolean)
    .join(" ");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator === 0 ? 0 : dot / denominator;
}
