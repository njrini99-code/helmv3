import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Audit L-001 (2026-11-18): a device whose last layout was phone is server-rendered as the phone Settings tree (the
 * ch_phone cookie), and on a desktop-width window that tree painted unstyled until hydration replaced it, and for good
 * while hydration was stuck. The phone rules are all inside the phone query, so outside it nothing hid the tree.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/settings.css'), 'utf8');
const PHONE = '(max-width: 820px), (max-height: 500px) and (pointer: coarse)';
const flat = (v: string) => v.replace(/\s+/g, ' ').trim();

const rulesFor = (selector: string) => {
  const out: { media: string; rule: Rule }[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.map((s) => s.trim()).includes(selector)) return;
    const parent = rule.parent;
    out.push({ media: parent && parent.type === 'atrule' ? flat((parent as AtRule).params) : '', rule });
  });
  return out;
};
const display = (rule: Rule) => {
  let v: string | undefined;
  rule.walkDecls('display', (d) => void (v = d.value));
  return v;
};

describe('phone Settings tree on a desktop window', () => {
  const rules = rulesFor('.ch-setm');

  it('is hidden by a rule outside any media query', () => {
    const plain = rules.filter((r) => r.media === '');
    expect(plain.map((r) => display(r.rule))).toContain('none');
  });

  it('is shown again only inside the phone query', () => {
    const shown = rules.filter((r) => display(r.rule) === 'block');
    expect(shown.length).toBeGreaterThan(0);
    for (const r of shown) expect(r.media).toBe(PHONE);
  });
});
