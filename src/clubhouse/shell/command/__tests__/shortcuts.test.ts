// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CH_NAV_COACH, CH_NAV_PLAYER } from '../../nav';
import { CH_NAV_SECTIONS } from '../../nav';
import { digitFor, interpretKey, isInOverlay, isTypingTarget, itemForDigit, itemForLetter, letterFor, modalOpen, navLetters, SEQUENCE_WINDOW_MS, sidebarOrder, type ChKeyInput } from '../shortcuts';

const key = (k: string, extra: Partial<ChKeyInput> = {}): ChKeyInput => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  ...extra,
});
// A browser: Cmd or Ctrl and a digit are its own (tabs). `app` is the iOS app, where they are free (decision 13).
const free = { typing: false, overlay: false, digits: false };
const app = { ...free, digits: true };

describe('the G sequence', () => {
  it('arms on G and goes on the next letter inside the window', () => {
    const a = interpretKey(key('g'), free, null, 1000);
    expect(a.outcome.kind).toBe('arm');
    expect(a.armedAt).toBe(1000);
    const b = interpretKey(key('r'), free, a.armedAt, 1000 + 400);
    expect(b.outcome).toEqual({ kind: 'go', letter: 'r' });
    expect(b.armedAt).toBeNull();
  });

  it('lapses after one second: the late letter is just a key', () => {
    const a = interpretKey(key('g'), free, null, 1000);
    const onTime = interpretKey(key('r'), free, a.armedAt, 1000 + SEQUENCE_WINDOW_MS);
    expect(onTime.outcome.kind).toBe('go');
    const late = interpretKey(key('r'), free, a.armedAt, 1000 + SEQUENCE_WINDOW_MS + 1);
    expect(late.outcome.kind).toBe('none');
  });

  it('a second G after a lapse arms again rather than going', () => {
    const late = interpretKey(key('g'), free, 1000, 1000 + SEQUENCE_WINDOW_MS + 50);
    expect(late.outcome.kind).toBe('arm');
    expect(late.armedAt).toBe(1000 + SEQUENCE_WINDOW_MS + 50);
  });

  it('survives a bare Shift between the keys (a capital) and normalizes case', () => {
    const shift = interpretKey(key('Shift', { shiftKey: true }), free, 500, 600);
    expect(shift.armedAt).toBe(500);
    const caps = interpretKey(key('H', { shiftKey: true }), free, 500, 700);
    expect(caps.outcome).toEqual({ kind: 'go', letter: 'h' });
    expect(interpretKey(key('G', { shiftKey: true }), free, null, 1).outcome.kind).toBe('arm');
  });

  it('ends on any other key, so G, Tab, R does not go', () => {
    const tab = interpretKey(key('Tab'), free, 500, 600);
    expect(tab.armedAt).toBeNull();
    expect(interpretKey(key('r'), free, tab.armedAt, 700).outcome.kind).toBe('none');
  });

  it('does not repeat while held', () => {
    expect(interpretKey(key('g', { repeat: true }), free, null, 10).outcome.kind).toBe('none');
  });
});

