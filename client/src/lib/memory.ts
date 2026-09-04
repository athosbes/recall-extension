import type {
  Collection,
  MemoryRelationship,
  MemoryResource,
  MemorySnapshot,
  ResourceFilter,
  SortOrder,
  ViewHistoryRecord,
} from "@/types/memory";
import { normalizeUrl } from "@/lib/url";
import { notifyMemoryChanged } from "@/lib/events";
import { embedText, embeddingInputOf, hashText } from "@/lib/ai";

const DATABASE_NAME = "recall-memory";
const DATABASE_VERSION = 3;

type StoreName = "resources" | "collections" | "relationships" | "view_history";

/**
 * Storage contract for Recall.
 *
 * Everything above this layer talks to the interface rather than to IndexedDB,
 * so an alternative implementation (a synced backend, for instance) can be
 * dropped in without touching the UI.
 */
export interface MemoryRepository {
  listResources(): Promise<MemoryResource[]>;
  getResource(id: string): Promise<MemoryResource | undefined>;
  findByUrl(url: string): Promise<MemoryResource | undefined>;
  putResource(resource: MemoryResource): Promise<MemoryResource>;
  deleteResource(id: string): Promise<void>;
  queryResources(filter: ResourceFilter, sort: SortOrder): Promise<MemoryResource[]>;

