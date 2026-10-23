/**
 * Email addresses a coach types or pastes to invite players (Clubhouse › Roster › Invite players). Pure, so the sheet
 * that reads what is typed and the action that checks what arrives share one rule.
 */

/** Addresses one request may carry. A roster is invited in a few sends; the cap keeps one click from mailing a list. */
export const MAX_INVITE_EMAILS = 10;

/** What separates addresses in a paste: comma, semicolon, whitespace, a newline. A name before an address ("Eli <eli@x.edu>") is read as its address. */
const SEPARATORS = /[\s,;]+/;

/**
 * A contact with a name before its bracketed address: Eli Park <eli@x.edu> or "Park, Eli" <eli@x.edu>. The name is words
 * with no @ (so the address before it in a paste is never taken as part of it) or a quoted run; only the address is kept.
 */
const NAMED_CONTACT = /(^|[\s,;])(?:"[^"]*"|[^\s,;<>@"]+(?:[ \t]+[^\s,;<>@"]+)*)[ \t]*<([^<>\s]+)>/g;

/** One address, deliberately plain: a local part, one @, a dotted domain. The mail server is the real judge. */
const ADDRESS = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Lowercased and trimmed: the form a duplicate is judged on and an address is sent to. */
export const normalizeInviteEmail = (raw: string): string => raw.trim().toLowerCase();

export function isInviteEmail(raw: string): boolean {
  const e = normalizeInviteEmail(raw);
  return e.length <= 254 && ADDRESS.test(e);
}

/** "Eli <eli@x.edu>" gives "eli@x.edu"; anything else comes back as it was. */
function unwrap(token: string): string {
  const m = /<([^<>]+)>/.exec(token);
  return m ? m[1]! : token.replace(/^[<(]+|[>),.]+$/g, '');
}

/**
 * Splits typed or pasted text into addresses: `valid` are normalised and de-duplicated in the order given, `invalid` are
 * what could not be read as an address (also de-duplicated), so the sheet can flag them.
 */
export function parseInviteEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const token of text.replace(NAMED_CONTACT, (_m, before: string, address: string) => `${before} ${address} `).split(SEPARATORS)) {
    const t = unwrap(token).trim();
    if (!t) continue;
    if (isInviteEmail(t)) {
      const e = normalizeInviteEmail(t);
      if (!valid.includes(e)) valid.push(e);
    } else if (!invalid.includes(t)) {
      invalid.push(t);
    }
  }
  return { valid, invalid };
}
