// ============================================================================
// HTML → readable plain text, for the text/plain part of multipart/alternative
// sends. NOT a general-purpose sanitizer — it produces the human-readable
// fallback a mail client shows when it can't (or prefers not to) render HTML.
// ============================================================================

/** Decode the handful of entities that appear in our email templates. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    });
}

/**
 * Convert an HTML email document to readable plain text:
 * head/style/script dropped, block boundaries become newlines, anchors keep
 * their href as "label (url)" so links survive, entities decoded, whitespace
 * collapsed. Good enough for the alternative part; the HTML part is canonical.
 */
export function htmlToText(html: string): string {
  let s = html;
  // Drop non-content regions entirely (styles would otherwise leak CSS text).
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '');
  s = s.replace(/<(style|script|title)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Keep link destinations: <a href="url">label</a> → label (url)
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
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
  s = s.replace(/<[^>]+>/g, '');
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
