import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Overnight polish (2026-10-15): at night --ch-ivory-* and --ch-green-800/900 are surface colours, so ink taken from
 * them went dark on dark wherever the fill or the page under it is dark at night (Roster's Active filter, Messages'
 * selected thread, Round's figures, the Stats tape). Ink on a green fill takes --ch-on-fill-*, forest ink on the page
 * or a pale tint takes --ch-forest-*. These rules keep the palette step on purpose: their fill stays light at night,
 * or the rule is the night's own.
 */
const dir = join(__dirname, '../styles');
const rules = readdirSync(dir)
  .filter((f) => f.endsWith('.css') && f !== 'tokens.css' && f !== 'auth.css')
  .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ f, sel: m[1]!.trim().split('\n').pop()!.trim(), body: m[2]! })));
const bgOf = (body: string) => /background(?:-color)?:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? '-';

describe('ink that holds at night', () => {
  it('ivory ink sits only where the fill turns light at night, or in a night rule', () => {
    const left = rules.filter((r) => /(?<![-\w])color:\s*(?:color-mix\(in oklab, )?var\(--ch-ivory-(0|25|50|100)\)/.test(r.body)).map((r) => `${r.f} ${r.sel}`);
    expect(left.sort()).toEqual(
      [
        'rounds-track.css .ch-rtcv__n',
        "rounds-track.css .ch-rt-quick button[aria-pressed='true']",
        'rounds.css .ch-rd-pill.is-tournament',
        "stats.css html[data-fw-theme='dark'] .ch-st .ch-sgt",
        "ui.css html[data-fw-theme='dark'] .ch-score--double",
      ].sort(),
    );
  });
  it('forest ink never sits on the page or a tint that goes dark at night', () => {
    const flips = /^(-|var\(--ch-green-(25|50|100)\)|var\(--ch-ivory-\d+\)|var\(--ch-bg-surface\)|var\(--ch-ledger-row-hover\))$/;
    const left = rules
      .filter((r) => /(?<![-\w])color:\s*var\(--ch-green-(800|900)\)/.test(r.body) && flips.test(bgOf(r.body)))
      .filter((r) => !r.sel.includes("data-fw-theme='dark'") && !r.sel.includes('.ch-sgt'))
      .map((r) => `${r.f} ${r.sel}`);
    // The phone strip's current hole sits on its own ivory plate (::before, --ch-on-green-ink).
    expect(left.sort()).toEqual(['rounds-track.css .ch-rt-strip .ch-rt-strip__h.is-cur .ch-score', 'rounds-track.css .ch-rt-strip .ch-rt-strip__h.is-cur em'].sort());
  });
  it('the night keeps both ink families light, and the day keeps the palette values', () => {
    const tokens = readFileSync(join(dir, 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/--ch-on-fill-50: #f9f7f1;[\s\S]*--ch-forest-800: #0b3a25;[\s\S]*--ch-forest-900: #082b1c;/);
    const night = tokens.slice(tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {"));
    expect(night.slice(0, night.indexOf('\n}'))).toMatch(/--ch-on-fill-50: #f3efe6;[\s\S]*--ch-forest-800: #cfe6d7;/);
  });
});
