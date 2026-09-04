import { useMemo, useState } from "react";
import { FolderPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResourceCard } from "@/components/ResourceCard";
import { createId, repository, sortResources } from "@/lib/memory";
import type { Collection, MemoryResource, ResourceType, SortOrder } from "@/types/memory";

const PAGE_SIZE = 25;

const SORTS: { value: SortOrder; label: string }[] = [
  { value: "recent", label: "Recently saved" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
  { value: "most-viewed", label: "Most opened" },
];

const TYPES: ResourceType[] = ["page", "documentation", "tool", "script", "document", "note"];

interface LibraryViewProps {
  resources: MemoryResource[];
  collections: Collection[];
  loading: boolean;
  onOpen: (resource: MemoryResource) => void;
  onEdit: (resource: MemoryResource) => void;
  onDelete: (resource: MemoryResource) => void;
  onSearch: (query: string) => void;
}

export function LibraryView({
  resources,
  collections,
  loading,
  onOpen,
  onEdit,
  onDelete,
  onSearch,
}: LibraryViewProps) {
  const [sort, setSort] = useState<SortOrder>("recent");
  const [collectionId, setCollectionId] = useState("all");
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("all");
  const [domain, setDomain] = useState("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [newCollection, setNewCollection] = useState("");

  const tags = useMemo(
    () => [...new Set(resources.flatMap((resource) => resource.tags))].sort(),
    [resources],
  );
  const domains = useMemo(
    () =>
      [...new Set(resources.map((resource) => resource.source?.domain).filter(Boolean) as string[])].sort(),
    [resources],
  );

  const filtered = useMemo(() => {
    const rows = resources.filter((resource) => {
      if (collectionId !== "all" && !resource.collectionIds.includes(collectionId)) return false;
      if (type !== "all" && resource.type !== type) return false;
      if (tag !== "all" && !resource.tags.includes(tag)) return false;
      if (domain !== "all" && resource.source?.domain !== domain) return false;
      return true;
    });
    return sortResources(rows, sort);
  }, [resources, collectionId, type, tag, domain, sort]);

  const page = filtered.slice(0, visible);

  const addCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    if (collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase())) {
      toast.error("You already have a collection with that name.");
      return;
    }
    await repository.putCollection({
      id: createId("col"),
      name,
      order: collections.length,
      createdAt: new Date().toISOString(),
    });
    setNewCollection("");
    toast.success(`Created “${name}”`);
  };

  const removeCollection = async (collection: Collection) => {
    await repository.deleteCollection(collection.id);
    if (collectionId === collection.id) setCollectionId("all");
    toast.success(`Removed “${collection.name}” — its pages were kept.`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-[#D85A3E]" size={28} />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#7a8c7b]">Your library</p>
        <h1 className="mb-3 font-serif text-4xl font-bold tracking-tight">
          {resources.length} page{resources.length === 1 ? "" : "s"} kept
        </h1>
        <p className="max-w-xl text-[#627168]">
          Everything you have captured, with the notes and tags you gave it. Edit anything here — nothing is
          frozen at the moment you saved it.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-[#c9d3c3] bg-white/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#7a8c7b]">
          <FolderPlus size={12} /> Collections
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {collections.length === 0 && (
            <p className="text-xs text-[#7a8c7b]">No collections yet. Create one to group related pages.</p>
          )}
          {collections.map((collection) => {
            const count = resources.filter((resource) =>
              resource.collectionIds.includes(collection.id),
            ).length;
            return (
              <span
                key={collection.id}
                className="group inline-flex items-center gap-1.5 rounded-full border border-[#c9d3c3] bg-white px-3 py-1 text-xs text-[#597c62]"
              >
                {collection.name}
                <span className="text-[#7a8c7b]">{count}</span>
                <button
                  type="button"
                  aria-label={`Delete ${collection.name}`}
                  className="opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                  onClick={() => void removeCollection(collection)}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex max-w-sm gap-2">
          <Input
            value={newCollection}
            onChange={(event) => setNewCollection(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void addCollection()}
            placeholder="New collection name…"
            className="h-8 border-[#c9d3c3] bg-white/60 text-sm"
          />
          <Button
            size="sm"
            className="h-8 bg-[#597c62] text-white hover:bg-[#4a6a52]"
            onClick={() => void addCollection()}
          >
            <Plus size={14} />
          </Button>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <FilterSelect value={sort} onChange={(value) => setSort(value as SortOrder)} label="Sort">
          {SORTS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </FilterSelect>

        {collections.length > 0 && (
          <FilterSelect value={collectionId} onChange={setCollectionId} label="Collection">
            <SelectItem value="all">All collections</SelectItem>
            {collections.map((collection) => (
              <SelectItem key={collection.id} value={collection.id}>
                {collection.name}
              </SelectItem>
            ))}
          </FilterSelect>
        )}

        <FilterSelect value={type} onChange={setType} label="Type">
          <SelectItem value="all">All types</SelectItem>
          {TYPES.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </FilterSelect>

        {tags.length > 0 && (
          <FilterSelect value={tag} onChange={setTag} label="Tag">
            <SelectItem value="all">All tags</SelectItem>
            {tags.map((option) => (
              <SelectItem key={option} value={option}>
                #{option}
              </SelectItem>
            ))}
          </FilterSelect>
        )}

        {domains.length > 0 && (
          <FilterSelect value={domain} onChange={setDomain} label="Site">
            <SelectItem value="all">All sites</SelectItem>
            {domains.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </FilterSelect>
        )}

        {filtered.length !== resources.length && (
          <span className="text-xs text-[#7a8c7b]">
            {filtered.length} of {resources.length}
          </span>
        )}
      </div>

      {resources.length === 0 ? (
        <EmptyLibrary />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[#c9d3c3] bg-white/30 py-12 text-center">
          <p className="text-[#7a8c7b]">Nothing matches those filters.</p>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {page.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                collections={collections}
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>

          {visible < filtered.length && (
            <div className="mt-8 text-center">
              <Button
                variant="outline"
                className="border-[#c9d3c3] text-[#7a8c7b]"
                onClick={() => setVisible((current) => current + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
              </Button>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-[#7a8c7b]">
            Looking for something specific?{" "}
            <button className="underline hover:text-[#D85A3E]" onClick={() => onSearch("")}>
              Search instead
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-8 w-auto min-w-[9rem] border-[#c9d3c3] bg-white/60 text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function EmptyLibrary() {
  return (
    <div className="rounded-xl border-2 border-dashed border-[#c9d3c3] bg-white/30 px-6 py-16 text-center">
      <h3 className="mb-2 font-serif text-2xl font-bold">Nothing saved yet</h3>
      <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-[#627168]">
        Open any page and click the Recall icon in your toolbar, or press{" "}
        <kbd className="rounded border border-[#c9d3c3] bg-white px-1.5 py-0.5 text-[11px]">Ctrl</kbd>{" "}
        <kbd className="rounded border border-[#c9d3c3] bg-white px-1.5 py-0.5 text-[11px]">Shift</kbd>{" "}
        <kbd className="rounded border border-[#c9d3c3] bg-white px-1.5 py-0.5 text-[11px]">S</kbd>. Recall
        fills in the title, description and tags for you.
      </p>
      <p className="text-xs text-[#7a8c7b]">
        Already saved a page? The toolbar icon shows a ✓ when you are on it.
      </p>
    </div>
  );
}
