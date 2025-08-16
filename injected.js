(() => {
  // Create a safe channel back to the content script
  const POST_TYPE = "__CGPT_CLIPQ_EVENT__";

  function postQueueItem(kind, payload) {
    try {
      window.postMessage(
        { type: POST_TYPE, kind, payload, ts: Date.now() },
        "*"
      );
    } catch {}
  }

  // Wrap navigator.clipboard.writeText
  try {
    const originalWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (originalWriteText) {
      navigator.clipboard.writeText = async (text) => {
        postQueueItem("writeText", { text: String(text ?? "") });
        return originalWriteText(text);
      };
    }
  } catch {}

  // Wrap navigator.clipboard.write (for arbitrary ClipboardItem data)
  try {
    const originalWrite = navigator.clipboard?.write?.bind(navigator.clipboard);
    if (originalWrite) {
      navigator.clipboard.write = async (items) => {
        // Attempt to extract text/plain if present
        if (Array.isArray(items)) {
          for (const it of items) {
            try {
              const types = it.types || [];
              if (types.includes("text/plain")) {
                const blob = await it.getType("text/plain");
                const text = await blob.text();
                postQueueItem("write", { text });
              }
            } catch {}
          }
        }
        return originalWrite(items);
      };
    }
  } catch {}

  // Listen to user copy/cut events to capture selected text
  function onUserClipboardEvent(e) {
    try {
      let captured = "";
      // If script initiated copy setData was used, prefer that.
      if (e && e.clipboardData) {
        captured =
          e.clipboardData.getData("text/plain") ||
          e.clipboardData.getData("text/html") ||
          "";
      }
      if (!captured) {
        captured = (document.getSelection?.() || "").toString();
      }
      if (captured) {
        postQueueItem(e.type, { text: captured });
      }
    } catch {}
  }

  document.addEventListener("copy", onUserClipboardEvent, true);
  document.addEventListener("cut", onUserClipboardEvent, true);
})();
