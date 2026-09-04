// jsdom has no IndexedDB, so the storage tests run against an in-memory
// implementation with the same semantics (including versionchange upgrades).
import "fake-indexeddb/auto";
