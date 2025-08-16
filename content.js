(() => {
  const POST_TYPE = "__CGPT_CLIPQ_EVENT__";

  let IsQueryFlag = true;
  const g_versionStr = 'OpenAI ChatGPT v1.2025.217';

  // Lightweight queue kept in content-script memory + mirrored to storage.session
  const state = {
    queue: [],
    sep: "\n\n" // separator between items
  };

  // DOM: floating UI
  function ensureUi() {
    if (document.getElementById("cgpt-clipq-container")) return;

    const root = document.createElement("div");
    root.id = "cgpt-clipq-container";

    const btn = document.createElement("button");
    btn.id = "cgpt-clipq-button";
    btn.textContent = "Copy Queue → Clipboard";

    const count = document.createElement("span");
    count.id = "cgpt-clipq-count";
    count.textContent = "(0)";

    btn.appendChild(count);
    btn.disabled = true;

    const toast = document.createElement("div");
    toast.id = "cgpt-clipq-toast";
    toast.textContent = "Copied!";

    root.appendChild(btn);
    root.appendChild(toast);
    document.documentElement.appendChild(root);

    btn.addEventListener("click", onFlushClicked);
  }

  function updateButton() {
    const count = document.getElementById("cgpt-clipq-count");
    const btn = document.getElementById("cgpt-clipq-button");
    if (!count || !btn) return;
    count.textContent = `(${state.queue.length})`;
    btn.disabled = state.queue.length === 0;
  }

  function showToast(msg = "Copied!") {
    const toast = document.getElementById("cgpt-clipq-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1200); // transient feedback
  }

  function sanitize(s) {
    // Normalize newlines and trim excessive whitespace
    return String(s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00A0/g, " ")
      .trim();
  }

  function enqueue(kind, text) {
    const clean = sanitize(text);
    if (!clean) return;
    state.queue.push({
      kind,
      text: clean,
      t: new Date().toISOString()
    });
    chrome.storage.session.set({ cgpt_clipq_queue: state.queue });
    updateButton();
  }

  async function onFlushClicked() {
    try {
      const payload = state.queue.map((it, i) => {
        let thread = `${i%2==0 ? '**Q:' : '**A:**'} ${it.text}${i%2==0 ? '**' : ''}`;
        if (i == 0)
          thread = `## ${g_versionStr}\n\n${thread}`;
        return thread;
      }).join(state.sep);

      // Write to system clipboard
      await navigator.clipboard.writeText(payload); // requires clipboardWrite and a user gesture

      // Clear queue after successful write
      state.queue.length = 0;
      chrome.storage.session.set({ cgpt_clipq_queue: state.queue });
      updateButton();
      showToast("Copied queue to clipboard.");
    } catch (e) {
      showToast("Copy failed (permission?).");
      // Tip: If this errors, ensure the tab is active and focused.
    }
  }

  // Listen to messages from injected page-context wrapper
  function onPageMessage(ev) {
    const data = ev?.data;
    if (!data || data.type !== POST_TYPE) return;
    const { kind, payload } = data;
    const text = payload?.text ?? "";
    enqueue(kind, text);
  }

  // Load previous session (same tab) queue if any
  async function restoreQueue() {
    try {
      const { cgpt_clipq_queue } = await chrome.storage.session.get("cgpt_clipq_queue");
      if (Array.isArray(cgpt_clipq_queue)) {
        state.queue = cgpt_clipq_queue;
      }
    } catch {}
    updateButton();
  }

  // Inject page-context shim
  function injectShim() {
    try {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("injected.js");
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch {}
  }

  // Init
  ensureUi();
  restoreQueue();
  injectShim();
  window.addEventListener("message", onPageMessage, false);

  // Also observe content-world user copy/cut (belt-and-suspenders)
  document.addEventListener("copy", () => {
    const sel = (document.getSelection?.() || "").toString();
    if (sel) enqueue("copy", sel);
  }, true);
  document.addEventListener("cut", () => {
    const sel = (document.getSelection?.() || "").toString();
    if (sel) enqueue("cut", sel);
  }, true);

  // Optional: clean up if ChatGPT does client-side route changes
  document.addEventListener("visibilitychange", () => {
    // no-op; placeholder for future route-aware logic
  });
})();
