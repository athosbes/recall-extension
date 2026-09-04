// Recall — content script.
//
// Injected on demand by the popup or the service worker (there is no static
// content_scripts registration, so nothing runs on pages you never capture).
// Kept dependency-free plain JavaScript so it can be injected as a classic
// script without a bundling step.

(() => {
  // executeScript may run this file again on a tab that already has it.
  if (window.__recallContentScriptLoaded) return;
  window.__recallContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    switch (request?.type) {
      case "RECALL_PING":
        sendResponse({ ok: true });
        return false;

      case "EXTRACT_PAGE_METADATA":
        sendResponse(extractMetadata());
        return false;

      case "START_AREA_SELECTION":
        startSelection(sendResponse);
        return true; // responds after the user finishes dragging

      default:
        return false;
    }
  });

  function extractMetadata() {
    return {
      title: (document.title || "").trim(),
      url: window.location.href,
      domain: window.location.hostname.replace(/^www\./, ""),
      description: getMetaContent("description") || getMetaContent("og:description") || extractSnippet(),
      selection: (window.getSelection()?.toString() || "").trim().slice(0, 2000),
      type: detectPageType(),
      concepts: extractConcepts(),
      tags: extractTags(),
    };
  }

  function getMetaContent(name) {
    const element = document.querySelector(
      `meta[name="${name}"], meta[property="og:${name}"], meta[property="${name}"], meta[name="twitter:${name}"]`,
    );
    const content = element?.getAttribute("content");
    return content ? content.trim() : "";
  }

  function extractSnippet() {
    for (const selector of ["article p", "main p", ".content p", "p"]) {
      const element = document.querySelector(selector);
      const text = element?.innerText?.trim();
      if (text && text.length > 40) return `${text.slice(0, 240)}…`;
    }
    return "";
  }

  function detectPageType() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return "document";

    // Headings and the URL are cheap and far more reliable than scanning the
    // whole page body, which the previous version did on every capture.
    const signals = [
      window.location.hostname,
      path,
      document.title || "",
      document.querySelector("h1")?.innerText || "",
    ]
      .join(" ")
      .toLowerCase();

    if (/\b(docs?|documentation|api|reference|manual|guide)\b/.test(signals)) return "documentation";
    if (/\b(github|gitlab|gist|npm|pypi|snippet|source)\b/.test(signals)) return "script";
    if (/\b(tool|app|generator|converter|calculator|playground|editor)\b/.test(signals)) return "tool";
    return "page";
  }

  function extractConcepts() {
    const headings = [
      document.querySelector("h1"),
      ...Array.from(document.querySelectorAll("h2")).slice(0, 3),
    ];
    return dedupe(
      headings
        .map((element) => element?.innerText?.trim() ?? "")
        .filter((text) => text.length > 2 && text.length < 60),
    ).slice(0, 5);
  }

  function extractTags() {
    const tags = [];
    const keywords = getMetaContent("keywords");
    if (keywords) tags.push(...keywords.split(",").map((keyword) => keyword.trim().toLowerCase()));

    for (const element of Array.from(document.querySelectorAll('meta[property="article:tag"]')).slice(0, 5)) {
      const value = element.getAttribute("content");
      if (value) tags.push(value.trim().toLowerCase());
    }

    const parts = window.location.hostname.replace(/^www\./, "").split(".");
    if (parts.length > 1) tags.push(parts[0]);

    return dedupe(tags.filter((tag) => tag.length > 1 && tag.length < 30)).slice(0, 6);
  }

  function dedupe(values) {
    return Array.from(new Set(values));
  }

  // --- area selection -------------------------------------------------------

  let overlay = null;

  function startSelection(respond) {
    if (overlay) {
      respond({ success: false, error: "A selection is already in progress" });
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      respond(result);
    };

    overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2147483647;cursor:crosshair;";

    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;border:2px solid #D85A3E;background:rgba(216,90,62,0.1);display:none;";
    overlay.appendChild(box);

    const hint = document.createElement("div");
    hint.textContent = "Drag to select an area. Press Esc to cancel.";
    hint.style.cssText =
      "position:absolute;top:20px;left:50%;transform:translateX(-50%);background:#314239;color:#fff;" +
      "padding:8px 16px;border-radius:20px;font:12px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.2);";
    overlay.appendChild(hint);

    document.body.appendChild(overlay);

    let startX = 0;
    let startY = 0;

    const onMouseMove = (event) => {
      const left = Math.min(startX, event.clientX);
      const top = Math.min(startY, event.clientY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(event.clientX - startX)}px`;
      box.style.height = `${Math.abs(event.clientY - startY)}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);

      const rect = box.getBoundingClientRect();
      const area = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      };

      // The overlay must be gone before the tab is captured.
      cleanup();

      if (area.width > 5 && area.height > 5) finish({ success: true, area });
      else finish({ success: false, error: "Selected area was too small" });
    };

    const onMouseDown = (event) => {
      event.preventDefault();
      startX = event.clientX;
      startY = event.clientY;
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.style.display = "block";
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("mouseup", onMouseUp, true);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") finish({ success: false, error: "Cancelled" });
    };

    function cleanup() {
      overlay?.remove();
      overlay = null;
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    }

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
  }
})();
