# Save ChatGPT Thread as Markdown (Edge/Chromium, MV3)

## Install (unpacked)
1. Open **edge://extensions** in Microsoft Edge.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Navigate to a ChatGPT conversation (chatgpt.com or chat.openai.com).
5. Click the extension icon → **Export as .md**.

## Permissions
- `"downloads"` to write the Markdown file via `chrome.downloads.download`.  
- `host_permissions` for `https://chatgpt.com/*` and `https://chat.openai.com/*` so the content script can read the DOM.  
- `"activeTab"` to interact with the foreground tab as needed.

## How it works
- The popup sends a message to the content script asking it to **collect/convert** the entire thread to Markdown (message passing).  
- The content script:
  - Scrolls to load lazy messages,
  - Extracts each message node (assistant/user/system/tool),
  - Converts HTML → Markdown (code fences, links, lists, images),
  - Extracts KaTeX → LaTeX from the embedded MathML annotation when present.
- The popup receives the Markdown and saves it via `chrome.downloads.download`.

## Options
- **Include metadata**: adds title, URL, export timestamp to the top of the file.
- **Include per-message timestamps**: if the page exposes `<time>` nodes.
- **Collapse images**: turn images into `[image](url)` links instead of inline `![alt](url)`.

## Troubleshooting
- If nothing is exported, ensure a conversation is visible and try scrolling once.
- UI changes on ChatGPT may require updating the selectors at the top of `content.js`.
- For richer HTML→Markdown, consider replacing the built-in converter with **Turndown**.

