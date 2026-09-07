/**
 * G-48 — the bubble was drawn one radius step too round.
 *
 * The finding as first written (M03B F12) said the artboard's bubble radii
 * match no `--fw-radius-*` token, citing the ramp as sm/md/lg = 10/14/28px.
 * That reading skips `--fw-radius-card`. Measured from both primary sources
 * instead of from either summary, the artboard's dominant bubble radius is
 * byte-identical to `--fw-radius-card`, whose own comment calls it "THE card
 * radius" — so this was a token MISUSE, not a missing token, and the fix is a
 * class swap rather than a new scale.
 *
 * The measurement is the test. Reading the token value out of
 * `design-tokens.css` and the radius out of `reference/Bubbles.dc.html` — and
 * comparing them here — means this suite fails if EITHER side moves: if the
 * ramp is retuned, or if a new artboard lands with a different bubble. A test
 * that hardcoded "20px" would have kept passing through both.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const tokens = read('src/styles/design-tokens.css');
const artboard = read('audit/reference/Bubbles.dc.html');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/** Comment-stripped, so this file's own prose cannot satisfy a source check. */
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

function tokenValue(name: string): string {
  const m = tokens.match(new RegExp(`--fw-radius-${name}:\\s*([^;]+);`));
  const captured = m?.[1];
  expect(captured, `expected --fw-radius-${name} in design-tokens.css`).toBeTypeOf('string');
  const first = String(captured).trim().split(/\s+/)[0];
  expect(first, `expected a value for --fw-radius-${name}`).toBeTruthy();
  return String(first);
}

/** The most common corner value across every bubble shorthand in the artboard. */
function dominantArtboardRadius(): string {
  const counts = new Map<string, number>();
  for (const decl of artboard.match(/border-radius:\s*[^;"]+/g) ?? []) {
    const value = decl.replace(/border-radius:\s*/, '').trim();
    if (value === '9999px') continue; // pill axis — avatars, not bubbles
    for (const corner of value.split(/\s+/)) {
      counts.set(corner, (counts.get(corner) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  expect(top, 'expected border-radius declarations in the artboard').toBeDefined();
  return (top as [string, number])[0];
}

describe('G-48 — the bubble radius token, measured on both sides', () => {
  it('the artboard\'s dominant bubble corner IS --fw-radius-card', () => {
    expect(dominantArtboardRadius()).toBe(tokenValue('card'));
  });

  it('and is NOT --fw-radius-lg, the step the code used to reach for', () => {
    // 28px vs 20px. If these ever coincide the swap below is meaningless, so
    // the distinction is asserted rather than assumed.
    expect(tokenValue('lg')).not.toBe(tokenValue('card'));
    expect(dominantArtboardRadius()).not.toBe(tokenValue('lg'));
  });
});

describe('G-48 — the thread pane draws bubbles at that token', () => {
  it('uses rounded-card at every bubble corner case', () => {
    for (const variant of [
      "isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-card rounded-br-sm' : 'rounded-card rounded-bl-sm')",
      "isFirstInGroup && !isLastInGroup && 'rounded-card'",
      "!isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-card rounded-tr-md rounded-br-sm' : 'rounded-card rounded-tl-md rounded-bl-sm')",
    ]) {
      expect(code).toContain(variant);
    }
  });

  it('no longer reaches for the sheet/modal step anywhere in the pane', () => {
    expect(code).not.toContain('rounded-fw-lg');
  });

  it('carries the typing indicator and the edit box with it', () => {
    // Both are bubble-shaped and sit in the same column: the typing indicator
    // copies the incoming-bubble shorthand, and the edit box replaces a bubble
    // in place. Leaving either at 28px would have made the swap visible as an
    // inconsistency rather than a correction.
    expect(code).toContain('inline-flex rounded-card rounded-bl-sm px-4 py-3');
    expect(code).toContain('w-full rounded-card border border-accent-200');
  });

  it('leaves the small corners alone — they are a separate, unresolved question', () => {
    // The tail (0.375rem/6px) and the grouped inner corners (0.75rem/12px) fall
    // below --fw-radius-sm (10px), so the fw ramp has no step for either. The
    // manifest routes exactly those two values to A03 as variant requests;
    // inventing them here would be forking a shared primitive, which §19.3
    // forbids. `rounded-br-sm` / `rounded-tr-md` therefore stay as they are.
    expect(code).toContain('rounded-br-sm');
    expect(code).toContain('rounded-tr-md');
    expect(tokenValue('sm')).toBe('0.625rem');
  });
});
