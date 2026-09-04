import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbRepository, createId, migrateResource, parseSnapshot, sortResources } from "./memory";
import type { MemoryResource } from "@/types/memory";

function makeResource(overrides: Partial<MemoryResource> = {}): MemoryResource {
  const now = new Date().toISOString();
  return {
    id: createId("res"),
    name: "Playwright",
    type: "tool",
    url: "https://playwright.dev/docs/intro",
    normalizedUrl: "playwright.dev/docs/intro",
    description: "Browser automation library",
    whenToRemember: [],
    concepts: ["automation"],
    tags: ["testing", "browser"],
    collectionIds: [],
    notes: "Handles shadow DOM well",
    source: {
      title: "Playwright",
      url: "https://playwright.dev/docs/intro",
      domain: "playwright.dev",
      savedAt: now,
    },
    feedback: { useful: 0, veryUseful: 0, notUseful: 0 },
    createdAt: now,
    updatedAt: now,
    viewCount: 0,
    ...overrides,
  };
}

/** Writes a database shaped like schema version 2: no keyPath, no indexes. */
function seedLegacyDatabase(records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("recall-memory", 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of [
        "resources",
        "relationships",
        "queries",
        "feedback",
        "agent_state",
        "settings",
        "model_files",
        "view_history",
      ]) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("resources", "readwrite");
      const store = transaction.objectStore("resources");
      for (const record of records) store.put(record, (record as { id: string }).id);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

beforeEach(() => {
  // A fresh IndexedDB per test so upgrades are exercised from a known state.
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("schema migration from version 2", () => {
  it("keeps every record and backfills the fields v3 added", async () => {
    await seedLegacyDatabase([
      { id: "res_1", name: "Old page", url: "https://www.example.com/one/?utm_source=rss", description: "" },
      { id: "res_2", name: "Second", source: { url: "https://example.com/two", domain: "example.com" } },
    ]);

    const repository = new IndexedDbRepository();
    const resources = await repository.listResources();

    expect(resources).toHaveLength(2);
    const first = resources.find((row) => row.id === "res_1")!;
    expect(first.normalizedUrl).toBe("example.com/one");
    expect(first.tags).toEqual([]);
    expect(first.collectionIds).toEqual([]);
    // Records written before `source` existed used to crash the dashboard.
    expect(first.source).toBeDefined();

    const second = resources.find((row) => row.id === "res_2")!;
    expect(second.normalizedUrl).toBe("example.com/two");
  });

  it("makes migrated records findable by URL through the new index", async () => {
    await seedLegacyDatabase([{ id: "res_1", name: "Old page", url: "https://example.com/one" }]);

    const repository = new IndexedDbRepository();
    const found = await repository.findByUrl("https://www.example.com/one/?utm_campaign=newsletter");
    expect(found?.id).toBe("res_1");
  });

  it("drops the stores for features that were never built", async () => {
    await seedLegacyDatabase([{ id: "res_1", name: "Old page", url: "https://example.com/one" }]);

    const repository = new IndexedDbRepository();
    await repository.listResources();

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("recall-memory");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect([...database.objectStoreNames]).not.toContain("model_files");
    expect([...database.objectStoreNames]).toContain("collections");
    database.close();
  });
});

describe("deduplication", () => {
  it("finds an existing page from any equivalent link", async () => {
    const repository = new IndexedDbRepository();
    await repository.putResource(makeResource());

    for (const variant of [
      "https://playwright.dev/docs/intro",
      "https://www.playwright.dev/docs/intro/",
      "http://playwright.dev/docs/intro#installation",
      "https://playwright.dev/docs/intro?utm_source=newsletter",
    ]) {
      await expect(repository.findByUrl(variant)).resolves.toBeDefined();
    }
  });

  it("does not match a different page on the same site", async () => {
    const repository = new IndexedDbRepository();
    await repository.putResource(makeResource());
    await expect(repository.findByUrl("https://playwright.dev/docs/api")).resolves.toBeUndefined();
  });

  it("updates in place rather than adding a second copy", async () => {
    const repository = new IndexedDbRepository();
    const saved = await repository.putResource(makeResource());

    const existing = await repository.findByUrl("https://playwright.dev/docs/intro");
    await repository.putResource({ ...existing!, notes: "Updated note" });

    const all = await repository.listResources();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);
    expect(all[0].notes).toBe("Updated note");
  });

  it("still allows a deliberate second entry for the same URL", async () => {
    const repository = new IndexedDbRepository();
    await repository.putResource(makeResource());
    await repository.putResource(makeResource({ name: "Playwright, revisited" }));
    await expect(repository.listResources()).resolves.toHaveLength(2);
  });
});

describe("embeddings", () => {
  it("computes a vector once at save time", async () => {
    const repository = new IndexedDbRepository();
    const saved = await repository.putResource(makeResource());

    expect(saved.embedding?.length).toBeGreaterThan(0);
    expect(saved.embeddingInputHash).toBeTruthy();

    // Re-saving unchanged text must not produce a new vector.
    const again = await repository.putResource(saved);
    expect(again.embedding).toEqual(saved.embedding);
    expect(again.embeddingUpdatedAt).toBe(saved.embeddingUpdatedAt);
  });

  it("recomputes when the text behind it changes", async () => {
    const repository = new IndexedDbRepository();
    const saved = await repository.putResource(makeResource());
    const edited = await repository.putResource({ ...saved, notes: "Completely different note" });
    expect(edited.embeddingInputHash).not.toBe(saved.embeddingInputHash);
    expect(edited.embedding).not.toEqual(saved.embedding);
  });
});

describe("queryResources", () => {
  it("filters by collection, tag and type through the indexes", async () => {
    const repository = new IndexedDbRepository();
    const collection = { id: "col_1", name: "Testing", order: 0, createdAt: new Date().toISOString() };
    await repository.putCollection(collection);

    await repository.putResource(makeResource({ name: "Playwright", collectionIds: ["col_1"] }));
    await repository.putResource(
      makeResource({
        name: "Drizzle",
        type: "documentation",
        tags: ["database"],
        url: "https://orm.drizzle.team",
        normalizedUrl: "orm.drizzle.team/",
        source: {
          title: "Drizzle",
          url: "https://orm.drizzle.team",
          domain: "orm.drizzle.team",
          savedAt: new Date().toISOString(),
        },
      }),
    );

    await expect(repository.queryResources({ collectionId: "col_1" }, "recent")).resolves.toHaveLength(1);
    await expect(repository.queryResources({ tag: "database" }, "recent")).resolves.toHaveLength(1);
    await expect(repository.queryResources({ type: "documentation" }, "recent")).resolves.toHaveLength(1);
    await expect(repository.queryResources({ domain: "orm.drizzle.team" }, "recent")).resolves.toHaveLength(
      1,
    );
    await expect(repository.queryResources({}, "recent")).resolves.toHaveLength(2);
  });

  it("applies several filters together", async () => {
    const repository = new IndexedDbRepository();
    await repository.putResource(makeResource({ tags: ["testing"], type: "tool" }));
    await expect(repository.queryResources({ tag: "testing", type: "tool" }, "recent")).resolves.toHaveLength(
      1,
    );
    await expect(repository.queryResources({ tag: "testing", type: "note" }, "recent")).resolves.toHaveLength(
      0,
    );
  });
});

describe("collections", () => {
  it("detaches a deleted collection from its members instead of losing them", async () => {
    const repository = new IndexedDbRepository();
    const collection = {
      id: createId("col"),
      name: "Testing",
      order: 0,
      createdAt: new Date().toISOString(),
    };
    await repository.putCollection(collection);
    const resource = await repository.putResource(makeResource({ collectionIds: [collection.id] }));

    await repository.deleteCollection(collection.id);

    await expect(repository.listCollections()).resolves.toHaveLength(0);
    const remaining = await repository.getResource(resource.id);
    expect(remaining).toBeDefined();
    expect(remaining?.collectionIds).toEqual([]);
  });
});

describe("backup", () => {
  it("round-trips a snapshot without loss", async () => {
    const repository = new IndexedDbRepository();
    await repository.putResource(makeResource());
    await repository.putResource(
      makeResource({ name: "Vitest", url: "https://vitest.dev", normalizedUrl: "vitest.dev" }),
    );

    const snapshot = await repository.exportSnapshot();
    expect(snapshot.resources).toHaveLength(2);

    globalThis.indexedDB = new IDBFactory();
    const restored = new IndexedDbRepository();
    const { added } = await restored.importSnapshot(snapshot);

    expect(added).toBe(2);
    const names = (await restored.listResources()).map((row) => row.name).sort();
    expect(names).toEqual(["Playwright", "Vitest"]);
  });

  it("merges on URL so restoring does not duplicate a re-captured page", async () => {
    const repository = new IndexedDbRepository();
    const original = await repository.putResource(makeResource({ notes: "Original note" }));

    const snapshot = await repository.exportSnapshot();

    // Simulate re-capturing the same page later under a new id.
    await repository.deleteResource(original.id);
    await repository.putResource(
      makeResource({ notes: "Re-captured", createdAt: new Date(Date.now() - 1000).toISOString() }),
    );

    await repository.importSnapshot(snapshot);

    const all = await repository.listResources();
    expect(all).toHaveLength(1);
  });

  it("rejects a file that is not a backup", async () => {
    const repository = new IndexedDbRepository();
    await expect(repository.importSnapshot({ hello: "world" })).rejects.toThrow(/does not look like/i);
  });

  it("accepts a bare array of resources", () => {
    const parsed = parseSnapshot([{ id: "res_1", name: "Bare", url: "https://example.com" }]);
    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].normalizedUrl).toBe("example.com/");
  });
});

describe("migrateResource", () => {
  it("rejects a record with no id", () => {
    expect(migrateResource({ name: "No id" })).toBeUndefined();
  });
});

describe("sortResources", () => {
  const rows = [
    makeResource({ name: "B", createdAt: "2025-01-02T00:00:00.000Z", viewCount: 1 }),
    makeResource({ name: "A", createdAt: "2025-01-03T00:00:00.000Z", viewCount: 5 }),
    makeResource({ name: "C", createdAt: "2025-01-01T00:00:00.000Z", viewCount: 3 }),
  ];

  it("orders by each supported key", () => {
    expect(sortResources(rows, "recent").map((row) => row.name)).toEqual(["A", "B", "C"]);
    expect(sortResources(rows, "oldest").map((row) => row.name)).toEqual(["C", "B", "A"]);
    expect(sortResources(rows, "title").map((row) => row.name)).toEqual(["A", "B", "C"]);
    expect(sortResources(rows, "most-viewed").map((row) => row.name)).toEqual(["A", "C", "B"]);
  });
});
