import { useCallback, useEffect, useMemo, useState } from "react";
import { Library, Search, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditResourceDialog } from "@/components/EditResourceDialog";
import { useMemoryLibrary } from "@/hooks/useMemoryLibrary";
import { repository } from "@/lib/memory";
import type { MemoryResource } from "@/types/memory";
import { LibraryView } from "@/pages/LibraryView";
import { SearchView } from "@/pages/SearchView";
import { SettingsView } from "@/pages/SettingsView";

type Tab = "library" | "search" | "settings";

export default function Dashboard() {
  const { resources, collections, loading, error, reload } = useMemoryLibrary();
  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MemoryResource | undefined>();

  // Entry points elsewhere in the extension deep-link into a tab, a search, or
  // a single resource: the context menu passes ?q=, the popup passes ?resource=.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const requestedQuery = params.get("q");

    if (requestedTab === "settings") setTab("settings");
    if (requestedQuery) {
      setQuery(requestedQuery);
      setTab("search");
    }
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("resource");
    if (!requested || !resources.length) return;
    const match = resources.find((resource) => resource.id === requested);
    if (match) setEditing(match);
  }, [resources]);

  const openResource = useCallback(async (resource: MemoryResource, searchQuery = "") => {
    try {
      await repository.recordResourceView(resource.id, searchQuery);
    } catch (cause) {
      console.error("[Recall] Could not record the view:", cause);
    }
    if (resource.url) window.open(resource.url, "_blank", "noopener,noreferrer");
  }, []);

  const deleteResource = useCallback(async (resource: MemoryResource) => {
    try {
      await repository.deleteResource(resource.id);
      toast.success(`Removed “${resource.name}”`, {
        action: {
          label: "Undo",
          onClick: () => {
            void repository.putResource(resource).catch(() => toast.error("Could not restore it."));
          },
        },
      });
    } catch {
      toast.error("Could not remove that resource.");
    }
  }, []);

  const saveResource = useCallback(async (resource: MemoryResource) => {
    try {
      await repository.putResource(resource);
      toast.success("Saved");
    } catch {
      toast.error("Could not save your changes.");
    }
  }, []);

  const navigation = useMemo(
    () =>
      [
        { id: "library" as const, label: "Library", icon: Library },
        { id: "search" as const, label: "Search", icon: Search },
        { id: "settings" as const, label: "Backup & data", icon: SettingsIcon },
      ].map((entry) => ({ ...entry })),
    [],
  );

  return (
    <div className="flex min-h-screen bg-[#FBF8F1] font-sans text-[#314239]">
      <aside className="flex w-64 shrink-0 flex-col gap-8 border-r border-[#c9d3c3] p-6">
        <div className="flex items-center gap-2">
          <img src="icons/icon-32.png" alt="" className="h-8 w-8 rounded" />
          <span className="font-serif text-xl font-bold">Recall</span>
        </div>

        <nav className="flex flex-col gap-1">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={`justify-start gap-3 ${
                tab === id ? "bg-[#ecf3e9] text-[#597c62]" : "text-[#7a8c7b]"
              }`}
              onClick={() => setTab(id)}
            >
              <Icon size={18} /> {label}
            </Button>
          ))}
        </nav>

        <div className="mt-auto text-[10px] uppercase tracking-widest text-[#7a8c7b]">
          {resources.length} saved · {collections.length} collection{collections.length === 1 ? "" : "s"}
        </div>
      </aside>

      <main className="max-w-5xl flex-1 overflow-y-auto p-12">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <p className="mb-2 font-bold">Recall could not open your library.</p>
            <p className="mb-4">{error}</p>
            <Button variant="outline" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : tab === "library" ? (
          <LibraryView
            resources={resources}
            collections={collections}
            loading={loading}
            onOpen={openResource}
            onEdit={setEditing}
            onDelete={deleteResource}
            onSearch={(next) => {
              setQuery(next);
              setTab("search");
            }}
          />
        ) : tab === "search" ? (
          <SearchView
            resources={resources}
            collections={collections}
            query={query}
            onQueryChange={setQuery}
            onOpen={openResource}
            onEdit={setEditing}
            onDelete={deleteResource}
          />
        ) : (
          <SettingsView resources={resources} />
        )}
      </main>

      <EditResourceDialog
        resource={editing}
        collections={collections}
        onClose={() => setEditing(undefined)}
        onSave={saveResource}
      />
    </div>
  );
}
