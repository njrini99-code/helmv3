// ============================================================================
// HTML → readable plain text, for the text/plain part of multipart/alternative
// sends. NOT a general-purpose sanitizer — it produces the human-readable
// fallback a mail client shows when it can't (or prefers not to) render HTML.
// ============================================================================

/** Decode the handful of entities that appear in our email templates.
 *  `&amp;` decodes LAST so `&amp;lt;` yields the literal text "&lt;" instead
 *  of double-unescaping to "<". */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&amp;/gi, '&');
}

/**
 * Convert an HTML email document to readable plain text:
 * head/style/script dropped, block boundaries become newlines, anchors keep
 * their href as "label (url)" so links survive, entities decoded, whitespace
 * collapsed. Good enough for the alternative part; the HTML part is canonical.
 */
/** Apply a delete-replacement until the string stops changing. A single pass
 *  can leave re-assembled fragments behind (`<<script>script>` → `<script>`);
 *  each pass strictly shrinks the string, so this always terminates. */
function stripUntilStable(s: string, re: RegExp): string {
  for (;;) {
    const next = s.replace(re, '');
    if (next === s) return s;
    s = next;
  }
}

export function htmlToText(html: string): string {
  let s = html;
  // Drop non-content regions entirely (styles would otherwise leak CSS text).
  s = stripUntilStable(s, /<head[\s\S]*?<\/head>/gi);
  s = stripUntilStable(s, /<(style|script|title)[\s\S]*?<\/\1>/gi);
  s = stripUntilStable(s, /<!--[\s\S]*?-->/g);
  // Keep link destinations: <a href="url">label</a> → label (url)
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, label: string) => {
      const text = stripUntilStable(label, /<[^>]+>/g).trim();
      if (!text) return href;
      // Skip echoing mailto/anchor hrefs or a label that already IS the url.
      if (href.startsWith('#') || href.startsWith('mailto:') || text === href) return text;
      return `${text} (${href})`;
    },
  );
  // Block-level boundaries → newlines (double for paragraph-ish blocks).
  s = s.replace(/<\/(p|div|tr|table|h[1-6]|li|blockquote)>/gi, '\n\n');
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  // Everything else: strip tags.
  s = stripUntilStable(s, /<[^>]+>/g);
  s = decodeEntities(s);
  // Collapse: spaces/tabs runs → one space; 3+ newlines → blank line; trim lines.
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}
