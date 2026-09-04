import { describe, expect, it, vi } from "vitest";
import { notifyMemoryChanged, onMemoryChanged } from "./events";

describe("onMemoryChanged", () => {
  it("notifies the context that made the change", () => {
    // A BroadcastChannel does not deliver to the sender, so without an explicit
    // local dispatch the view that saved a resource never refreshes itself.
    const listener = vi.fn();
    const unsubscribe = onMemoryChanged(listener);

    notifyMemoryChanged();
    expect(listener).toHaveBeenCalledTimes(1);

    notifyMemoryChanged();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    notifyMemoryChanged();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps notifying the others when one listener throws", () => {
    const failing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const unsubscribeFailing = onMemoryChanged(failing);
    const unsubscribeHealthy = onMemoryChanged(healthy);

    expect(() => notifyMemoryChanged()).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);

    unsubscribeFailing();
    unsubscribeHealthy();
    error.mockRestore();
  });

  it("survives a listener unsubscribing during dispatch", () => {
    const second = vi.fn();
    const unsubscribeSecond = onMemoryChanged(() => second());
    const unsubscribeFirst = onMemoryChanged(() => unsubscribeSecond());

    expect(() => notifyMemoryChanged()).not.toThrow();
    unsubscribeFirst();
    unsubscribeSecond();
  });
});
