export type ResourceType = "page" | "document" | "tool" | "script" | "note" | "documentation";
export type RelationshipType = "related_to" | "alternative_to" | "used_with" | "solves" | "part_of";

/** Where a resource came from, recorded once at capture time. */
export interface CaptureContext {
  title: string;
  url: string;
  domain: string;
  selection?: string;
  savedAt: string;
}

export interface ResourceFeedback {
  useful: number;
  veryUseful: number;
  notUseful: number;
}

export interface MemoryResource {
  id: string;
  name: string;
  type: ResourceType;
  /** The URL as captured — this is what we open. */
  url?: string;
  /** Canonical form of `url`; the deduplication key. See lib/url.ts. */
  normalizedUrl: string;
  description: string;
  whenToRemember: string[];
  concepts: string[];
  tags: string[];
  /** Collections this resource belongs to; a resource may be in several. */
  collectionIds: string[];
  notes: string;
  /** Base64 PNG of an optional captured screen region. */
  screenshot?: string;
  source: CaptureContext;
  embedding?: number[];
  embeddingKind?: "deterministic" | "litert";
  /** Hash of the text the embedding was derived from, so we only recompute on change. */
  embeddingInputHash?: string;
  embeddingModel?: string;
  embeddingUpdatedAt?: string;
  feedback: ResourceFeedback;
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
  viewCount?: number;
}

export interface Collection {
  id: string;
  name: string;
  color?: string;
  order: number;
  createdAt: string;
}

export interface ViewHistoryRecord {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  url?: string;
  query: string;
  viewedAt: string;
}

export interface MemoryRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  createdAt: string;
}

/**
 * Backup envelope. Version 2 adds collections and view history; version 1
 * exports (which carried query/feedback/agent-state stores that no longer
 * exist) are still accepted on import.
 */
export interface MemorySnapshot {
  format: "recall.backup";
  version: 2;
  exportedAt: string;
  resources: MemoryResource[];
  collections: Collection[];
  relationships: MemoryRelationship[];
  viewHistory: ViewHistoryRecord[];
}

export interface SearchResult {
  resource: MemoryResource;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  /** Which fields matched, shown to explain the ranking. */
  matchedFields: string[];
}

export interface ResourceFilter {
  collectionId?: string;
  tag?: string;
  type?: ResourceType;
  domain?: string;
}

export type SortOrder = "recent" | "oldest" | "title" | "most-viewed";
