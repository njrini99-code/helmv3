import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { FLAG_REGISTRY } from '@/lib/flags/registry.generated';

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
  it('is off in every environment', () => {
    const flag = FLAG_REGISTRY.find((f) => f.feature_id === 'clubhouse_refresh_v1');
    expect(flag).toMatchObject({ default: false, environment: { production: false, preview: false, development: false } });
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
