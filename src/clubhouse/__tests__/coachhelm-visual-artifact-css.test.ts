import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CH-13853: the validated visual's styles. A token pass (6a51a084d) once dropped every `.ch-th-va*` rule and the chart
 * rendered as bare buttons with an invisible bar (an inline width on an unstyled span). Every class the component uses
 * has a rule, and the bar is a positioned fill in the gain or loss chart ink on a sized track.
 */
const root = join(__dirname, '..');
const css = readFileSync(join(root, 'styles/coachhelm-thread.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tsx = readFileSync(join(root, 'screens/coachhelm/chat/visual/CoachVisualArtifact.tsx'), 'utf8');

/** The declarations of the rule whose selector list holds exactly `sel`. */
const rule = (sel: string) =>
  [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => m[1]!.split(',').some((s) => s.trim() === sel))?.[2] ?? '';

describe('CH-13853: the visual artifact is styled', () => {
  it('every ch-th-va class the component uses has a rule in coachhelm-thread.css', () => {
    const used = [...new Set([...tsx.matchAll(/\bch-th-va(?:__[a-z]+)?\b/g)].map((m) => m[0]))];
    expect(used).toEqual(expect.arrayContaining(['ch-th-va', 'ch-th-va__bar', 'ch-th-va__track', 'ch-th-va__row', 'ch-th-va__axis']));
    const missing = used.filter((c) => !new RegExp(String.raw`\.${c}(?![\w-])[^{}]*\{`).test(css));
    expect(missing).toEqual([]);
  });

  it('the bar is an absolutely placed fill on a sized, positioned track, gains green and losses amber', () => {
    expect(rule('.ch-th-va__track')).toMatch(/position: relative;/);
    expect(rule('.ch-th-va__track')).toMatch(/height: 16px;/);
    const bar = rule('.ch-th-va__bar');
    expect(bar).toMatch(/position: absolute;/);
    expect(bar).toMatch(/top: 0;/);
    expect(bar).toMatch(/bottom: 0;/);
    expect(rule(".ch-th-va__row[data-sign='gain'] .ch-th-va__bar")).toMatch(/left: 50%;\s*background: var\(--ch-chart-gain\);/);
    expect(rule(".ch-th-va__row[data-sign='loss'] .ch-th-va__bar")).toMatch(/right: 50%;\s*background: var\(--ch-chart-loss\);/);
  });

  it('draws in place: only opacity moves on the bar, on a duration token (no width or transform draw-in)', () => {
    const bar = rule('.ch-th-va__bar');
    expect(bar).toMatch(/transition: opacity var\(--ch-dur-base\) var\(--ch-ease\);/);
    expect(bar).not.toMatch(/width|transform|animation/);
    expect(rule('.ch-th-va__row.is-quiet .ch-th-va__bar')).toMatch(/opacity: 0\.75;/);
  });

  it('the rows are 44px targets on the selected token with the shared focus ring, and the zero line is a hairline', () => {
    expect(rule('.ch-th-va__row')).toMatch(/min-height: 44px;/);
    expect(rule('.ch-th-va__row.is-on')).toMatch(/background: var\(--ch-selected-bg\);/);
    expect(rule('.ch-th-va__row:focus-visible')).toMatch(/outline: 2px solid var\(--ch-border-focus\);/);
    expect(rule('.ch-th-va__axis')).toMatch(/width: var\(--ch-hairline-w\);/);
    expect(rule('.ch-th-va__axis')).toMatch(/background: var\(--ch-ink-rule\);/);
    // The tracks are positioned, so the line needs its own layer to stay unbroken through them, kept inside the chart.
    expect(rule('.ch-th-va__axis')).toMatch(/z-index: 1;/);
    expect(rule('.ch-th-va__chart')).toMatch(/isolation: isolate;/);
  });

  it('keeps every figure on tabular numbers: each value rule sets the font shorthand, which resets the numeric variant', () => {
    for (const sel of ['.ch-th-va__val', '.ch-th-bar__val', '.ch-th-reads__v']) {
      const r = rule(sel);
      expect(r, sel).toMatch(/font: var\(--ch-type-14-strong\);\s*font-variant-numeric: tabular-nums;/);
    }
    // Nothing later in the sheet sets the shorthand on the visual's value again.
    const own = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === '.ch-th-va__val');
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((m) => !/font:/.test(m[2]!))).toBe(true);
  });

  it('wraps a long leg name on a phone instead of clipping it, and stays drawn with forced colours on', () => {
    expect(rule('.ch-th--phone .ch-th-va__label')).toMatch(/white-space: normal;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{[\s\S]*?\.ch-th-va__row\[data-sign\] \.ch-th-va__bar \{\s*background: CanvasText;/);
  });

  it('uses Clubhouse tokens only: every custom property it reads is a --ch-* one', () => {
    const block = css.slice(css.indexOf('.ch-th-va {'));
    const vars = [...block.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!);
    expect(vars.length).toBeGreaterThan(0);
    expect(vars.filter((v) => !v.startsWith('--ch-'))).toEqual([]);
  });
});
