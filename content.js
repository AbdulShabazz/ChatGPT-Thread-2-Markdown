// Utility: sleep
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Try to ensure lazy-loaded messages are present by scrolling.
async function ensureAllMessagesLoaded() {
  let lastHeight = -1;
  for (let i = 0; i < 12; i++) { // up to ~12 passes
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await delay(300);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    await delay(300);
    const h = document.documentElement.scrollHeight;
    if (h === lastHeight) break;
    lastHeight = h;
  }
}

// Find all message root nodes (robust to UI changes).
function findMessageNodes() {
  const nodes = new Set();

  // Common patterns seen across ChatGPT UIs over time
  const candidates = document.querySelectorAll([
    // MV variants (2024–2025): article[data-message-id]
    'article[data-message-id]',
    // Older: elements carrying author role
    '[data-message-author-role]',
    // Fallback: explicit message id container
    'div[data-message-id]'
  ].join(','));

  for (const el of candidates) {
    const key = el.getAttribute('data-message-id') || el.dataset.messageId || `${el.tagName}-${nodes.size}`;
    if (!nodes.has(key)) nodes.add(el);
  }
  return Array.from(nodes);
}

// Deduce role string (assistant/user/system/tool) where possible.
function detectRole(el) {
  const attr = el.getAttribute('data-message-author-role') || '';
  if (attr) return attr;

  // Heuristics: labels or class hints (future-proof-ish)
  const txt = (el.getAttribute('aria-label') || el.className || '').toLowerCase();
  if (txt.includes('assistant')) return 'assistant';
  if (txt.includes('user')) return 'user';
  if (txt.includes('system')) return 'system';
  if (txt.includes('tool')) return 'tool';
  return 'assistant';
}