describe('suppression', () => {
  it('ignores bare shortcuts typed in a field or a dialog, and ends a pending G', () => {
    for (const k of ['g', '/', '?', 'r']) {
      expect(interpretKey(key(k), { typing: true, overlay: false, digits: false }, null, 1).outcome.kind).toBe('none');
      expect(interpretKey(key(k), { typing: false, overlay: true, digits: false }, null, 1).outcome.kind).toBe('none');
    }
    expect(interpretKey(key('r'), { typing: true, overlay: false, digits: false }, 500, 600).armedAt).toBeNull();
  });

  it('ignores a held modifier and mid-composition keys', () => {
    expect(interpretKey(key('g', { altKey: true }), free, null, 1).outcome.kind).toBe('none');
    expect(interpretKey(key('r', { metaKey: true }), free, 500, 600).outcome.kind).toBe('none');
    expect(interpretKey(key('g', { isComposing: true }), free, null, 1).outcome.kind).toBe('none');
  });

  it('/ and ? are their own shortcuts', () => {
    expect(interpretKey(key('/'), free, null, 1).outcome.kind).toBe('search');
    expect(interpretKey(key('?', { shiftKey: true }), free, null, 1).outcome.kind).toBe('help');
  });

  it('B11 Cmd or Ctrl comma opens Settings, even from a field, but not over a dialog', () => {
    const key = (k: Partial<ChKeyInput>): ChKeyInput => ({ key: ',', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...k });
    expect(interpretKey(key({}), { typing: false, overlay: false, digits: false }, null, 0).outcome).toEqual({ kind: 'settings' });
    expect(interpretKey(key({ metaKey: false, ctrlKey: true }), { typing: true, overlay: false, digits: false }, null, 0).outcome).toEqual({ kind: 'settings' });
    expect(interpretKey(key({}), { typing: false, overlay: true, digits: false }, null, 0).outcome).toEqual({ kind: 'none' });
    expect(interpretKey(key({ metaKey: false }), { typing: false, overlay: false, digits: false }, null, 0).outcome).toEqual({ kind: 'none' });
  });

  it('Cmd or Ctrl K opens the palette even from a field, but not over another dialog', () => {
    expect(interpretKey(key('k', { metaKey: true }), { typing: true, overlay: false, digits: false }, null, 1).outcome.kind).toBe('palette');
    expect(interpretKey(key('K', { ctrlKey: true }), free, null, 1).outcome.kind).toBe('palette');
    expect(interpretKey(key('k', { metaKey: true }), { typing: true, overlay: true, digits: false }, null, 1).outcome.kind).toBe('none');
    expect(interpretKey(key('k', { metaKey: true, shiftKey: true }), free, null, 1).outcome.kind).toBe('none');
  });

  it('knows a field, a native dialog and a menu from the page', () => {
    document.body.innerHTML = `
      <input id="i"><textarea id="t"></textarea><div id="ce" contenteditable="true"><b id="in">x</b></div>
      <div id="off" contenteditable="false"><b id="offin">x</b></div>
      <dialog id="d" open><button id="db">b</button></dialog><div role="menu"><button id="mb">m</button></div>
      <button id="plain">p</button>`;
    const $ = (id: string) => document.getElementById(id);
    expect(isTypingTarget($('i'))).toBe(true);
    expect(isTypingTarget($('t'))).toBe(true);
    expect(isTypingTarget($('in'))).toBe(true);
    expect(isTypingTarget($('offin'))).toBe(false);
    expect(isTypingTarget($('plain'))).toBe(false);
    expect(isTypingTarget(document)).toBe(false);
    expect(isInOverlay($('db'))).toBe(true);
    expect(isInOverlay($('mb'))).toBe(true);
    expect(isInOverlay($('plain'))).toBe(false);
    expect(modalOpen(document)).toBe(true);
    expect(modalOpen(document, $('d'))).toBe(false);
  });
});

describe('the letter map', () => {
  it('gives each section of each role one letter, never repeated', () => {
    for (const role of ['coach', 'player'] as const) {
      const letters = navLetters(role);
      const nav = role === 'coach' ? CH_NAV_COACH : CH_NAV_PLAYER;
      expect(letters.length).toBe(nav.length + 1);
      expect(new Set(letters.map((l) => l.letter)).size).toBe(letters.length);
      for (const i of nav) expect(letterFor(role, i.id), i.id).toBeTruthy();
    }
  });

  it('keeps the owner\'s letters', () => {
    const want: Record<string, string> = { home: 'h', roster: 'r', stats: 's', calendar: 'c', messages: 'm', qualifiers: 'q', hub: 't' };
    for (const [id, letter] of Object.entries(want)) {
      expect(letterFor('coach', id)).toBe(letter);
      expect(letterFor('player', id)).toBe(letter);
    }
    expect(letterFor('player', 'rounds')).toBe('o');
    expect(letterFor('coach', 'rounds')).toBe('o');
    expect(letterFor('player', 'classes')).toBe('l');
  });

  it('reaches a section only the role has', () => {
    expect(itemForLetter('player', 'o')?.id).toBe('rounds');
    expect(itemForLetter('coach', 'o')?.id).toBe('rounds');
    expect(itemForLetter('coach', 'l')).toBeUndefined();
    expect(itemForLetter('coach', 'R')?.id).toBe('roster');
  });
});

