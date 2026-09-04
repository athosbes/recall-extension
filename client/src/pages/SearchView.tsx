import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ResourceCard } from "@/components/ResourceCard";
import { searchMemory } from "@/lib/retrieval";
import type { Collection, MemoryResource, SearchResult } from "@/types/memory";

interface SearchViewProps {
  resources: MemoryResource[];
  collections: Collection[];
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: (resource: MemoryResource, query: string) => void;
  onEdit: (resource: MemoryResource) => void;
  onDelete: (resource: MemoryResource) => void;
}

export function SearchView({
  resources,
  collections,
  query,
  onQueryChange,
  onOpen,
  onEdit,
  onDelete,
}: SearchViewProps) {
  const [results, setResults] = useState<SearchResult[]>([]);

  // Debounced so typing does not kick off a scan of the whole library on every
  // keystroke; `searchMemory` reads stored embeddings and computes none.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void searchMemory(resources, query).then((next) => {
        if (!cancelled) setResults(next);
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, resources]);

  return (
    <div>
      <header className="mb-8">
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#7a8c7b]">Search</p>
        <h1 className="mb-3 font-serif text-4xl font-bold tracking-tight">
          Name the problem. Recall the path.
        </h1>
        <p className="max-w-xl text-[#627168]">
          Describe what you are after. Recall matches your titles, tags, notes, concepts and addresses — all
          of it on this device.
        </p>
      </header>

      <div className="relative mb-10">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7a8c7b]">
          <Search size={22} />
        </div>
        <Input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="that tool for scraping a site…"
          className="rounded-xl border-[#c9d3c3] bg-white py-7 pl-14 text-lg shadow-sm focus-visible:ring-[#D85A3E]"
        />
      </div>

      {!query.trim() ? (
        <p className="text-sm text-[#7a8c7b]">
          {resources.length
            ? `Searching ${resources.length} saved page${resources.length === 1 ? "" : "s"}.`
            : "Save a page first and it will show up here."}
        </p>
      ) : results.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[#c9d3c3] bg-white/30 py-12 text-center">
          <p className="text-[#7a8c7b]">Nothing matched “{query}”.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-widest text-[#7a8c7b]">
            {results.length} match{results.length === 1 ? "" : "es"}
          </p>
          {results.map((result) => (
            <ResourceCard
              key={result.resource.id}
              resource={result.resource}
              collections={collections}
              matchedFields={result.matchedFields}
              onOpen={(resource) => onOpen(resource, query)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
