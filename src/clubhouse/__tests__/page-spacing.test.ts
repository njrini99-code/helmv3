import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * CONS-34: page spacing per meaning. Each page root below takes its padding and gap only from the page spacing tokens
 * (`var(--ch-page-*)`, `var(--ch-gap-*)`, or 0), so a page's edge and rhythm change in tokens.css, not screen by screen.
 * The roots are listed explicitly (file, the at-rule they sit in, the selector); a listed rule that is missing fails, so
 * a rename cannot pass by matching nothing. The state twins (skeleton, busy, first run, no team) sit with their roots so
 * nothing moves when the live page arrives.
 *
 * Not listed yet (R7 section 13, CONS-34 handoff): the phone Stats root `.ch-stm` (two rules in one media, the team
 * view's own 18 16 40), the phone setup root `.ch-rsu` (the owner's "one 20px gutter" pass, and an earlier rule it
 * overrides), the phone Home (`.ch-h-main` at 28 16 48 and the four `.ch-hm-body` rules), the top-level `.is-phone`
 * rules, and the container-query and print rules.
 */
const DESK = '';
const PHONE = '@media (max-width: 820px)';
const WIDE = '@media (min-width: 821px)';

const ROOTS: [file: string, context: string, selector: string][] = [
  // Desktop page tops
  ['calendar.css', DESK, '.ch-cal'],
  ['settings.css', DESK, '.ch-set'],
  ['classes.css', DESK, '.ch-cl'],
  ['classes.css', WIDE, '.ch-cl[data-canopy]'],
  ['stats.css', DESK, '.ch-st'],
  ['coachhelm.css', DESK, '.ch-hl'],
  ['coachhelm.css', DESK, '.ch-hl[data-canopy]'],
  ['home.css', DESK, '.ch-h-main'],
  ['home.css', DESK, '.ch-h-main--desk'],
  ['home.css', DESK, '.ch-h-main--desk[data-canopy]'],
  ['home.css', WIDE, ".ch-h-main[aria-busy='true'][data-canopy]"],
  ['home.css', WIDE, '.ch-h-main--first[data-canopy]'],
  ['rounds-recover.css', DESK, '.ch-rcv'],
  ['rounds-setup.css', DESK, '.ch-rsu'],
  // Phone page roots
  ['calendar.css', PHONE, '.ch-calm'],
  ['calendar.css', PHONE, '.ch-cal--page'],
  ['calendar.css', PHONE, '.ch-cal--skel'],
  ['hub.css', PHONE, '.ch-hb'],
  ['qualifiers.css', PHONE, '.ch-qf'],
  ['qualifiers.css', PHONE, '.ch-qfm'],
  ['recruiting.css', PHONE, '.ch-recm'],
  ['recruiting.css', PHONE, ".ch-rec[aria-busy='true'], .ch-rec-none"],
  ['roster.css', PHONE, '.ch-rsm'],
  ['roster.css', PHONE, ".ch-rs[aria-busy='true'], .ch-rs-none"],
  ['settings.css', PHONE, '.ch-setm'],
  ['settings.css', PHONE, ".ch-set[aria-busy='true']"],
  ['classes.css', PHONE, '.ch-cl.is-phone'],
  ['classes.css', PHONE, '.ch-cl.is-noteam'],
  ['classes.css', PHONE, ".ch-cl[data-ch-code='CH-12401']"],
  ['coachhelm.css', PHONE, '.ch-hl.is-phone'],
  ['rounds.css', PHONE, '.ch-rd.is-phone'],
  ['rounds.css', PHONE, '.ch-rv.is-phone'],
  ['rounds.css', PHONE, ".ch-rd[data-ch-code='CH-11401'], .ch-rv[data-ch-code='CH-11406']"],
];

/** Today's values (R7 section 13). Changing one is the owner's call (OQ-63); this pins it so it is not a side effect. */
const TOKENS: Record<string, string> = {
  '--ch-page-top-no-eyebrow': 'calc(var(--ch-page-head-top) + 24px)',
  '--ch-page-top-eyebrow-short-2': 'calc(var(--ch-page-head-top) + 2px)',
  '--ch-page-top-eyebrow-short-4': 'calc(var(--ch-page-head-top) + 4px)',
  '--ch-page-top-eyebrow-low-2': 'calc(var(--ch-page-head-top) - 2px)',
  '--ch-page-top-coachhelm': '36px',
  '--ch-page-top-home': '52px',
  '--ch-page-top-home-desk': '40px',
  '--ch-page-top-setup': '28px',
  '--ch-page-gutter-fixed': '40px',
  '--ch-page-bottom': '80px',
  '--ch-page-bottom-short': '64px',
  '--ch-page-bottom-tall': '96px',
  '--ch-page-bottom-setup': '24px',
  '--ch-gap-grid': '18px',
  '--ch-gap-section': '28px',
  '--ch-gap-section-loose': 'var(--ch-space-8)',
  // The phone side inset is the phone gutter (B2), held at today's 20 by spacing-scale.test.ts.
  '--ch-page-x-phone': 'var(--ch-phone-gutter)',
  '--ch-page-top-phone': '26px',
  '--ch-page-bottom-phone': 'var(--ch-space-8)',
  '--ch-page-top-phone-docked': '14px',
  '--ch-page-bottom-phone-docked': '110px',
  '--ch-gap-section-phone': '28px',
  '--ch-gap-section-phone-snug': '22px',
  '--ch-gap-section-phone-tight': 'var(--ch-space-4)',
  '--ch-gap-group': 'var(--ch-space-3)',
};

const SPACING = /^(padding(-[a-z-]+)?|gap|row-gap|column-gap)$/;
const PART = /^(0|var\(--ch-(page|gap)-[a-z0-9-]+\))$/;

function context(rule: Rule): string {
  const at: string[] = [];
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') at.push(`@${(p as AtRule).name} ${(p as AtRule).params}`);
  return at.join(' / ');
}

function rules(file: string, ctx: string, selector: string): Rule[] {
  const out: Rule[] = [];
  postcss.parse(readFileSync(join(ROOT, 'styles', file), 'utf8')).walkRules((r) => {
    if (context(r) === ctx && r.selectors.map((s) => s.trim()).join(', ') === selector) out.push(r);
  });
  return out;
}

describe('page spacing tokens (CONS-34)', () => {
  it('the page spacing tokens hold today’s values', () => {
    const css = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    for (const [name, value] of Object.entries(TOKENS)) expect(css, name).toContain(`${name}: ${value};`);
  });

  it.each(ROOTS)('%s %s %s spaces only on page spacing tokens', (file, ctx, selector) => {
    const found = rules(file, ctx, selector);
    expect(found.length, 'the listed root rule exists').toBeGreaterThan(0);
    const off: string[] = [];
    const used: string[] = [];
    for (const r of found) {
      r.walkDecls((d) => {
        if (d.parent !== r || !SPACING.test(d.prop)) return;
        for (const part of postcss.list.space(d.value)) {
          if (!PART.test(part)) off.push(`${file}:${d.source?.start?.line} ${d.prop}: ${d.value}`);
          else if (part !== '0') used.push(part.slice(4, -1));
        }
      });
    }
    expect(off).toEqual([]);
    for (const name of used) expect(Object.keys(TOKENS).concat('--ch-page-gutter', '--ch-page-head-top'), `${name} is a page spacing token`).toContain(name);
  });
});
