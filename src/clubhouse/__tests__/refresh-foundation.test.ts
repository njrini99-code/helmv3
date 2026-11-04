import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { FLAG_REGISTRY } from '@/lib/flags/registry.generated';
import { titleOnScroll } from '../shell/large-title';

/** Clubhouse refresh, PR 2 and 3: every rule sits under `[data-ch-refresh='on']`, so with the flag off the app renders as main. */

const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const scopedRules = (f: string) => {
  const rules: { selector: string; props: Record<string, string> }[] = [];
  postcss.parse(css(f)).walkRules((r) => {
    if (!r.selector.includes("[data-ch-refresh='on']")) return;
    const props: Record<string, string> = {};
    r.walkDecls((d) => {
      props[d.prop] = d.value;
    });
    rules.push({ selector: r.selector, props });
  });
  return rules;
};

describe('clubhouse_refresh_v1', () => {
  it('is off in production and development, on in Preview (staging)', () => {
    const flag = FLAG_REGISTRY.find((f) => f.feature_id === 'clubhouse_refresh_v1');
    expect(flag).toMatchObject({ default: false, environment: { production: false, preview: true, development: false } });
  });

  it('the page takes no light or paper under the flag', () => {
    const rules = scopedRules('shell.css').filter((r) => r.selector.includes('.ch-canvas') || r.selector.includes('.ch-app'));
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r.props.background ?? '').not.toMatch(/--ch-light-(canvas|paper)/);
    expect(rules.some((r) => r.props.background === 'var(--ch-grouped-bg)')).toBe(true);
  });

  it('a feature card is flat under the flag', () => {
    const feature = scopedRules('ui.css').filter((r) => r.props['--ch-feature-bg']);
    expect(feature.map((r) => r.props['--ch-feature-bg'])).toEqual(['var(--ch-green-800)', '#123d29']);
  });
});

describe('titleOnScroll', () => {
  it('shrinks to 86% and fades to 10% over the first 56px', () => {
    expect(titleOnScroll(0, false)).toEqual({ scale: 1, opacity: 1 });
    const end = titleOnScroll(56, false);
    expect(end.scale).toBeCloseTo(0.86);
    expect(end.opacity).toBeCloseTo(0.1);
    expect(titleOnScroll(500, false)).toEqual(end);
  });
  it('fades only under Reduce Motion', () => {
    const end = titleOnScroll(56, true);
    expect(end.scale).toBe(1);
    expect(end.opacity).toBeCloseTo(0.1);
  });
  it('holds still on a bounce above the top', () => {
    expect(titleOnScroll(-20, false)).toEqual({ scale: 1, opacity: 1 });
  });
});
