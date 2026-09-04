// Cross-context notification that stored memory changed.
//
// The popup, the dashboard tab and the background service worker are three
// separate JavaScript contexts over one IndexedDB database. A DOM event only
// reaches its own document, so saving from the popup used to leave an open
// dashboard stale and would throw outright inside the worker.

const CHANNEL_NAME = "recall-memory";

const listeners = new Set<() => void>();

let channel: BroadcastChannel | undefined;
let subscribed = false;

function getChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

function emit() {
  // Copied first so a listener that unsubscribes during dispatch is safe.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error("[Recall] A memory-changed listener failed:", error);
    }
  }
}

export function notifyMemoryChanged() {
  // A BroadcastChannel deliberately does not deliver a message back to the
  // object that posted it, so the context that made the change has to be told
  // separately — otherwise the view you are looking at never updates.
  getChannel()?.postMessage({ type: "memory-changed", at: Date.now() });
  emit();
}

/** Subscribes to changes from any context. Returns an unsubscribe function. */
export function onMemoryChanged(listener: () => void): () => void {
  listeners.add(listener);

  const target = getChannel();
  if (target && !subscribed) {
    subscribed = true;
    target.addEventListener("message", emit);
  }

  return () => listeners.delete(listener);
}
