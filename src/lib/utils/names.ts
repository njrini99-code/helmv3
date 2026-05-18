/**
 * Display-safe name helpers. Strip bidi / zero-width / control characters
 * that can otherwise render as layout-breaking glyphs, and cap length so a
 * malicious signup can't blow out a centred hero greeting.
 */

// RTL overrides, zero-width / paragraph separators, ASCII control chars.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2066-\u2069]/g;
const MAX_DISPLAY_LENGTH = 40;

function sanitize(raw: string): string {
  return raw.replace(UNSAFE_CHARS, '').trim().slice(0, MAX_DISPLAY_LENGTH);
}

export function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const parts = sanitize(fullName).split(/\s+/).filter(Boolean);
  return parts[0] ?? null;
}

export function extractLastName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const parts = sanitize(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}
