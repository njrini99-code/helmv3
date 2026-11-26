import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { incompleteLine, listWords } from '../states';

const ROOT = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === '__shots__' ? [] : sources(p);
    return /\.(tsx?|css)$/.test(name) && name !== 'states.tsx' ? [p] : [];
  });
}

/** Old ways of saying "this read failed or came back partial". The one vocabulary lives in _ui/states.tsx. */
const BANNED: ReadonlyArray<[RegExp, string]> = [
  [/Incomplete this load/i, 'use <Incomplete> ("Part of this page could not be read")'],
  [/nothing here is all clear|means all clear|is not all clear/i, 'say NOT_ALL_CLEAR ("Nothing here is an all clear.")'],
  [/understate what happened/i, 'use <Incomplete> (the numbers "may be low")'],
  [/Health unread|Role not read|History unreadable/i, 'say "could not be read" / "not read" / "unknown" as states.tsx sets out'],
  [/not readable yet/i, 'use <SignalNotThere> ("… is not there yet")'],
  [/Something went wrong|Unknown error|\bN\/A\b|failed to load/i, 'name what failed: "<What> could not be read."'],
];

describe('one vocabulary for failed and partial reads across the Bridge spaces', () => {
  const files = sources(ROOT);
  it('finds the space sources', () => {
    expect(files.length).toBeGreaterThan(15);
  });
  it.each(BANNED)('no file says %s', (re, fix) => {
    const hits = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${relative(ROOT, f)}:${i + 1}` }))
        .filter(({ line }) => re.test(line))
        .map(({ at }) => `${at} — ${fix}`),
    );
    expect(hits).toEqual([]);
  });
});

describe('listWords and incompleteLine', () => {
  it('joins like a sentence', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['golf roster'])).toBe('golf roster');
    expect(listWords(['golf roster', 'golf staff', 'events'])).toBe('golf roster, golf staff and events');
  });
  it('is empty when nothing failed, and never claims a zero', () => {
    expect(incompleteLine([])).toBe('');
    expect(incompleteLine(['golf roster', 'events'])).toBe('Incomplete: golf roster and events could not be read, so the numbers may be low.');
  });
});
