import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenHex, tokenValue, type Theme } from './_tokens';

/**
 * The polish audit's contrast sweep (L-008, L-010, L-012, L-023, L-058, L-060, L-052): each fix is a token pair, so a
 * later edit to a token cannot quietly bring the defect back. WCAG 2 ratios from the tokens as written; 4.5 for text, 3
 * for non-text marks.
 */
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const t = (name: string, theme: Theme) => tokenHex(name, theme);
const themes: Theme[] = ['light', 'dark'];
const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');

describe('polish W1 token pairs', () => {
  it('L-010: initials on the flat chart coin hold 4.5:1 in both themes', () => {
    for (const th of themes) expect(ratio(t('ch-chart-flat-ink', th), t('ch-chart-flat', th)), th).toBeGreaterThanOrEqual(4.5);
  });

  it('L-012: the link ink holds 4.5:1 on the page and the card, and the stats link uses it', () => {
    for (const th of themes) {
      expect(ratio(t('ch-accent-ink', th), t('ch-bg-surface', th)), th).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t('ch-accent-ink', th), t('ch-bg-page', th)), th).toBeGreaterThanOrEqual(4.5);
    }
    expect(css('stat-terms.css')).toMatch(/\.ch-root \.ch-howc-link \{[^}]*color: var\(--ch-accent-ink\)/);
  });

  it('L-023: the warning ink holds 4.5:1 on the page, the card and the sheet parchment', () => {
    for (const th of themes) {
      expect(ratio(t('ch-warning-600', th), t('ch-bg-page', th)), th).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t('ch-warning-600', th), t('ch-bg-surface', th)), th).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(t('ch-warning-600', 'light'), '#e3dfd5')).toBeGreaterThanOrEqual(4.5);
  });

  it('L-058: the disabled send key reads (tertiary ink on its muted fill) in both themes', () => {
    for (const th of themes) expect(ratio(t('ch-text-tertiary', th), t('ch-skel-base', th)), th).toBeGreaterThanOrEqual(4.5);
    const ask = css('coachhelm-ask.css');
    expect(ask.match(/^\.ch-ask-cmp__send:disabled \{/gm)).toHaveLength(1);
    expect(ask).toMatch(/\.ch-ask-cmp__send:disabled \{[^}]*background: var\(--ch-skel-base\)/);
  });

  it('L-008: an unchecked box, an unplayed dot and an over-par pip are marks at 3:1 on the card, in both themes', () => {
    for (const th of themes) {
      expect(ratio(t('ch-border-control', th), t('ch-bg-surface', th)), `control ${th}`).toBeGreaterThanOrEqual(3);
      expect(ratio(t('ch-ink-400', th), t('ch-bg-surface', th)), `ink-400 ${th}`).toBeGreaterThanOrEqual(3);
    }
    expect(css('hub.css')).toMatch(/\.ch-hb-check \{[^}]*box-shadow: inset 0 0 0 1\.5px var\(--ch-border-control\)/);
    expect(css('qualifiers.css')).toMatch(/\.ch-qf-dots i \{[^}]*var\(--ch-border-control\)/);
  });

  it('L-060, L-008: the chart gain ink is a 3:1 mark on the card in both themes (Compare B badge, legend dots)', () => {
    for (const th of themes) expect(ratio(t('ch-chart-gain', th), t('ch-bg-surface', th)), th).toBeGreaterThanOrEqual(3);
  });

  it('L-025: Round Review figures take the night gradient', () => {
    expect(css('rounds.css')).toMatch(/html\[data-fw-theme='dark'\]\) \.ch-rv \.ch-rzpair b \{[^}]*var\(--ch-green-700\)/);
  });

  it('L-052: two scrim levels, the deep one never lighter than the base, and no overlay hard-codes its own dim', () => {
    const alpha = (v: string | undefined) => Number(v?.match(/\/\s*([\d.]+)\s*\)/)?.[1]);
    for (const th of themes) expect(alpha(tokenValue('ch-scrim-deep', th))).toBeGreaterThan(alpha(tokenValue('ch-scrim', th)));
    expect(css('ui.css')).not.toMatch(/\.ch-peek::backdrop \{[^}]*background: rgb\(/);
    expect(css('controls.css')).not.toMatch(/\.ch-modal::backdrop \{[^}]*background: rgb\(/);
    expect(css('rounds-track.css')).not.toMatch(/\.ch-rtcv-d::backdrop \{[^}]*background: rgb\(/);
  });

  it('L-040: the off-fairway shot disc holds 4.5:1 under an ivory numeral, day and night', () => {
    const track = css('rounds-track.css');
    const discs = [...track.matchAll(/i\.is-rough,[^{]*\{\s*background: (#[0-9a-f]{6})/g)].map((m) => m[1]!);
    expect(discs.length).toBe(2);
    for (const d of discs) expect(ratio(t('ch-ivory-0', 'light'), d)).toBeGreaterThanOrEqual(4.5);
  });

  it('RC-2: a field with no placeholder rule of its own gets the placeholder ink', () => {
    expect(css('base.css')).toMatch(/:where\(\[data-ui='clubhouse'\]\) :is\(input, textarea\)::placeholder \{[^}]*var\(--ch-text-placeholder\)/);
  });
});
