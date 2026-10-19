import { marked } from '../vendor/marked.mjs';
import DOMPurify from '../vendor/purify.mjs';

export function renderMarkdown(text) {
  const root = document.createElement('div'); root.className = 'markdown-body';
  root.innerHTML = DOMPurify.sanitize(marked.parse(String(text), { gfm: true, breaks: true, async: false }), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'start'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  });
  for (const link of root.querySelectorAll('a')) {
    const href = link.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) link.removeAttribute('href');
    else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  }
  return root;
}
