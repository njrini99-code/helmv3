import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * Row 50 (B4 / C4): under Reduce Transparency a frosted surface turns solid, not just unblurred. The glass tokens
 * already flatten (tokens.css); these five surfaces hard-code a translucent fill, so each has a solid fallback under both
 * the media query and html[data-reduce-transparency] (iOS WebKit has no media query; the app's bridge sets it). Home's
 * today key left the list on 15 Nov 2026: it is the opaque ivory card now, with no blur (MOT-16), so it has nothing to flatten.
 */
const read = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('Reduce Transparency makes the hard-coded frosted surfaces solid (row 50)', () => {
  it.each([
    ['rounds-setup.css', '.ch-rsu-dock', 'var(--ch-bg-surface)'],
    ['rounds-track.css', '.ch-rt-bar', 'var(--ch-bg-surface)'],
    ['rounds-track.css', '.ch-rtcv__glass', 'var(--ch-green-900)'],
    ['rounds-track.css', '.ch-rtcv__back', 'var(--ch-green-900)'],
    ['onboard.css', '.ch-ox-lock', 'var(--ch-bg-surface)'],
    ['onboard.css', '.ch-ox-rail', 'var(--ch-bg-surface)'],
  ])('%s %s, by the media query and by the attribute', (file, sel, solid) => {
    const css = read(file);
    const media = new RegExp(String.raw`@media \(prefers-reduced-transparency: reduce\) \{[^@]*?${esc(sel)}[^{}]*\{\s*background: ${esc(solid)};`);
    const attr = new RegExp(String.raw`:root\[data-reduce-transparency\] ${esc(sel)}[^{}]*\{\s*background: ${esc(solid)};`);
    expect(css).toMatch(media);
    expect(css).toMatch(attr);
  });

  it("Home's today key is opaque, with no blur to flatten (MOT-16)", () => {
    const rule = read('home.css').match(/\.ch-h-day--today \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('background: var(--ch-card-bg);');
    expect(rule).not.toMatch(/backdrop-filter/);
  });
});
