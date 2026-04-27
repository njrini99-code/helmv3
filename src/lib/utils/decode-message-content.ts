/**
 * Strict inverse of the legacy `sanitizeHtml` encoder that previously ran on
 * message saves (escaping `< > " ' /` to entities). Existing rows in the DB
 * still contain those entities, so callers run this at render time.
 *
 * The encoder did NOT touch `&`, so we don't decode `&amp;` — staying a true
 * inverse avoids turning user-typed literal `&amp;` into `&`.
 */
export function decodeMessageContent(content: string | null | undefined): string {
  if (!content) return '';
  return content
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
