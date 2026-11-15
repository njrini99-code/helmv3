import { computeAccessibleName } from 'dom-accessibility-api';
import { expect } from 'vitest';

/**
 * F-0011 (WCAG 2.5.3 Label in Name, axe `label-content-name-mismatch`): a control's accessible name holds the words
 * on its face, so a voice-control user who says what they see reaches it. Not a test file (no `.test.`).
 *
 * axe applies the rule only to a control named by `aria-label` or `aria-labelledby`, and reads its face the way this
 * does: every text node on screen in order, joined with nothing between them (`<em>S</em><b>8</b>` reads "S8"), text
 * that is `aria-hidden` but drawn included (initials, key caps, a count coin), visually hidden text (`.ch-sr-only`)
 * left out. Both strings are then lowercased with their punctuation and symbols stripped.
 */

// axe-core 4.x: getPunctuationRegExp and getUnicodeNonBmpRegExp, as remove-unicode applies them for this rule (less the two
// combining-mark blocks, U+1DC0-1DFF and U+20D0-20FF, which no Clubhouse label holds).
const PUNCT = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&\u00A3\u00A2\u00A5\u00A7\u20AC()*+,\-./:;<=>?@[\]^_`{|}~\u00B1]/g;
const SYMBOLS =
  /[\u1D00-\u1D7F\u1D80-\u1DBF\u20A0-\u20CF\u2100-\u214F\u2150-\u218F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2400-\u243F\u2440-\u245F\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\uE000-\uF8FF]/g;

const sanitize = (s: string) => s.replace(/\u00A0/g, ' ').replace(/\s{2,}/g, ' ').trim();

/** A string as axe compares it: lowercased, symbols and punctuation out, runs of space collapsed. */
export function curate(s: string): string {
  return sanitize(s.toLowerCase().replace(SYMBOLS, '').replace(PUNCT, ''));
}

/** The words on a control's face, as axe collects them (above). */
export function faceText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? '';
      else if (child instanceof Element) {
        if (child.classList.contains('ch-sr-only') || child.hasAttribute('hidden')) continue;
        if (child.tagName === 'BR') out += ' ';
        else walk(child);
      }
    }
  };
  walk(el);
  return sanitize(out);
}

export const accessibleName = (el: Element) => computeAccessibleName(el);

/**
 * The control's name starts with what it shows.
 * - Named by `aria-label`/`aria-labelledby`: the whole face, as axe reads it, opens the name.
 * - Named by its content: there is no `aria-label` for the face to disagree with, and the name opens with `label`, the
 *   words the control is known by on screen (the content may add words for a screen reader after them).
 */
export function expectLabelInName(el: Element, label?: string): void {
  const name = accessibleName(el);
  if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) {
    const face = curate(faceText(el));
    expect(face, 'a control with an aria-label shows words').not.toBe('');
    expect(curate(name).startsWith(face), `the name "${name}" should start with the face "${faceText(el)}"`).toBe(true);
    if (label != null) expect(face.startsWith(curate(label)), `the face "${faceText(el)}" should start with "${label}"`).toBe(true);
    return;
  }
  expect(label, 'a control named by its content: pass the words it shows').toBeDefined();
  expect(curate(name).startsWith(curate(label!)), `the name "${name}" should start with "${label}"`).toBe(true);
}
