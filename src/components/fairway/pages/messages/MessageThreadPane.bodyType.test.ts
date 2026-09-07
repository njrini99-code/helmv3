/**
 * G-29 (typography) — message text is the artboards' 15px, not 13px.
 *
 * `.bub { font-size: 15px; line-height: 22px; … }` is a CLASS RULE, stated
 * identically in `Bubbles.dc.html:17` (the bubble-grammar artboard) and
 * `Thread.dc.html:16`. M03B's F7 asked for 17px `body-lg` instead, sourcing
 * that from §8.3's prose — "approximately 17px". The artboards state a rule and
 * the prose gives an approximation, so the rule wins; this is the same call
 * DECISIONS.md already made for G-50b's width.
 *
 * MEASURED ON BOTH SIDES: the artboard's `font-size` is parsed out of the
 * `.bub` rule and compared against the size the Tailwind token actually
 * resolves to, so the suite fails if either the artboard or the token moves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const bubbles = read('audit/reference/Bubbles.dc.html');
const thread = read('audit/reference/Thread.dc.html');
const config = read('tailwind.config.ts');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/** Block comments removed whole — a JSX comment body reads as ordinary prose. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** The stated `.bub` font-size, in px, from a given artboard. */
function bubFontSize(artboard: string): string | undefined {
  const rule = artboard.split('\n').find((l) => l.trim().startsWith('.bub {'));
  return rule?.match(/font-size:\s*(\d+)px/)?.[1];
}

/** What a `text-<name>` utility actually resolves to in the type scale. */
function tokenSize(name: string): string | undefined {
  const m = config.match(new RegExp(`'${name}':\\s*\\['(\\d+)px'`));
  return m?.[1];
}

describe('G-29 — the bubble type size comes from the artboard rule', () => {
  it('both artboards state the same .bub font-size', () => {
    const a = bubFontSize(bubbles);
    const b = bubFontSize(thread);
    expect(a, 'expected a .bub font-size in Bubbles.dc.html').toBeDefined();
    expect(b, 'expected a .bub font-size in Thread.dc.html').toBeDefined();
    // If these ever diverge, the "it is a rule, not a specimen" basis is gone.
    expect(a).toBe(b);
  });

  it('the token the bubble uses resolves to exactly that size', () => {
    expect(tokenSize('body')).toBe(bubFontSize(bubbles));
    expect(code).toContain('font-fw-sans text-body">');
  });

  it('is no longer the 13px token', () => {
    // Guard the token, not just the class: this fails loudly if `body-sm` is
    // ever redefined to 15px, which would make the swap meaningless.
    expect(tokenSize('body-sm')).not.toBe(bubFontSize(bubbles));
    expect(code).not.toContain('text-body-sm leading-relaxed');
  });

  it('is not the 17px body-lg the prose asked for', () => {
    // Recorded as a test so nobody "fixes" this back toward §8.3's estimate
    // without first noticing that the artboards disagree with it.
    expect(tokenSize('body-lg')).not.toBe(bubFontSize(bubbles));
    expect(code).not.toContain('text-body-lg');
  });

  it('does not stack a leading multiplier on a token that specifies leading', () => {
    const idx = code.indexOf('whitespace-pre-wrap break-words font-fw-sans');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 120)).not.toContain('leading-');
  });

  it('moves the inline edit field with it, so text does not resize on tap', () => {
    const idx = code.indexOf('border-0 bg-transparent p-0 font-fw-sans');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 120)).toContain('text-body ');
  });
});