// Normalize whitespace.
function normalizeText(s) {
  return s.replace(/\u00A0/g, ' ').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Extract LaTeX from a KaTeX subtree if present.
function katexToLatex(el) {
  // KaTeX typically renders a <span class="katex"> with a <span class="katex-mathml"> containing <annotation encoding="application/x-tex">...</annotation>
  const mathml = el.querySelector('.katex-mathml annotation');
  if (mathml && mathml.textContent) return mathml.textContent;
  return null;
}

// Convert a single message element into Markdown.
// We implement a focused converter tuned for ChatGPT's markup.
// If you prefer a full HTML→MD library, you can swap this out for Turndown.
function elementToMarkdown(el, { collapseImages = false } = {}) {
  // Work on a deep clone to avoid mutating the page.
  const clone = el.cloneNode(true);

  // Remove UI chrome (buttons, menus, feedback, etc.)
  clone.querySelectorAll('button, menu, nav, svg, textarea, [role="menu"], [data-testid="toast"]').forEach(n => n.remove());

  // Handle KaTeX → LaTeX
  clone.querySelectorAll('.katex').forEach(kx => {
    const tex = katexToLatex(kx);
    if (tex) {
      // Block vs inline heuristic
      const isBlock = !!kx.closest('block, div, p, section, article, figure');
      const fence = isBlock ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
      const span = document.createElement('span');
      span.textContent = fence;
      kx.replaceWith(span);
    }
  });

  // Code blocks: <pre><code class="language-xxx">...</code></pre>
  clone.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code') || pre;
    const lang = (code.className || '').match(/language-([\w-]+)/)?.[1] || '';
    const fence = '```' + lang + '\n' + code.textContent.replace(/\n$/, '') + '\n```\n';
    const block = document.createElement('div');
    block.textContent = fence;
    pre.replaceWith(block);
  });

  // Inline code: <code>...</code> not inside pre
  clone.querySelectorAll('code').forEach(code => {
    if (code.closest('pre')) return;
    const t = code.textContent;
    const wrapped = '`' + t.replace(/`/g, '\\`') + '`';
    const span = document.createElement('span');
    span.textContent = wrapped;
    code.replaceWith(span);
  });

  // Links: convert <a href="...">text</a> → [text](href)
  clone.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const text = a.textContent || href;
    const md = `[${text}](${href})`;
    const span = document.createElement('span');
    span.textContent = md;
    a.replaceWith(span);
  });

  // Images: convert <img> → ![alt](src) or collapsed link
  clone.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const md = collapseImages ? `[image: ${alt || 'img'}](${src})` : `![${alt}](${src})`;
    const span = document.createElement('span');
    span.textContent = md;
    img.replaceWith(span);
  });

  // Headings: h1..h6 → # .. ######
  for (let lvl = 6; lvl >= 1; lvl--) {
    clone.querySelectorAll(`h${lvl}`).forEach(h => {
      const hashes = '#'.repeat(lvl);
      const md = `\n${hashes} ${normalizeText(h.textContent)}\n`;
      const div = document.createElement('div');
      div.textContent = md;
      h.replaceWith(div);
    });
  }

  // Lists: simple transforms for <ul>/<ol>
  clone.querySelectorAll('ul').forEach(ul => {
    const items = Array.from(ul.querySelectorAll(':scope > li')).map(li => `- ${normalizeText(li.textContent)}`);
    const md = '\n' + items.join('\n') + '\n';
    const div = document.createElement('div');
    div.textContent = md;
    ul.replaceWith(div);
  });
  clone.querySelectorAll('ol').forEach((ol) => {
    const items = Array.from(ol.querySelectorAll(':scope > li')).map((li, i) => `${i + 1}. ${normalizeText(li.textContent)}`);
    const md = '\n' + items.join('\n') + '\n';
    const div = document.createElement('div');
    div.textContent = md;
    ol.replaceWith(div);
  });

  // Blockquotes
  clone.querySelectorAll('blockquote').forEach(bq => {
    const lines = normalizeText(bq.textContent).split('\n').map(l => `> ${l}`);
    const md = '\n' + lines.join('\n') + '\n';
    const div = document.createElement('div');
    div.textContent = md;
    bq.replaceWith(div);
  });

  // Try to focus on message payload area; many UIs wrap the text in a "markdown/prose" container.
  const payload =
    clone.querySelector('.markdown, .prose, .whitespace-pre-wrap, [data-message-author-role], article, .text-base') || clone;

  return normalizeText(payload.textContent || '');
}

// Try to collect a per-message timestamp if ChatGPT exposes one (not always present).
function findTimestamp(el) {
  const time = el.querySelector('time[datetime]') || el.querySelector('time');
  if (time?.getAttribute('datetime')) return time.getAttribute('datetime');
  if (time?.textContent) return time.textContent.trim();
  return '';
}

// Entry point: build the thread Markdown.
async function buildThreadMarkdown(options) {
  await ensureAllMessagesLoaded();

  const title = options.includeTitle 
    || document.querySelector('header h1, h1')?.textContent?.trim()
    || document.title?.trim()
    || 'ChatGPT Thread';

  const url = location.href;
  const nodes = findMessageNodes();

  const lines = [];

  if (options?.includeMeta !== false) {
    const now = new Date().toISOString();
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`- Source: ${url}`);
    lines.push(`- Exported: ${now}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const el of nodes) {
    const role = detectRole(el);
    const ts = options?.includeTimestamps ? findTimestamp(el) : '';
    const header = `### ${role}${ts ? ` — ${ts}` : ''}`;
    const bodyMd = elementToMarkdown(el, { collapseImages: !!options?.collapseImages });

    // Skip empty noise
    if (!bodyMd) continue;

    lines.push(header);
    lines.push('');
    lines.push(bodyMd);
    lines.push('');
  }

  return lines.join('\n');
}

// Listen for popup request
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'EXPORT_CHATGPT_THREAD_MARKDOWN') {
      try {
        const md = await buildThreadMarkdown(msg.options || {});
        sendResponse(md);
      } catch (e) {
        console.error(e);
        sendResponse('');
      }
    }
  })();

  // Keep the message channel open for the async sendResponse.
  return true;
});
