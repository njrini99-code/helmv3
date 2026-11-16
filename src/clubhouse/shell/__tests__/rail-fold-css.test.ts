/**
 * MOT-11 (production audit 2026-11-15, S4.4): the desktop rail folds on transform and opacity only. The sidebar's
 * column, the brand panel and the word's track take their new size at once, so the canvas is laid out once per fold,
 * not on every frame of it; the words fade and slide over the quick beat, and the circle stays on the seam.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8'));
const RAIL_MEDIA = '(min-width: 821px) and ((min-height: 501px) or (pointer: fine))';
const LAYOUT = /^(width|height|min-width|max-width|margin(-\w+)?|padding(-\w+)?|gap|row-gap|column-gap|grid-template-\w+|inset|top|right|bottom|left|flex-basis)$/;

/** Every rule inside the rail's desktop block, with the properties its transition names. */
function railRules(): { selector: string; props: string[]; value: string }[] {
  const out: { selector: string; props: string[]; value: string }[] = [];
  css.walkAtRules('media', (media) => {
    if (media.params !== RAIL_MEDIA) return;
    media.walkRules((rule: Rule) => {
      rule.walkDecls('transition', (decl) => {
        const props = decl.value.split(/,(?![^(]*\))/).map((part) => part.trim().split(/\s+/)[0]!);
        out.push({ selector: rule.selector.replace(/\s+/g, ' '), props, value: decl.value.replace(/\s+/g, ' ') });
      });
    });
  });
  return out;
}

describe('the desktop rail fold', () => {
  it('moves nothing that lays the page out again: no width, margin, padding, gap or grid column transition', () => {
    const rules = railRules();
    expect(rules.length).toBeGreaterThan(0);
    const layout = rules.flatMap((r) => r.props.filter((p) => LAYOUT.test(p)).map((p) => `${r.selector}: ${p}`));
    expect(layout).toEqual([]);
  });

  it('keeps the circle on the seam: its translate takes the new place with the edge', () => {
    const toggle = railRules().filter((r) => r.selector === '.ch-railtoggle');
    expect(toggle).toHaveLength(1);
    expect(toggle[0]!.props).not.toContain('translate');
  });

  it('fades and slides the words over the quick beat, arriving on the iOS curve and leaving on ease-out', () => {
    const rules = railRules();
    const open = rules.find((r) => r.selector.startsWith('.ch-navitem__label,'));
    const folded = rules.find((r) => r.selector.startsWith(".ch-app[data-ch-rail='folded'] :is(.ch-navitem__label"));
    expect(open?.value).toMatch(/^opacity var\(--ch-dur-quick\) var\(--ch-ease-ios\), transform var\(--ch-dur-quick\) var\(--ch-ease-ios\)/);
    expect(folded?.value).toMatch(/^opacity var\(--ch-dur-quick\) var\(--ch-ease-out\), transform var\(--ch-dur-quick\) var\(--ch-ease-out\)/);
  });
});
