import { describe, expect, it } from "vitest";
import { searchMemory } from "./retrieval";
import { embedText, embeddingInputOf, hashText } from "./ai";
import type { MemoryResource } from "@/types/memory";

async function makeResource(overrides: Partial<MemoryResource>): Promise<MemoryResource> {
  const now = new Date().toISOString();
  const base: MemoryResource = {
    id: overrides.id ?? "res_1",
    name: "Untitled",
    type: "page",
    url: "https://example.com/page",
    normalizedUrl: "example.com/page",
    description: "",
    whenToRemember: [],
    concepts: [],
    tags: [],
    collectionIds: [],
    notes: "",
    source: { title: "", url: "https://example.com/page", domain: "example.com", savedAt: now },
    feedback: { useful: 0, veryUseful: 0, notUseful: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return { ...base, embedding: await embedText(embeddingInputOf(base)) };
}

describe("searchMemory", () => {
  it("finds a page by a tag alone", async () => {
    const resources = [
      await makeResource({ id: "a", name: "Some article", tags: ["kubernetes"] }),
      await makeResource({ id: "b", name: "Unrelated" }),
    ];
    const results = await searchMemory(resources, "kubernetes");
    expect(results.map((result) => result.resource.id)).toEqual(["a"]);
    expect(results[0].matchedFields).toContain("tags");
  });

  it("finds a page by its notes alone", async () => {
    const resources = [
      await makeResource({
        id: "a",
        name: "Some article",
        notes: "the trick is to debounce the resize handler",
      }),
      await makeResource({ id: "b", name: "Unrelated" }),
    ];
    const results = await searchMemory(resources, "debounce");
    expect(results.map((result) => result.resource.id)).toEqual(["a"]);
    expect(results[0].matchedFields).toContain("notes");
  });

  it("finds a page by its address", async () => {
    const resources = [
      await makeResource({
        id: "a",
        name: "Docs",
        url: "https://playwright.dev/docs",
        normalizedUrl: "playwright.dev/docs",
      }),
      await makeResource({ id: "b", name: "Unrelated" }),
    ];
    const results = await searchMemory(resources, "playwright");
    expect(results.map((result) => result.resource.id)).toEqual(["a"]);
  });

  it("ranks a title match above a description match", async () => {
    const resources = [
      await makeResource({ id: "title", name: "Postgres indexing" }),
      await makeResource({ id: "description", name: "Notes", description: "a page about postgres indexing" }),
    ];
    const results = await searchMemory(resources, "postgres");
    expect(results[0].resource.id).toBe("title");
  });

  it("returns nothing for an empty query", async () => {
    const resources = [await makeResource({ id: "a", name: "Anything" })];
    await expect(searchMemory(resources, "   ")).resolves.toEqual([]);
  });

  it("does not compute embeddings while searching", async () => {
    // A resource with no stored vector must still be searchable lexically; the
    // semantic component simply contributes nothing.
    const bare = { ...(await makeResource({ id: "a", name: "Redis caching" })), embedding: undefined };
    const results = await searchMemory([bare], "redis");
    expect(results).toHaveLength(1);
    expect(results[0].semanticScore).toBe(0);
  });
});

describe("embeddings", () => {
  it("produces a stable unit vector", async () => {
    const first = await embedText("hello world");
    const second = await embedText("hello world");
    expect(first).toEqual(second);
    const magnitude = Math.sqrt(first.reduce((total, value) => total + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("hashes deterministically", () => {
    expect(hashText("recall")).toBe(hashText("recall"));
    expect(hashText("recall")).not.toBe(hashText("recalls"));
  });
});