describe('Cmd or Ctrl and 1 to 9 (owner, decision 13)', () => {
  it('is left to the browser (its tabs): nothing is bound there, and Cmd N is unbound in the app and the browser', () => {
    for (const d of ['1', '5', '9']) {
      expect(interpretKey(key(d, { metaKey: true }), free, null, 0).outcome.kind).toBe('none');
      expect(interpretKey(key(d, { ctrlKey: true }), free, null, 0).outcome.kind).toBe('none');
    }
    for (const ctx of [free, app]) {
      expect(interpretKey(key('n', { metaKey: true }), ctx, null, 0).outcome.kind).toBe('none');
      expect(interpretKey(key('n', { ctrlKey: true }), ctx, null, 0).outcome.kind).toBe('none');
    }
  });

  it('in the app, reaches a section with either modifier, from a field too, but not over a dialog', () => {
    expect(interpretKey(key('1', { metaKey: true }), app, null, 0).outcome).toEqual({ kind: 'section', digit: 1 });
    expect(interpretKey(key('9', { ctrlKey: true }), app, null, 0).outcome).toEqual({ kind: 'section', digit: 9 });
    expect(interpretKey(key('3', { metaKey: true }), { ...app, typing: true }, null, 0).outcome).toEqual({ kind: 'section', digit: 3 });
    expect(interpretKey(key('3', { metaKey: true }), { ...app, overlay: true }, null, 0).outcome.kind).toBe('none');
  });

  it('is only the bare chord: 0, Shift, Alt, a held key and a plain digit do nothing, and it ends a pending G', () => {
    expect(interpretKey(key('0', { metaKey: true }), app, null, 0).outcome.kind).toBe('none');
    expect(interpretKey(key('!', { metaKey: true, shiftKey: true }), app, null, 0).outcome.kind).toBe('none');
    expect(interpretKey(key('1', { metaKey: true, shiftKey: true }), app, null, 0).outcome.kind).toBe('none');
    expect(interpretKey(key('1', { metaKey: true, altKey: true }), app, null, 0).outcome.kind).toBe('none');
    expect(interpretKey(key('1', { metaKey: true, repeat: true }), app, null, 0).outcome.kind).toBe('none');
    expect(interpretKey(key('1'), app, null, 0).outcome.kind).toBe('none');
    const fromArmed = interpretKey(key('2', { metaKey: true }), app, 100, 200);
    expect(fromArmed.outcome).toEqual({ kind: 'section', digit: 2 });
    expect(fromArmed.armedAt).toBeNull();
  });

  it('follows the sidebar: its groups in order, each group\'s sections in order, never Settings', () => {
    for (const nav of [CH_NAV_COACH, CH_NAV_PLAYER]) {
      const role = nav === CH_NAV_COACH ? 'coach' : 'player';
      const grouped = CH_NAV_SECTIONS.flatMap((section) => nav.filter((i) => i.section === section)).map((i) => i.id);
      expect(sidebarOrder(role).map((i) => i.id)).toEqual(grouped);
      expect(sidebarOrder(role).map((i) => i.id)).not.toContain('settings');
    }
  });

  it('numbers a coach\'s and a player\'s first nine sections; the tenth has only its letter', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => itemForDigit('coach', d)?.id)).toEqual([
      'home', 'coachhelm', 'calendar', 'messages', 'hub', 'roster', 'stats', 'rounds', 'qualifiers',
    ]);
    expect(digitFor('coach', 'recruiting')).toBeUndefined();
    expect(letterFor('coach', 'recruiting')).toBe('e');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => itemForDigit('player', d)?.id)).toEqual([
      'home', 'coachhelm', 'calendar', 'messages', 'hub', 'roster', 'qualifiers', 'rounds', 'stats',
    ]);
    expect(digitFor('player', 'classes')).toBeUndefined();
    expect(itemForDigit('coach', 0)).toBeUndefined();
    expect(itemForDigit('coach', 10)).toBeUndefined();
    expect(digitFor('coach', 'settings')).toBeUndefined();
  });
});
