async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('exportBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  const titleHint = (await chrome.tabs.get(tab.id)).title || 'chatgpt-thread';
  const title = titleHint.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'chatgpt-thread';

  const options = {
    includeTitle: title,
    includeMeta: document.getElementById('includeMeta').checked,
    includeTimestamps: document.getElementById('includeTimestamps').checked,
    collapseImages: document.getElementById('collapseImages').checked
  };

  // Ask the content script on the active tab to collect Markdown.
  const markdown = await chrome.tabs.sendMessage(tab.id, {
    type: 'EXPORT_CHATGPT_THREAD_MARKDOWN',
    options
  });

  if (!markdown) {
    alert('No content was extracted. Make sure a ChatGPT thread is open.');
    return;
  }

  // Build a filename based on page title and time.
  const now = new Date();
  const iso = now.toISOString().replace(/[:]/g, '-').replace('T', '_').slice(0, 19);
  // Title is provided by content script when possible; fall back to tab.title.
  const filename = `${title}__${iso}.md`;

  // Save (clipboard)
  navigator.clipboard.writeText(markdown)

  /*
  // Save using downloads API (requires "downloads" permission).
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: true });
  } finally {
    // Revoke to avoid leaking object URLs.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } */
});
