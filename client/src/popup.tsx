import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { repository } from "@/lib/memory";
import { buildResourceDraft, downloadJson, readPageMetadata, relativeTime } from "@/lib/capture";
import type { Collection, MemoryResource, ResourceType } from "@/types/memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/TagInput";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Library,
  Loader2,
  Save,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import "@/index.css";

const PENDING_SCREENSHOT_KEY = "pendingScreenshot";

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: "page", label: "Web page" },
  { value: "documentation", label: "Documentation" },
  { value: "tool", label: "Tool / app" },
  { value: "script", label: "Script / code" },
  { value: "document", label: "Document / PDF" },
  { value: "note", label: "Note" },
];

function openDashboard(search = "") {
  window.open(chrome.runtime.getURL(`index.html${search}`), "_blank");
}

function Popup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [draft, setDraft] = useState<MemoryResource | undefined>();
  /** The record already in the library for this URL, when there is one. */
  const [existing, setExisting] = useState<MemoryResource | undefined>();

  const update = useCallback(
    (patch: Partial<MemoryResource>) => setDraft((current) => (current ? { ...current, ...patch } : current)),
    [],
  );

  useEffect(() => {
    async function initialise() {
      try {
        if (typeof chrome === "undefined" || !chrome.tabs) {
          setDraft(buildResourceDraft({} as chrome.tabs.Tab, undefined));
          return;
        }

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        setTab(activeTab);
        void repository.requestPersistence();
        setCollections(await repository.listCollections());

        // Is this page already saved? That decision drives the whole popup.
        const saved = activeTab?.url ? await repository.findByUrl(activeTab.url) : undefined;
        if (saved) {
          setExisting(saved);
          setDraft(saved);
          return;
        }

        const metadata = activeTab ? await readPageMetadata(activeTab) : undefined;
        const fresh = buildResourceDraft(activeTab ?? ({} as chrome.tabs.Tab), metadata);

        // A crop taken in a previous popup session waits in session storage.
        const pending = await chrome.storage.session.get(PENDING_SCREENSHOT_KEY);
        const screenshot = pending?.[PENDING_SCREENSHOT_KEY] as string | undefined;
        if (screenshot) {
          fresh.screenshot = screenshot;
          await chrome.storage.session.remove(PENDING_SCREENSHOT_KEY);
        }

        setDraft(fresh);
      } catch (error) {
        console.error("[Recall] Capture failed:", error);
        toast.error("Could not read this page.");
      } finally {
        setLoading(false);
      }
    }
    void initialise();
  }, []);

  const persist = async (resource: MemoryResource, message: string) => {
    setSaving(true);
    try {
      await repository.putResource(resource);
      toast.success(message);
      setTimeout(() => window.close(), 900);
    } catch (error) {
      console.error("[Recall] Save failed:", error);
      toast.error("Failed to save. Your library was not changed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      toast.error("Give this a name first.");
      return;
    }
    await persist(draft, existing ? "Updated in Recall" : "Saved to Recall");
    if (!existing) {
      const { capturesSinceBackup } = await chrome.storage.local.get("capturesSinceBackup");
      const count = typeof capturesSinceBackup === "number" ? capturesSinceBackup : 0;
      await chrome.storage.local.set({ capturesSinceBackup: count + 1 });
    }
  };

  /** Deliberate opt-out of dedup, for a page whose content genuinely changed. */
  const handleSaveAsNew = async () => {
    if (!draft) return;
    const metadata = tab ? await readPageMetadata(tab) : undefined;
    const fresh = buildResourceDraft(tab ?? ({} as chrome.tabs.Tab), metadata);
    await persist({ ...fresh, notes: draft.notes, tags: draft.tags }, "Saved as a new entry");
  };

  const handleCaptureArea = async () => {
    if (tab?.id === undefined) return;
    setCapturing(true);
    try {
      // The service worker drives this: clicking the page to drag closes the
      // popup, so the flow cannot be awaited here.
      void chrome.runtime.sendMessage({ type: "START_AREA_CAPTURE", tabId: tab.id, windowId: tab.windowId });
      toast.info("Drag to select an area — Recall will reopen with the crop.");
      setTimeout(() => window.close(), 600);
    } catch {
      toast.error("Could not start the capture.");
      setCapturing(false);
    }
  };

  if (loading || !draft) {
    return (
      <div className="flex h-[500px] w-[400px] items-center justify-center bg-[#FBF8F1]">
        <Loader2 className="animate-spin text-[#D85A3E]" size={32} />
      </div>
    );
  }

  return (
    <div className="max-h-[600px] w-[400px] overflow-y-auto bg-[#FBF8F1] p-6 font-sans text-[#314239]">
      <Toaster position="top-center" />

      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="icons/icon-32.png" alt="" className="h-8 w-8 rounded" />
          <h1 className="font-serif text-xl font-bold tracking-tight">
            {existing ? "Already in Recall" : "Capture"}
          </h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => window.close()} aria-label="Close">
          <X size={20} />
        </Button>
      </header>

      {existing ? (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#597c62]/30 bg-[#ecf3e9] p-3 text-xs text-[#597c62]">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">You saved this page {relativeTime(existing.createdAt)}.</p>
            <p className="opacity-80">
              {existing.viewCount
                ? `Opened ${existing.viewCount} time${existing.viewCount === 1 ? "" : "s"} since. `
                : ""}
              Edits below update that entry instead of adding a duplicate.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#7a8c7b]">
          <Sparkles size={12} /> Suggestions from this page
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            className="border-[#c9d3c3] bg-white/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Select value={draft.type} onValueChange={(value) => update({ type: value as ResourceType })}>
            <SelectTrigger id="type" className="border-[#c9d3c3] bg-white/50">
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
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={draft.description}
            onChange={(event) => update({ description: event.target.value })}
            className="h-20 border-[#c9d3c3] bg-white/50"
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <TagInput value={draft.tags} onChange={(tags) => update({ tags })} />
        </div>

        {collections.length > 0 && (
          <div className="space-y-2">
            <Label>Collection</Label>
            <Select
              value={draft.collectionIds[0] ?? "none"}
              onValueChange={(value) => update({ collectionIds: value === "none" ? [] : [value] })}
            >
              <SelectTrigger className="border-[#c9d3c3] bg-white/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No collection</SelectItem>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={draft.notes}
            onChange={(event) => update({ notes: event.target.value })}
            className="h-24 border-[#c9d3c3] bg-white/50 placeholder:text-[#7a8c7b]"
            placeholder="Why is this worth keeping?"
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center justify-between">
            Visual context
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] text-[#D85A3E] hover:bg-[#D85A3E]/10 hover:text-[#D85A3E]"
              onClick={handleCaptureArea}
              disabled={capturing || tab?.id === undefined}
            >
              {capturing ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
              {draft.screenshot ? "Recapture" : "Capture area"}
            </Button>
          </Label>
          {draft.screenshot ? (
            <div className="group relative overflow-hidden rounded-md border border-[#c9d3c3] bg-white">
              <img
                src={draft.screenshot}
                className="h-auto max-h-32 w-full object-cover"
                alt="Captured area"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white"
                  onClick={() => update({ screenshot: undefined })}
                >
                  <X size={14} className="mr-1" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-20 flex-col items-center justify-center rounded-md border-2 border-dashed border-[#c9d3c3] bg-white/30 text-[#7a8c7b]">
              <ImageIcon size={20} className="mb-1 opacity-50" />
              <span className="text-[10px]">No screenshot attached</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-[#D85A3E] text-white hover:bg-[#c44d32]"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 animate-spin" size={18} />
              ) : (
                <Save className="mr-2" size={18} />
              )}
              {existing ? "Update" : "Save to Recall"}
            </Button>
            {existing ? (
              <Button
                variant="outline"
                className="border-[#c9d3c3] text-[#7a8c7b]"
                onClick={() => openDashboard(`?resource=${encodeURIComponent(existing.id)}`)}
              >
                <Library size={16} className="mr-1" /> Open
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 border-[#c9d3c3] text-[#7a8c7b]"
                onClick={() => window.close()}
              >
                Cancel
              </Button>
            )}
          </div>

          {existing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-[#7a8c7b] hover:text-[#597c62]"
              onClick={handleSaveAsNew}
              disabled={saving}
            >
              Save as a separate entry instead
            </Button>
          )}

          <div className="flex items-center justify-between border-t border-[#c9d3c3]/50 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-[10px] text-[#7a8c7b] hover:text-[#597c62]"
              onClick={() => openDashboard()}
            >
              <SettingsIcon size={12} /> Library &amp; settings
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-[10px] text-amber-600 hover:bg-amber-50 hover:text-amber-700"
              onClick={async () => {
                try {
                  downloadJson("recall-emergency-export.json", await repository.listResources());
                  toast.success("Exported");
                } catch {
                  toast.error("Export failed");
                }
              }}
            >
              <AlertCircle size={12} /> Emergency export
            </Button>
          </div>
        </div>
      </div>

      <footer className="mt-6 border-t border-[#c9d3c3] pt-4 text-center text-[10px] text-[#7a8c7b]">
        Everything stays on this device.
      </footer>
    </div>
  );
}

const container = document.getElementById("popup-root");
if (container) createRoot(container).render(<Popup />);
