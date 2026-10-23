// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CH_NAV_COACH, CH_NAV_PLAYER } from '../../nav';
import { interpretKey, isInOverlay, isTypingTarget, itemForLetter, letterFor, modalOpen, navLetters, SEQUENCE_WINDOW_MS, type ChKeyInput } from '../shortcuts';

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
const free = { typing: false, overlay: false };

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
      expect(interpretKey(key(k), { typing: true, overlay: false }, null, 1).outcome.kind).toBe('none');
      expect(interpretKey(key(k), { typing: false, overlay: true }, null, 1).outcome.kind).toBe('none');
    }
    expect(interpretKey(key('r'), { typing: true, overlay: false }, 500, 600).armedAt).toBeNull();
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
    expect(interpretKey(key({}), { typing: false, overlay: false }, null, 0).outcome).toEqual({ kind: 'settings' });
    expect(interpretKey(key({ metaKey: false, ctrlKey: true }), { typing: true, overlay: false }, null, 0).outcome).toEqual({ kind: 'settings' });
    expect(interpretKey(key({}), { typing: false, overlay: true }, null, 0).outcome).toEqual({ kind: 'none' });
    expect(interpretKey(key({ metaKey: false }), { typing: false, overlay: false }, null, 0).outcome).toEqual({ kind: 'none' });
  });

  it('Cmd or Ctrl K opens the palette even from a field, but not over another dialog', () => {
    expect(interpretKey(key('k', { metaKey: true }), { typing: true, overlay: false }, null, 1).outcome.kind).toBe('palette');
    expect(interpretKey(key('K', { ctrlKey: true }), free, null, 1).outcome.kind).toBe('palette');
    expect(interpretKey(key('k', { metaKey: true }), { typing: true, overlay: true }, null, 1).outcome.kind).toBe('none');
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
