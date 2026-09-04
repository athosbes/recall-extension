import type { MemoryResource, ResourceType } from "@/types/memory";
import { createId } from "@/lib/memory";
import { domainOf, normalizeUrl } from "@/lib/url";

export interface PageMetadata {
  title: string;
  url: string;
  domain: string;
  description: string;
  selection: string;
  type: ResourceType;
  concepts: string[];
  tags: string[];
}

const RESTRICTED_SCHEMES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
];

export const canInjectInto = (url: string | undefined): url is string =>
  Boolean(url) && !RESTRICTED_SCHEMES.some((scheme) => url!.startsWith(scheme));

/**
 * Asks the page for its metadata, injecting the content script first if it is
 * not already there. Returns undefined on pages the browser will not let us
 * touch — the caller falls back to what the tab itself reports.
 */
export async function readPageMetadata(tab: chrome.tabs.Tab): Promise<PageMetadata | undefined> {
  if (tab.id === undefined || !canInjectInto(tab.url)) return undefined;

  try {
    return (await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE_METADATA" })) as PageMetadata;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return (await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE_METADATA" })) as PageMetadata;
    } catch {
      return undefined;
    }
  }
}

/** Builds a complete resource from a tab and whatever the page told us. */
export function buildResourceDraft(tab: chrome.tabs.Tab, metadata: PageMetadata | undefined): MemoryResource {
  const now = new Date().toISOString();
  const url = metadata?.url || tab.url || "";
  const domain = metadata?.domain || domainOf(url);
  const title = metadata?.title || tab.title || url || "Untitled";

  const tags = metadata?.tags?.length ? metadata.tags : domain ? [domain.split(".")[0]] : [];

  return {
    id: createId("res"),
    name: title,
    type: metadata?.type ?? "page",
    url: url || undefined,
    normalizedUrl: normalizeUrl(url),
    description: metadata?.description || title,
    whenToRemember: [],
    concepts: metadata?.concepts ?? [],
    tags,
    collectionIds: [],
    notes: metadata?.selection ? `Selected text: "${metadata.selection}"` : "",
    source: {
      title,
      url,
      domain,
      selection: metadata?.selection || undefined,
      savedAt: now,
    },
    feedback: { useful: 0, veryUseful: 0, notUseful: 0 },
    createdAt: now,
    updatedAt: now,
    viewCount: 0,
  };
}

/** "3 days ago" style label for a timestamp. */
export function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return "recently";

  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  return `${Math.round(months / 12)} year${Math.round(months / 12) === 1 ? "" : "s"} ago`;
}

/** Downloads a JSON payload as a file. */
export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking immediately can cancel the download in some builds.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
