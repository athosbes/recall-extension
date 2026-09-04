import { useCallback, useEffect, useState } from "react";
import { repository } from "@/lib/memory";
import { onMemoryChanged } from "@/lib/events";
import type { Collection, MemoryResource } from "@/types/memory";

/**
 * Loads the library and keeps it in step with writes from any context — the
 * popup, the service worker, or another dashboard tab.
 */
export function useMemoryLibrary() {
  const [resources, setResources] = useState<MemoryResource[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    try {
      const [nextResources, nextCollections] = await Promise.all([
        repository.listResources(),
        repository.listCollections(),
      ]);
      setResources(nextResources);
      setCollections(nextCollections);
      setError(undefined);
    } catch (cause) {
      console.error("[Recall] Could not read your library:", cause);
      setError(cause instanceof Error ? cause.message : "Could not read your library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void repository.requestPersistence();
    return onMemoryChanged(() => void reload());
  }, [reload]);

  return { resources, collections, loading, error, reload };
}
