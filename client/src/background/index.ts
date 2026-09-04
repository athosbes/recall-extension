// Recall — background service worker.
//
// Runs the work that must outlive the popup: the "already saved" toolbar badge,
// context-menu captures, the backup reminder, and area-screenshot capture (which
// cannot live in the popup, because clicking the page to drag closes the popup
// and tears down its message port).

import { repository, createId } from "@/lib/memory";
import { onMemoryChanged } from "@/lib/events";
import { domainOf, normalizeUrl } from "@/lib/url";
import type { MemoryResource } from "@/types/memory";

const SAVED_BADGE = "✓";
const BADGE_COLOR = "#597c62";
const PENDING_SCREENSHOT_KEY = "pendingScreenshot";

// --- install ----------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "recall-save-selection",
      title: "Save selection to Recall",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "recall-save-page",
      title: "Save this page to Recall",
      contexts: ["page", "link"],
    });
    chrome.contextMenus.create({
      id: "recall-search-selection",
      title: "Search Recall for “%s”",
      contexts: ["selection"],
    });
  });

  chrome.alarms.create("backup-check", { periodInMinutes: 720 });
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
});

// --- "already saved" badge --------------------------------------------------

async function refreshBadge(tabId: number, url: string | undefined) {
  try {
    const existing = url ? await repository.findByUrl(url) : undefined;
    await chrome.action.setBadgeText({ tabId, text: existing ? SAVED_BADGE : "" });
    await chrome.action.setTitle({
      tabId,
      title: existing ? `Already in Recall — ${existing.name}` : "Capture to Recall",
    });
  } catch {
    // A tab can close between the lookup and the update; nothing to recover.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    void refreshBadge(tabId, changeInfo.url ?? tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await refreshBadge(tabId, tab.url);
  } catch {
    /* tab gone */
  }
});

// Saving or deleting in any context should update the badge immediately rather
// than waiting for the next navigation.
onMemoryChanged(() => {
  void (async () => {
    const tabs = await chrome.tabs.query({ active: true });
    for (const tab of tabs) {
      if (tab.id !== undefined) await refreshBadge(tab.id, tab.url);
    }
  })();
});

// --- context menus ----------------------------------------------------------

function buildResource(
  tab: chrome.tabs.Tab,
  overrides: Partial<MemoryResource> & { selection?: string },
): MemoryResource {
  const now = new Date().toISOString();
  const url = tab.url ?? "";
  const domain = domainOf(url);
  return {
    id: createId("res"),
    name: overrides.name ?? tab.title ?? url,
    type: "page",
    url: url || undefined,
    normalizedUrl: normalizeUrl(url),
    description: overrides.description ?? tab.title ?? "",
    whenToRemember: [],
    concepts: [],
    tags: domain ? [domain.split(".")[0]] : [],
    collectionIds: [],
    notes: overrides.selection ? `Selected text: "${overrides.selection}"` : "",
    source: {
      title: tab.title ?? "",
      url,
      domain,
      selection: overrides.selection,
      savedAt: now,
    },
    feedback: { useful: 0, veryUseful: 0, notUseful: 0 },
    createdAt: now,
    updatedAt: now,
    viewCount: 0,
  };
}

/** Saves the tab, merging into the existing record when the page is already known. */
async function captureTab(tab: chrome.tabs.Tab, selection?: string) {
  if (!tab.url) return;
  const existing = await repository.findByUrl(tab.url);

  if (existing) {
    const note = selection ? `Selected text: "${selection}"` : "";
    await repository.putResource({
      ...existing,
      notes:
        note && !existing.notes.includes(note)
          ? [existing.notes, note].filter(Boolean).join("\n\n")
          : existing.notes,
    });
    return;
  }

  await repository.putResource(buildResource(tab, { selection }));
  await bumpCaptureCount();
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;

  if (info.menuItemId === "recall-save-selection") {
    void captureTab(tab, info.selectionText);
  } else if (info.menuItemId === "recall-save-page") {
    void captureTab(tab);
  } else if (info.menuItemId === "recall-search-selection") {
    void chrome.tabs.create({
      url: chrome.runtime.getURL(`index.html?q=${encodeURIComponent(info.selectionText ?? "")}`),
    });
  }
});

// --- area screenshot --------------------------------------------------------

interface SelectedArea {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

async function ensureContentScript(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RECALL_PING" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

/**
 * Crops the visible-tab capture to the selected region. `captureVisibleTab`
 * returns an image in device pixels while the selection rectangle is measured in
 * CSS pixels, so the ratio has to be applied here or the crop lands in the wrong
 * place on any HiDPI screen.
 */
async function cropDataUrl(dataUrl: string, area: SelectedArea): Promise<string> {
  const response = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await response.blob());

  const ratio = area.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(area.width * ratio));
  const height = Math.max(1, Math.round(area.height * ratio));
  const left = Math.max(0, Math.round(area.x * ratio));
  const top = Math.max(0, Math.round(area.y * ratio));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a drawing surface.");
  context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

async function runAreaCapture(tabId: number, windowId: number) {
  await ensureContentScript(tabId);
  const selection = (await chrome.tabs.sendMessage(tabId, { type: "START_AREA_SELECTION" })) as
    { success: true; area: SelectedArea } | { success: false; error: string };

  if (!selection?.success) return { success: false as const, error: selection?.error ?? "Cancelled" };

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const cropped = await cropDataUrl(dataUrl, selection.area);
  await chrome.storage.session.set({ [PENDING_SCREENSHOT_KEY]: cropped });
  return { success: true as const };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type === "START_AREA_CAPTURE") {
    void (async () => {
      try {
        const result = await runAreaCapture(request.tabId, request.windowId);
        if (result.success) {
          // The popup closed the moment the user clicked the page, so tell them
          // the crop is waiting rather than dropping it silently.
          try {
            await chrome.action.openPopup();
          } catch {
            await notify("Screenshot ready", "Open Recall to attach it to your capture.");
          }
        }
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
    })();
    return true;
  }
  return undefined;
});

// --- backup reminder --------------------------------------------------------

async function bumpCaptureCount() {
  const { capturesSinceBackup } = await chrome.storage.local.get("capturesSinceBackup");
  const count = typeof capturesSinceBackup === "number" ? capturesSinceBackup : 0;
  await chrome.storage.local.set({ capturesSinceBackup: count + 1 });
}

function notify(title: string, message: string) {
  return chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title,
    message,
    priority: 1,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "backup-check") return;

  const { lastBackupDate, capturesSinceBackup } = await chrome.storage.local.get([
    "lastBackupDate",
    "capturesSinceBackup",
  ]);
  const captures = typeof capturesSinceBackup === "number" ? capturesSinceBackup : 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const staleByDate = typeof lastBackupDate === "number" && Date.now() - lastBackupDate > sevenDays;
  const staleByCount = captures >= 50;

  if (!staleByDate && !staleByCount) return;

  await notify(
    "Recall: backup reminder",
    staleByCount
      ? `${captures} pages saved since your last backup. Export one to keep them safe.`
      : "It has been a week since your last backup.",
  );
});
