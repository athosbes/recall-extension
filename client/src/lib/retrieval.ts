import type { MemoryResource, SearchResult } from "@/types/memory";
import { cosineSimilarity, embedText, tokenize } from "@/lib/ai";

/**
 * Field weights. Search used to look only at `name` and `description`, so a
 * page you had tagged or annotated was unfindable by that tag or annotation.
 */
const WEIGHTS = {
  name: 10,
  tags: 7,
  concepts: 5,
  description: 4,
  notes: 4,
  url: 3,
} as const;

type Field = keyof typeof WEIGHTS;

function fieldText(resource: MemoryResource, field: Field): string {
  switch (field) {
    case "name":
      return resource.name;
    case "tags":
      return resource.tags.join(" ");
    case "concepts":
      return resource.concepts.join(" ");
    case "description":
      return resource.description;
    case "notes":
      return resource.notes;
    case "url":
      return `${resource.normalizedUrl} ${resource.source?.domain ?? ""}`;
  }
}

function scoreField(haystack: string, query: string, terms: string[]): number {
  if (!haystack) return 0;
  const lower = haystack.toLowerCase();
  if (lower.includes(query)) return 1;

  const hits = terms.filter((term) => lower.includes(term)).length;
  return terms.length === 0 ? 0 : (hits / terms.length) * 0.6;
}

/**
 * Ranks resources against a query. Lexical matching leads; the stored embedding
 * only separates results that score alike, because the default embedder is a
 * hashed bag of words with no real semantics behind it.
 *
 * Embeddings are read from the resource, never computed here — they are written
 * once at save time by `putResource`.
 */
export async function searchMemory(resources: MemoryResource[], rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const terms = tokenize(query);
  const queryVector = await embedText(query);
  const results: SearchResult[] = [];

  for (const resource of resources) {
    let lexicalScore = 0;
    const matchedFields: string[] = [];

    for (const field of Object.keys(WEIGHTS) as Field[]) {
      const score = scoreField(fieldText(resource, field), query, terms);
      if (score > 0) {
        lexicalScore += score * WEIGHTS[field];
        matchedFields.push(field);
      }
    }

    const semanticScore = resource.embedding?.length
      ? cosineSimilarity(queryVector, resource.embedding) * 2
      : 0;

    const score = lexicalScore + semanticScore;
    if (score < 1) continue;

    results.push({ resource, score, lexicalScore, semanticScore, matchedFields });
  }

  return results.sort((a, b) => b.score - a.score || a.resource.name.localeCompare(b.resource.name));
}
