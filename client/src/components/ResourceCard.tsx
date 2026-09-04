import { ExternalLink, Camera, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Collection, MemoryResource } from "@/types/memory";
import { relativeTime } from "@/lib/capture";

interface ResourceCardProps {
  resource: MemoryResource;
  collections: Collection[];
  matchedFields?: string[];
  onOpen: (resource: MemoryResource) => void;
  onEdit: (resource: MemoryResource) => void;
  onDelete: (resource: MemoryResource) => void;
}

export function ResourceCard({
  resource,
  collections,
  matchedFields,
  onOpen,
  onEdit,
  onDelete,
}: ResourceCardProps) {
  const memberships = collections.filter((collection) => resource.collectionIds.includes(collection.id));

  return (
    <article className="group relative overflow-hidden rounded-xl border border-[#c9d3c3] bg-white/50 p-6 shadow-sm">
      <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#D85A3E]" />

      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="border-none bg-[#ecf3e9] text-[9px] font-black uppercase tracking-tighter text-[#597c62]"
            >
              {resource.type}
            </Badge>
            {/* `source` can be missing on records written by older versions. */}
            <span className="text-[10px] text-[#7a8c7b]">{resource.source?.domain || "no domain"}</span>
            <span className="text-[10px] text-[#7a8c7b]">· saved {relativeTime(resource.createdAt)}</span>
          </div>
          <h3
            className="cursor-pointer truncate font-serif text-xl font-bold transition-colors group-hover:text-[#D85A3E]"
            onClick={() => onOpen(resource)}
            title={resource.name}
          >
            {resource.name}
          </h3>
        </div>

        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#7a8c7b]"
            aria-label="Open"
            onClick={() => onOpen(resource)}
          >
            <ExternalLink size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#7a8c7b]"
            aria-label="Edit"
            onClick={() => onEdit(resource)}
          >
            <Pencil size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#7a8c7b] hover:text-red-500"
            aria-label="Delete"
            onClick={() => onDelete(resource)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {resource.description && (
        <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-[#627168]">{resource.description}</p>
      )}

      {resource.notes && (
        <p className="mb-3 border-l-2 border-[#c9d3c3] pl-3 text-xs italic leading-relaxed text-[#7a8c7b]">
          {resource.notes}
        </p>
      )}

      {resource.screenshot && (
        <div className="mb-3 overflow-hidden rounded-lg border border-[#c9d3c3] bg-white">
          <img src={resource.screenshot} className="h-auto max-h-64 w-full object-contain" alt="" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {memberships.map((collection) => (
          <Badge
            key={collection.id}
            variant="outline"
            className="border-[#597c62]/40 text-[10px] text-[#597c62]"
          >
            {collection.name}
          </Badge>
        ))}
        {resource.tags.map((tag) => (
          <span key={tag} className="text-[10px] text-[#7a8c7b]">
            #{tag}
          </span>
        ))}
        {resource.screenshot && <Camera size={11} className="text-[#D85A3E]" />}
        {matchedFields?.length ? (
          <span className="ml-auto text-[9px] uppercase tracking-widest text-[#7a8c7b] opacity-70">
            matched {matchedFields.join(", ")}
          </span>
        ) : null}
      </div>
    </article>
  );
}
