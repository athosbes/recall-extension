import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/TagInput";
import type { Collection, MemoryResource, ResourceType } from "@/types/memory";
import { Loader2 } from "lucide-react";

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: "page", label: "Web page" },
  { value: "documentation", label: "Documentation" },
  { value: "tool", label: "Tool / app" },
  { value: "script", label: "Script / code" },
  { value: "document", label: "Document / PDF" },
  { value: "note", label: "Note" },
];

interface EditResourceDialogProps {
  resource: MemoryResource | undefined;
  collections: Collection[];
  onClose: () => void;
  onSave: (resource: MemoryResource) => Promise<void>;
}

/** Edits any field of a saved resource. Nothing was editable after capture before. */
export function EditResourceDialog({ resource, collections, onClose, onSave }: EditResourceDialogProps) {
  const [draft, setDraft] = useState<MemoryResource | undefined>(resource);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(resource), [resource]);

  if (!draft) return null;

  const update = (patch: Partial<MemoryResource>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(resource)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-[#FBF8F1] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Edit resource</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              className="border-[#c9d3c3] bg-white/60"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-url">URL</Label>
            <Input
              id="edit-url"
              value={draft.url ?? ""}
              onChange={(event) => update({ url: event.target.value })}
              placeholder="https://…"
              className="border-[#c9d3c3] bg-white/60"
            />
            <p className="text-[10px] text-[#7a8c7b]">
              Changing this changes which page Recall recognises as already saved.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-type">Type</Label>
            <Select value={draft.type} onValueChange={(value) => update({ type: value as ResourceType })}>
              <SelectTrigger id="edit-type" className="border-[#c9d3c3] bg-white/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              className="h-20 border-[#c9d3c3] bg-white/60"
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput value={draft.tags} onChange={(tags) => update({ tags })} />
          </div>

          {collections.length > 0 && (
            <div className="space-y-2">
              <Label>Collections</Label>
              <div className="flex flex-wrap gap-2">
                {collections.map((collection) => {
                  const active = draft.collectionIds.includes(collection.id);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() =>
                        update({
                          collectionIds: active
                            ? draft.collectionIds.filter((id) => id !== collection.id)
                            : [...draft.collectionIds, collection.id],
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active
                          ? "border-[#597c62] bg-[#ecf3e9] text-[#597c62]"
                          : "border-[#c9d3c3] text-[#7a8c7b] hover:border-[#597c62]"
                      }`}
                    >
                      {collection.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              className="h-28 border-[#c9d3c3] bg-white/60"
              placeholder="Why is this worth keeping?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="border-[#c9d3c3] text-[#7a8c7b]"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button className="bg-[#D85A3E] text-white hover:bg-[#c44d32]" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
