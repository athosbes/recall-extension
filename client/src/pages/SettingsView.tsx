import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { repository } from "@/lib/memory";
import { downloadJson } from "@/lib/capture";
import type { MemoryResource } from "@/types/memory";

interface SettingsViewProps {
  resources: MemoryResource[];
}

export function SettingsView({ resources }: SettingsViewProps) {
  const [lastBackup, setLastBackup] = useState<number | undefined>();
  const [capturesSinceBackup, setCapturesSinceBackup] = useState(0);
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const [usage, setUsage] = useState<{ used: number; quota: number } | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const stored = await chrome.storage.local.get(["lastBackupDate", "capturesSinceBackup"]);
        setLastBackup(typeof stored.lastBackupDate === "number" ? stored.lastBackupDate : undefined);
        setCapturesSinceBackup(
          typeof stored.capturesSinceBackup === "number" ? stored.capturesSinceBackup : 0,
        );
      }
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setUsage({ used: (estimate.usage ?? 0) / 1048576, quota: (estimate.quota ?? 0) / 1048576 });
      }
      if (navigator.storage?.persisted) setPersisted(await navigator.storage.persisted());
    }
    void load();
  }, [resources]);

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const needsBackup = !lastBackup || Date.now() - lastBackup > sevenDays || capturesSinceBackup >= 50;
  // Guard the ratio: quota is 0 when the browser declines to report an estimate.
  const usedFraction = usage && usage.quota > 0 ? usage.used / usage.quota : 0;

  const exportBackup = async () => {
    try {
      const snapshot = await repository.exportSnapshot();
      downloadJson(`recall-backup-${new Date().toISOString().slice(0, 10)}.json`, snapshot);
      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.set({ lastBackupDate: Date.now(), capturesSinceBackup: 0 });
      }
      setLastBackup(Date.now());
      setCapturesSinceBackup(0);
      toast.success(`Exported ${snapshot.resources.length} resources`);
    } catch {
      toast.error("Backup failed.");
    }
  };

  const restoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { added, merged } = await repository.importSnapshot(JSON.parse(await file.text()));
      toast.success(
        added || merged
          ? `Restored — ${added} added, ${merged} updated.`
          : "Nothing new to restore; your library is already up to date.",
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not read that backup.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="mb-3 font-serif text-4xl font-bold">Backup &amp; data</h1>
        <p className="text-[#627168]">
          Recall keeps everything in this browser profile. That means nobody else can read it — and that
          nobody else has a copy if the profile goes away.
        </p>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-[#c9d3c3] bg-white p-8 shadow-sm">
        {needsBackup && resources.length > 0 && (
          <div className="absolute right-0 top-0 flex items-center gap-2 bg-[#D85A3E] px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
            <AlertTriangle size={10} /> Backup recommended
          </div>
        )}

        <h2 className="mb-2 font-serif text-xl font-bold">Your data</h2>
        <p className="mb-6 text-sm text-[#627168]">
          {resources.length} resource{resources.length === 1 ? "" : "s"} · last backup{" "}
          {lastBackup ? new Date(lastBackup).toLocaleDateString() : "never"}
          {capturesSinceBackup > 0 && ` · ${capturesSinceBackup} captured since`}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            className="gap-2 bg-[#D85A3E] text-white hover:bg-[#c44d32]"
            onClick={() => void exportBackup()}
          >
            <Download size={16} /> Export full backup
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-[#597c62] text-[#597c62] hover:bg-[#ecf3e9]"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} /> Restore from backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={restoreBackup}
          />
        </div>

        <p className="mt-4 text-xs text-[#7a8c7b]">
          Restoring merges into what you already have, matching pages by address — it will not create a second
          copy of something you re-captured.
        </p>
      </section>

      <section className="rounded-2xl border border-[#c9d3c3] bg-[#ecf3e9]/30 p-8 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck size={20} className="text-[#597c62]" />
          <h2 className="font-serif text-xl font-bold">Storage</h2>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-[#627168]">
          Recall asks the browser to mark its data as persistent, so it is not evicted when disk space runs
          low.{" "}
          {persisted === undefined
            ? ""
            : persisted
              ? "This browser has granted that."
              : "This browser has not granted that yet — it usually does once you have used the extension a few times."}
        </p>

        {usage && usage.quota > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#7a8c7b]">
              <span>Used</span>
              <span>
                {usage.used.toFixed(1)} MB of {usage.quota.toFixed(0)} MB
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full border border-[#c9d3c3] bg-white">
              <div
                className={`h-full ${usedFraction > 0.8 ? "bg-red-400" : "bg-[#597c62]"}`}
                style={{ width: `${Math.min(100, usedFraction * 100)}%` }}
              />
            </div>
            {usedFraction > 0.8 && (
              <p className="text-[10px] font-bold text-red-500">
                Storage is nearly full. Export a backup and remove what you no longer need.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#c9d3c3] bg-white/40 p-8">
        <h2 className="mb-4 font-serif text-xl font-bold">Capture</h2>
        <ConfirmBeforeSaveToggle />
      </section>
    </div>
  );
}

function ConfirmBeforeSaveToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    void chrome.storage.local.get("confirmBeforeSave").then((stored) => {
      if (stored.confirmBeforeSave !== undefined) setEnabled(Boolean(stored.confirmBeforeSave));
    });
  }, []);

  return (
    <div className="flex items-center justify-between rounded-xl border border-[#c9d3c3] bg-[#ecf3e9]/30 p-4">
      <div className="space-y-0.5">
        <Label htmlFor="confirm-before-save" className="text-sm font-bold">
          Review before saving
        </Label>
        <p className="text-[10px] text-[#7a8c7b]">
          Keep the capture form open so you can edit the suggestions. Turn it off to save in one click.
        </p>
      </div>
      <Switch
        id="confirm-before-save"
        checked={enabled}
        onCheckedChange={async (checked) => {
          setEnabled(checked);
          if (typeof chrome !== "undefined" && chrome.storage) {
            await chrome.storage.local.set({ confirmBeforeSave: checked });
          }
        }}
      />
    </div>
  );
}
