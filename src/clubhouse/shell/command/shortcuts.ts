import { CH_SETTINGS_ITEM, navFor, type ChNavItem, type ChRole } from '../nav';

/** After G, the next key must land within this long, or it is just a key (the sequence lapses). */
export const SEQUENCE_WINDOW_MS = 1000;

/** A field that takes typing: a shortcut typed there is text. */
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]';
/** Anything layered over the page: a native dialog (it has no role attribute), a menu or a listbox. */
const OVERLAY = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Keys the document or window dispatches to have no `closest`. */
const el = (t: EventTarget | null): Element | null => (t instanceof Element ? t : null);

/** The key was typed into a field. */
export function isTypingTarget(t: EventTarget | null): boolean {
  return !!el(t)?.closest(TYPING);
}

/** The key was typed inside a dialog, menu or listbox. */
export function isInOverlay(t: EventTarget | null): boolean {
  return !!el(t)?.closest(OVERLAY);
}

/**
 * A modal dialog is open somewhere. The page behind it is inert, so a shortcut aimed at the page must not fire even when
 * focus is on `<body>` (a dialog just closed, or never took focus). `except` is the palette's own dialog.
 */
export function modalOpen(doc: Document, except?: Element | null): boolean {
  return Array.from(doc.querySelectorAll('dialog[open]')).some((d) => d !== except);
}

/**
 * G then a letter goes to a section (Linear's `G` `I`). The preferred letters are the owner's (the brief): Home, Roster, Stats,
 * Calendar, Messages, Qualifiers, Team hub, rOunds, cLasses; CoachHelm takes A (ask) and Recruiting E. A section added to
 * nav.ts later takes the first free letter of its name, so the map cannot clash and no section is left without one.
 */
const PREFERRED: Readonly<Record<string, string>> = {
  home: 'h',
  roster: 'r',
  stats: 's',
  calendar: 'c',
  messages: 'm',
  qualifiers: 'q',
  hub: 't',
  rounds: 'o',
  classes: 'l',
  coachhelm: 'a',
  recruiting: 'e',
  settings: ',',
};

export interface ChLetter {
  letter: string;
  item: ChNavItem;
}

/** The G-sequence letters for a role, one per sidebar section and Settings, none repeated. */
export function navLetters(role: ChRole): ChLetter[] {
  const items = [...navFor(role), CH_SETTINGS_ITEM];
  const taken = new Set<string>();
  const out = new Map<string, string>();
  // The owner's letters first, so a new section can never take one of them.
  for (const i of items) {
    const want = PREFERRED[i.id];
    if (want && !taken.has(want)) {
      taken.add(want);
      out.set(i.id, want);
    }
  }
  for (const i of items) {
    if (out.has(i.id)) continue;
    const free = [...i.label.toLowerCase().replace(/[^a-z]/g, ''), ...'abcdefghijklmnopqrstuvwxyz'].find((c) => !taken.has(c));
    if (free) {
      taken.add(free);
      out.set(i.id, free);
    }
  }
  return items.flatMap((item) => {
    const letter = out.get(item.id);
    return letter ? [{ letter, item }] : [];
  });
}

/** The letter that reaches a section for this role, if it has one. */
export function letterFor(role: ChRole, id: string): string | undefined {
  return navLetters(role).find((l) => l.item.id === id)?.letter;
}

/** The section a letter reaches after G. */
export function itemForLetter(role: ChRole, letter: string): ChNavItem | undefined {
  return navLetters(role).find((l) => l.letter === letter.toLowerCase())?.item;
}

export interface ChKeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}

export interface ChKeyContext {
  /** The key went to a field that takes typing. */
  typing: boolean;
  /** The key went into a dialog, menu or listbox, or a modal is open (anything but the palette). */
  overlay: boolean;
}

export type ChKeyOutcome =
  | { kind: 'none' }
  /** G was pressed: the next key, within the window, picks the section. */
  | { kind: 'arm' }
  | { kind: 'go'; letter: string }
  | { kind: 'palette' }
  /** Cmd or Ctrl and comma: Settings, as in every Mac app (B11). */
  | { kind: 'settings' }
  | { kind: 'search' }
  | { kind: 'help' };

/**
 * What a key does, given whether G is armed. Pure, so the timing and the suppression are tested without a DOM: `armedAt`
 * is when G was pressed (null when it was not), `now` the key's time, and the result says what to do and the new `armedAt`.
 *
 * Cmd or Ctrl with K opens the palette, and with a comma Settings, even from a field, but not over another dialog. Every
 * other shortcut is a bare key: typed into a field or a dialog, with a modifier held, held down (repeat) or mid-composition
 * (an IME), it is just a key, and it also ends a pending G.
 */
export function interpretKey(k: ChKeyInput, ctx: ChKeyContext, armedAt: number | null, now: number): { outcome: ChKeyOutcome; armedAt: number | null } {
  const none = { outcome: { kind: 'none' } as const, armedAt: null };
  if (k.isComposing || k.key === 'Process') return none;
  // Shift or Caps Lock alone is only a way to type a capital: it does not end a pending G.
  if (k.key === 'Shift' || k.key === 'CapsLock') return { outcome: { kind: 'none' }, armedAt };
  if ((k.metaKey || k.ctrlKey) && !k.altKey && !k.shiftKey && k.key.toLowerCase() === 'k') {
    return ctx.overlay ? none : { outcome: { kind: 'palette' }, armedAt: null };
  }
  if ((k.metaKey || k.ctrlKey) && !k.altKey && !k.shiftKey && k.key === ',') {
    return ctx.overlay ? none : { outcome: { kind: 'settings' }, armedAt: null };
  }
  if (k.metaKey || k.ctrlKey || k.altKey) return none;
  if (ctx.typing || ctx.overlay) return none;
  if (k.repeat) return { outcome: { kind: 'none' }, armedAt };
  if (armedAt !== null && now - armedAt <= SEQUENCE_WINDOW_MS && k.key.length === 1) {
    // The second key of the sequence. A letter that reaches nothing just ends it.
    return { outcome: { kind: 'go', letter: k.key.toLowerCase() }, armedAt: null };
  }
  if (k.key.toLowerCase() === 'g') return { outcome: { kind: 'arm' }, armedAt: now };
  if (k.key === '/' && !k.shiftKey) return { outcome: { kind: 'search' }, armedAt: null };
  if (k.key === '?') return { outcome: { kind: 'help' }, armedAt: null };
  return none;
}

/** True on Apple platforms: the shortcut is drawn with the Command key there and Ctrl elsewhere. */
export function isApple(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined): boolean {
  return !!nav && /Mac|iPhone|iPad|iPod/i.test(nav.platform || nav.userAgent || '');
}

/** The palette's own chord, as it is drawn. */
export const modKey = (apple: boolean): string => (apple ? '⌘' : 'Ctrl');

/**
 * The page's search box, for `/`: the first search field on the canvas that is on screen. A page with none returns null, so
 * `/` stays an ordinary key there.
 */
export function pageSearchField(root: ParentNode): HTMLInputElement | null {
  const fields = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="search"], input[role="searchbox"]'));
  return (
    fields.find((f) => !f.disabled && !f.closest('[hidden], [inert], dialog:not([open])') && (f.getClientRects().length > 0 || f.offsetParent !== null)) ?? null
  );
}
