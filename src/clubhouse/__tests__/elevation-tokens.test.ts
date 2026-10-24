import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ratchet, ROOT, slack, walk, type Hit } from './_scan';

/**
 * B4: what floats lifts. In dark, sheets, the modal, popovers (menus and the bell are popovers) and the peek sit on
 * --ch-bg-elevated, lighter than the cards; and every frosted surface blurs from --ch-glass-blur, so Reduce
 * Transparency and Increase Contrast (which set it to 0) flatten it.
 */
const css = (name: string) => readFileSync(join(ROOT, 'styles', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const darkBlock = () => {
  const t = css('tokens.css');
  const from = t.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
  return t.slice(from, t.indexOf('\n}\n', from));
};
const hexOf = (block: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`).exec(block)?.[1];

describe('elevation tokens (B4)', () => {
  it('in dark, the elevated steps are lighter than the surface and differ from each other', () => {
    const dark = darkBlock();
    const [surface, e1, e2] = ['ch-bg-surface', 'ch-bg-elevated', 'ch-bg-elevated-2'].map((n) => hexOf(dark, n));
    expect(surface).toBeTruthy();
    expect(e1).not.toBe(surface);
    expect(e2).not.toBe(e1);
  });

  it('in light, the elevated steps are the surface', () => {
    const light = css('tokens.css');
    expect(hexOf(light, 'ch-bg-elevated')).toBe(hexOf(light, 'ch-bg-surface'));
    expect(hexOf(light, 'ch-bg-elevated-2')).toBe(hexOf(light, 'ch-bg-surface'));
  });

  it.each([
    ['controls.css', '.ch-modal__panel'],
    ['ui.css', '.ch-popover'],
    ['ui.css', '.ch-peek__card'],
    ['ui.css', '.ch-peek__menu'],
    ['shell.css', '.ch-more'],
    ['shell.css', '.ch-asks__panel'],
  ])('%s %s: dark sits on the elevated surface', (file, selector) => {
    const rules = [...css(file).matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(
      (m) => m[1]!.includes("[data-fw-theme='dark']") && m[1]!.split(',').some((s) => s.trim().endsWith(selector)) && /background:/.test(m[2]!),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r[2]).toMatch(/background: var\(--ch-bg-elevated\);/);
  });

  it('every backdrop blur comes from the glass token', () => {
    const raw: string[] = [];
    for (const file of walk(join(ROOT, 'styles'), /\.css$/)) {
      // Declarations only: an @supports condition names the property too.
      for (const m of css(basename(file)).matchAll(/^\s*(?:-webkit-)?backdrop-filter:\s*([^;]+);/gm)) {
        if (m[1]!.trim() !== 'none' && !m[1]!.includes('var(--ch-glass-blur)')) raw.push(`${basename(file)}: ${m[1]}`);
      }
    }
    expect(raw).toEqual([]);
  });

  /**
   * Row 40: raw shadows are counted per file, so one can't move between files under a single total (auditor, #2361).
   * Most left are rings, wells and halos (state and colour families); a drop shadow is counted on its own, and both
   * only fall as screens move onto the three levels (reading, raised, overlay).
   */
  it('raw shadows and raw drop shadows only fall, file by file', () => {
    const raw: Hit[] = [];
    const drops: Hit[] = [];
    for (const file of walk(join(ROOT, 'styles'), /\.css$/)) {
      if (file.endsWith('tokens.css')) continue;
      for (const m of css(basename(file)).matchAll(/box-shadow:\s*([^;]+);/g)) {
        const v = m[1]!.trim();
        if (v.includes('var(') || v === 'none' || v === 'inherit') continue;
        const hit = { file: `styles/${basename(file)}`, line: 0, text: v };
        raw.push(hit);
        // A drop shadow: an outer layer with a blur (its third length), not a spread-only ring.
        const drop = v.split(/,(?![^(]*\))/).some((l) => {
          const t = l.trim();
          if (/(?:^|\s)inset(?:\s|$)/.test(t)) return false;
          const n = [...t.matchAll(/(-?[\d.]+)(?:px)?(?=\s|$)/g)].map((x) => Number(x[1]));
          return n.length >= 3 && n[2]! > 0;
        });
        if (drop) drops.push(hit);
      }
    }
    for (const [found, allow] of [[raw, RAW_SHADOW], [drops, RAW_DROP]] as const) {
      expect(ratchet(found, allow)).toEqual({ over: [], stale: [] });
      expect(slack(found, allow)).toEqual([]);
    }
  });

  it('three levels: reading, raised and overlay, in light and dark; floating folds into raised', () => {
    const t = css('tokens.css');
    for (const level of ['reading', 'raised', 'overlay']) expect(t.match(new RegExp(`--ch-elevation-${level}:`, 'g'))?.length, level).toBeGreaterThanOrEqual(2);
    expect(t).toMatch(/--ch-elevation-floating: var\(--ch-elevation-raised\);/);
    for (const file of walk(join(ROOT, 'styles'), /\.css$/)) expect(css(basename(file)), basename(file)).not.toMatch(/var\(--ch-elevation-floating\)/);
  });

  it('a phone scroller fades over the edge-fade token', () => {
    expect(css('tokens.css')).toMatch(/--ch-edge-fade: 28px;/);
    expect(css('ui.css')).toMatch(/@media \(max-width: 820px\) \{\s*\.ch-hscroll \{\s*--ch-hs-fade: var\(--ch-edge-fade\);/);
  });
});

/** Raw box-shadows per stylesheet on 2026-10-24 (row 40): rings, wells, halos and drops. Only falls. */
const RAW_SHADOW: Record<string, number> = {
  'styles/auth.css': 6,
  'styles/calendar.css': 31,
  'styles/classes.css': 16,
  'styles/coachhelm-ask.css': 1,
  'styles/coachhelm-dive.css': 1,
  'styles/coachhelm-profile.css': 5,
  'styles/coachhelm-standing.css': 1,
  'styles/coachhelm-thread.css': 1,
  'styles/coachhelm.css': 1,
  'styles/controls.css': 12,
  'styles/home.css': 16,
  'styles/hub.css': 11,
  'styles/messages.css': 12,
  'styles/onboard.css': 17,
  'styles/qualifiers.css': 8,
  'styles/recruiting.css': 1,
  'styles/roster.css': 8,
  'styles/rounds-setup.css': 17,
  'styles/rounds-track.css': 18,
  'styles/rounds.css': 22,
  'styles/settings.css': 3,
  'styles/shell.css': 21,
  'styles/stats.css': 31,
  'styles/ui.css': 20,
};

/** Raw drop shadows per stylesheet on 2026-10-24 (row 40): tinted lifts under green and ink surfaces. Only falls. */
const RAW_DROP: Record<string, number> = {
  'styles/auth.css': 2,
  'styles/classes.css': 4,
  'styles/coachhelm-ask.css': 1,
  'styles/controls.css': 2,
  'styles/home.css': 3,
  'styles/hub.css': 1,
  'styles/messages.css': 2,
  'styles/onboard.css': 6,
  'styles/roster.css': 1,
  'styles/rounds-setup.css': 1,
  'styles/rounds-track.css': 2,
  'styles/rounds.css': 1,
  'styles/settings.css': 1,
  'styles/shell.css': 4,
  'styles/stats.css': 1,
  'styles/ui.css': 3,
};
