import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../../styles/messages-thread.css'), 'utf8');

describe('the phone thread bar (MSG-7)', () => {
  it('the role line shows only while name and role both fit the bar’s 44px row, at any Text Size', () => {
    expect(css).toMatch(/\.ch-msp-thread \.ch-msp-who em\s*\{[^}]*max-height: clamp\(0px, calc\(\(16\.4px - 16 \* var\(--ch-type-k\)\) \* 100000\), 100px\);/);
    expect(css).toMatch(/\.ch-msp-thread \.ch-msp-who\s*\{[^}]*max-height: 44px;[^}]*padding: 1px 4px;/);
    // The arithmetic the switch stands on: a 22 name line, 1 between, an 18 role line and 1 above and below, each
    // times the Text Size, in a row the shell fixes at 44.
    const fits = (k: number) => 22 * k + 1 + 18 * k + 2 <= 44;
    const shown = (k: number) => 16.4 - 16 * k > 0;
    for (const k of [0.824, 0.882, 0.941, 1, 1.02, 1.059, 1.118, 1.235, 1.353]) expect(shown(k), `Text Size ${k}`).toBe(fits(k));
    // With the role gone the name alone still fits at the largest size.
    expect(22 * 1.353 + 2).toBeLessThanOrEqual(44);
  });

  it('the push’s focus box draws no ring of its own; the key inside keeps the keyboard’s', () => {
    expect(css).toMatch(/\.ch-msp-thread \.ch-msp-whobox:focus\s*\{\s*outline: none;\s*\}/);
    expect(css).not.toMatch(/\.ch-msp-who:focus(-visible)?\s*\{[^}]*outline: none/);
  });
});