  listCollections(): Promise<Collection[]>;
  putCollection(collection: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;

  listRelationships(): Promise<MemoryRelationship[]>;
  putRelationship(relationship: MemoryRelationship): Promise<void>;
  deleteRelationship(id: string): Promise<void>;

  listViewHistory(): Promise<ViewHistoryRecord[]>;
  recordResourceView(resourceId: string, query: string): Promise<void>;

  exportSnapshot(): Promise<MemorySnapshot>;
  importSnapshot(snapshot: unknown): Promise<{ added: number; merged: number }>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function createId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${suffix}`;
}

// --- schema -----------------------------------------------------------------

function createResourceStore(database: IDBDatabase) {
  const store = database.createObjectStore("resources", { keyPath: "id" });
  store.createIndex("by_normalized_url", "normalizedUrl", { unique: false });
  store.createIndex("by_created_at", "createdAt", { unique: false });
  store.createIndex("by_updated_at", "updatedAt", { unique: false });
  store.createIndex("by_type", "type", { unique: false });
  store.createIndex("by_tags", "tags", { unique: false, multiEntry: true });
  store.createIndex("by_collection", "collectionIds", { unique: false, multiEntry: true });
  return store;
}

function createCollectionStore(database: IDBDatabase) {
  const store = database.createObjectStore("collections", { keyPath: "id" });
  store.createIndex("by_order", "order", { unique: false });
  return store;
}

function createRelationshipStore(database: IDBDatabase) {
  return database.createObjectStore("relationships", { keyPath: "id" });
}

function createViewHistoryStore(database: IDBDatabase) {
  const store = database.createObjectStore("view_history", { keyPath: "id" });
  store.createIndex("by_viewed_at", "viewedAt", { unique: false });
  return store;
}

/** Fills in fields added since the record was written. Exported for tests. */
export function migrateResource(raw: Partial<MemoryResource> & { id?: string }): MemoryResource | undefined {
  if (!raw || typeof raw.id !== "string" || !raw.id) return undefined;
  const url = raw.url ?? raw.source?.url ?? "";
  const now = new Date().toISOString();
  return {
    id: raw.id,
    name: raw.name ?? "Untitled",
    type: raw.type ?? "page",
    url: url || undefined,
    normalizedUrl: raw.normalizedUrl ?? normalizeUrl(url),
    description: raw.description ?? "",
    whenToRemember: Array.isArray(raw.whenToRemember) ? raw.whenToRemember : [],
    concepts: Array.isArray(raw.concepts) ? raw.concepts : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    collectionIds: Array.isArray(raw.collectionIds) ? raw.collectionIds : [],
    notes: raw.notes ?? "",
    screenshot: raw.screenshot,
    // Records captured through the popup's fallback paths had no source at all,
    // which used to crash the dashboard on render.
    source: {
      title: raw.source?.title ?? raw.name ?? "",
      url: raw.source?.url ?? url,
      domain: raw.source?.domain ?? (url ? normalizeUrl(url).split("/")[0] : ""),
      selection: raw.source?.selection,
      savedAt: raw.source?.savedAt ?? raw.createdAt ?? now,
    },
    embedding: Array.isArray(raw.embedding) ? raw.embedding : undefined,
    embeddingKind: raw.embeddingKind,
    embeddingInputHash: raw.embeddingInputHash,
    embeddingModel: raw.embeddingModel,
    embeddingUpdatedAt: raw.embeddingUpdatedAt,
    feedback: raw.feedback ?? { useful: 0, veryUseful: 0, notUseful: 0 },
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    lastViewedAt: raw.lastViewedAt,
    viewCount: raw.viewCount ?? 0,
  };
}

/**
 * Rebuilds a store that was created without a keyPath (schema versions 1 and 2
 * used out-of-line keys and had no indexes, so every read was a full scan).
 *
 * The buffered rows are re-inserted inside the same versionchange transaction:
 * the request callback still runs within it, which is what makes
 * delete-then-recreate under the same name safe.
 */
function rebuildStore<T>(
  database: IDBDatabase,
  transaction: IDBTransaction,
  name: StoreName,
  create: (database: IDBDatabase) => IDBObjectStore,
  migrate: (row: T) => unknown,
) {
  if (!database.objectStoreNames.contains(name)) {
    create(database);
    return;
  }

  const existing = transaction.objectStore(name);
  if (existing.keyPath) return; // already migrated

  const request = existing.getAll();
  request.onsuccess = () => {
    const rows = (request.result ?? []) as T[];
    database.deleteObjectStore(name);
    const store = create(database);
    for (const row of rows) {
      const migrated = migrate(row);
      if (migrated) store.put(migrated);
    }
  };
}

export class IndexedDbRepository implements MemoryRepository {
  private databasePromise?: Promise<IDBDatabase>;

  /** Asks the browser not to evict this origin's data under storage pressure. */
  async requestPersistence() {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  private database() {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = () => {
          const database = request.result;
          const transaction = request.transaction!;

          rebuildStore(database, transaction, "resources", createResourceStore, migrateResource);
          rebuildStore(database, transaction, "collections", createCollectionStore, (row) => row);
          rebuildStore(database, transaction, "relationships", createRelationshipStore, (row) => row);
          rebuildStore(database, transaction, "view_history", createViewHistoryStore, (row) => row);

          // Stores for features that were never built, plus "settings", which
          // chrome.storage.local supersedes. Dropping them keeps the schema
          // honest; nothing above this file ever read them.
          for (const dead of ["queries", "feedback", "agent_state", "model_files", "settings"]) {
            if (database.objectStoreNames.contains(dead)) database.deleteObjectStore(dead);
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Unable to open Recall memory"));
        request.onblocked = () =>
          reject(new Error("Recall is open in another tab running an older version. Close it and retry."));
      });
    }
    return this.databasePromise;
  }

  private async getAll<T>(store: StoreName): Promise<T[]> {
    const database = await this.database();
    const transaction = database.transaction(store, "readonly");
    return (await requestToPromise(transaction.objectStore(store).getAll())) as T[];
  }

  private async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const database = await this.database();
    const transaction = database.transaction(store, "readonly");
    return (await requestToPromise(transaction.objectStore(store).get(key))) as T | undefined;
  }

  private async put<T>(store: StoreName, value: T): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).put(value);
    await transactionDone(transaction);
  }

  private async remove(store: StoreName, key: IDBValidKey): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).delete(key);
    await transactionDone(transaction);
  }

  // --- resources ------------------------------------------------------------

  listResources() {
    return this.getAll<MemoryResource>("resources");
  }

  getResource(id: string) {
    return this.get<MemoryResource>("resources", id);
  }

  /** Looks a page up by its canonical URL. This is what powers dedup. */
  async findByUrl(url: string): Promise<MemoryResource | undefined> {
    const normalized = normalizeUrl(url);
    if (!normalized) return undefined;
    const database = await this.database();
    const transaction = database.transaction("resources", "readonly");
    const index = transaction.objectStore("resources").index("by_normalized_url");
    return (await requestToPromise(index.get(normalized))) as MemoryResource | undefined;
  }

  /**
   * Writes a resource, keeping derived fields in step: the canonical URL, the
   * updated timestamp, and the embedding — which is computed here, once, rather
   * than being re-derived for every resource on every keystroke at search time.
   */
  async putResource(resource: MemoryResource): Promise<MemoryResource> {
    const normalizedUrl = resource.normalizedUrl || normalizeUrl(resource.url);
    const embeddingInput = embeddingInputOf(resource);
    const embeddingInputHash = String(hashText(embeddingInput));

    let { embedding, embeddingKind, embeddingModel, embeddingUpdatedAt } = resource;
    if (!embedding?.length || resource.embeddingInputHash !== embeddingInputHash) {
      embedding = await embedText(embeddingInput);
      embeddingKind = "deterministic";
      embeddingModel = "deterministic-v1";
      embeddingUpdatedAt = new Date().toISOString();
    }

    const stored: MemoryResource = {
      ...resource,
      normalizedUrl,
      embedding,
      embeddingKind,
      embeddingModel,
      embeddingUpdatedAt,
      embeddingInputHash,
      updatedAt: new Date().toISOString(),
    };

    await this.put("resources", stored);
    notifyMemoryChanged();
    return stored;
  }

  async deleteResource(id: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(["resources", "relationships"], "readwrite");
    transaction.objectStore("resources").delete(id);
    const relationships = (await requestToPromise(
      transaction.objectStore("relationships").getAll(),
    )) as MemoryRelationship[];
    relationships
      .filter((item) => item.sourceId === id || item.targetId === id)
      .forEach((item) => transaction.objectStore("relationships").delete(item.id));
    await transactionDone(transaction);
    notifyMemoryChanged();
  }

  async queryResources(filter: ResourceFilter, sort: SortOrder): Promise<MemoryResource[]> {
    const database = await this.database();
    const transaction = database.transaction("resources", "readonly");
    const store = transaction.objectStore("resources");

    // Narrow with an index where one applies, so filtering a large library does
    // not have to deserialize every record.
    let rows: MemoryResource[];
    if (filter.collectionId) {
      rows = (await requestToPromise(
        store.index("by_collection").getAll(filter.collectionId),
      )) as MemoryResource[];
    } else if (filter.tag) {
      rows = (await requestToPromise(store.index("by_tags").getAll(filter.tag))) as MemoryResource[];
    } else if (filter.type) {
      rows = (await requestToPromise(store.index("by_type").getAll(filter.type))) as MemoryResource[];
    } else {
      rows = (await requestToPromise(store.getAll())) as MemoryResource[];
    }

    if (filter.type) rows = rows.filter((row) => row.type === filter.type);
    if (filter.tag) rows = rows.filter((row) => row.tags.includes(filter.tag!));
    if (filter.collectionId) rows = rows.filter((row) => row.collectionIds.includes(filter.collectionId!));
    if (filter.domain) rows = rows.filter((row) => row.source.domain === filter.domain);

    return sortResources(rows, sort);
  }

  // --- collections ----------------------------------------------------------

  async listCollections() {
    const rows = await this.getAll<Collection>("collections");
    return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async putCollection(collection: Collection) {
    await this.put("collections", collection);
    notifyMemoryChanged();
  }

  /** Removes the collection and detaches it from every resource that used it. */
  async deleteCollection(id: string) {
    const database = await this.database();
    const transaction = database.transaction(["collections", "resources"], "readwrite");
    transaction.objectStore("collections").delete(id);
    const resourceStore = transaction.objectStore("resources");
    const members = (await requestToPromise(
      resourceStore.index("by_collection").getAll(id),
    )) as MemoryResource[];
    for (const member of members) {
      resourceStore.put({ ...member, collectionIds: member.collectionIds.filter((entry) => entry !== id) });
    }
    await transactionDone(transaction);
    notifyMemoryChanged();
  }

  // --- relationships --------------------------------------------------------

  listRelationships() {
    return this.getAll<MemoryRelationship>("relationships");
  }

  async putRelationship(relationship: MemoryRelationship) {
    await this.put("relationships", relationship);
    notifyMemoryChanged();
  }

  deleteRelationship(id: string) {
    return this.remove("relationships", id);
  }

  // --- history and settings -------------------------------------------------

  async listViewHistory(): Promise<ViewHistoryRecord[]> {
    const rows = await this.getAll<ViewHistoryRecord>("view_history");
    return rows.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());
  }

  async recordResourceView(resourceId: string, query: string): Promise<void> {
    const resource = await this.getResource(resourceId);
    if (!resource) return;

    const now = new Date().toISOString();
    await this.put("resources", {
      ...resource,
      lastViewedAt: now,
      viewCount: (resource.viewCount ?? 0) + 1,
    });
    await this.put("view_history", {
      id: createId("view"),
      resourceId: resource.id,
      resourceName: resource.name,
      resourceType: resource.type,
      url: resource.url,
      query: query || "",
      viewedAt: now,
    } satisfies ViewHistoryRecord);
    notifyMemoryChanged();
  }

  // --- backup ---------------------------------------------------------------

  async exportSnapshot(): Promise<MemorySnapshot> {
    const [resources, collections, relationships, viewHistory] = await Promise.all([
      this.listResources(),
      this.listCollections(),
      this.listRelationships(),
      this.listViewHistory(),
    ]);
    return {
      format: "recall.backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      resources,
      collections,
      relationships,
      viewHistory,
    };
  }

  /**
   * Merges a backup into the current library rather than replacing it, matching
   * on the canonical URL so restoring a backup of a page you have since
   * re-captured does not leave you with two copies. The newer `updatedAt` wins.
   */
  async importSnapshot(snapshot: unknown): Promise<{ added: number; merged: number }> {
    const parsed = parseSnapshot(snapshot);

    const existing = await this.listResources();
    const byId = new Map(existing.map((row) => [row.id, row]));
    const byUrl = new Map(existing.filter((row) => row.normalizedUrl).map((row) => [row.normalizedUrl, row]));

    let added = 0;
    let merged = 0;
    const toWrite: MemoryResource[] = [];

    for (const incoming of parsed.resources) {
      const current =
        byId.get(incoming.id) ?? (incoming.normalizedUrl ? byUrl.get(incoming.normalizedUrl) : undefined);
      if (!current) {
        toWrite.push(incoming);
        added += 1;
        continue;
      }
      const incomingIsNewer = new Date(incoming.updatedAt).getTime() > new Date(current.updatedAt).getTime();
      if (incomingIsNewer) {
        toWrite.push({ ...incoming, id: current.id });
        merged += 1;
      }
    }

    const database = await this.database();
    const transaction = database.transaction(
      ["resources", "collections", "relationships", "view_history"],
      "readwrite",
    );
    for (const row of toWrite) transaction.objectStore("resources").put(row);
    for (const row of parsed.collections) transaction.objectStore("collections").put(row);
    for (const row of parsed.relationships) transaction.objectStore("relationships").put(row);
    for (const row of parsed.viewHistory) transaction.objectStore("view_history").put(row);
    await transactionDone(transaction);

    notifyMemoryChanged();
    return { added, merged };
  }
}

/** Accepts a version 2 backup, a legacy version 1 backup, or a bare resource array. */
export function parseSnapshot(value: unknown): {
  resources: MemoryResource[];
  collections: Collection[];
  relationships: MemoryRelationship[];
  viewHistory: ViewHistoryRecord[];
} {
  const rawResources = Array.isArray(value)
    ? value
    : ((value as { resources?: unknown })?.resources as unknown[] | undefined);

  if (!Array.isArray(rawResources)) {
    throw new Error("This file does not look like a Recall backup.");
  }

  const resources = rawResources
    .map((row) => migrateResource(row as Partial<MemoryResource>))
    .filter((row): row is MemoryResource => Boolean(row));

  if (!resources.length && rawResources.length) {
    throw new Error("This backup contains no readable resources.");
  }

  const envelope = (Array.isArray(value) ? {} : value) as Partial<MemorySnapshot>;
  return {
    resources,
    collections: Array.isArray(envelope.collections) ? envelope.collections : [],
    relationships: Array.isArray(envelope.relationships) ? envelope.relationships : [],
    viewHistory: Array.isArray(envelope.viewHistory) ? envelope.viewHistory : [],
  };
}

export function sortResources(rows: MemoryResource[], sort: SortOrder): MemoryResource[] {
  const sorted = [...rows];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "title":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "most-viewed":
      return sorted.sort(
        (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0) || b.createdAt.localeCompare(a.createdAt),
      );
    case "recent":
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export const repository = new IndexedDbRepository();
