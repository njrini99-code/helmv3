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

/** Today's values (R7 section 13). Changing one is the owner's call (OQ-63); this pins it so it is not a side effect. The
 * phone edge is settled (owner, 2026-10-24, decision 5): 16px, and 20px on a large phone (below). The gap tokens are on
 * the 4pt scale (row 33, 2026-10-24): 18 -> 16, 22 -> 24, 28 -> 32. */
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
  '--ch-gap-grid': 'var(--ch-space-4)',
  '--ch-gap-section': 'var(--ch-space-8)',
  '--ch-gap-section-loose': 'var(--ch-space-8)',
  '--ch-page-x-phone': 'var(--ch-space-4)',
  '--ch-page-top-phone': '26px',
  '--ch-page-bottom-phone': 'var(--ch-space-8)',
  '--ch-page-top-phone-docked': '14px',
  '--ch-page-bottom-phone-docked': '110px',
  '--ch-gap-section-phone': 'var(--ch-space-8)',
  '--ch-gap-section-phone-snug': 'var(--ch-space-6)',
  '--ch-gap-section-phone-tight': 'var(--ch-space-4)',
  '--ch-gap-group': 'var(--ch-space-3)',
};

/**
 * Decision 5 (owner, 2026-10-24; OQ-63, B2): one phone gutter. Every phone page's side edge is `--ch-page-x-phone`,
 * including the roots and pushed screens the CONS-34 list above does not take whole (their tops and bottoms stay as they
 * are), the skeletons that stand in for them, and the pieces that run full bleed to the screen edge and back in. Every
 * rule with the selector in that context is checked, so an earlier rule a later one overrides cannot keep a raw edge.
 */
const PHONE_EDGES: [file: string, context: string, selector: string][] = [
  ...ROOTS.filter(([, ctx, sel]) => ctx === PHONE || sel.includes('is-phone')),
  ['stats.css', PHONE, '.ch-stm'],
  ['stats.css', PHONE, '.ch-stm.is-team'],
  ['home.css', PHONE, '.ch-h-main'],
  ['home.css', PHONE, '.ch-h-main--first'],
  ['home.css', PHONE, '.ch-hm-hero'],
  ['home.css', PHONE, '.ch-hm-body'],
  ['home.css', PHONE, '.ch-hm-skel__hero'],
  ['home.css', PHONE, '.ch-hm-skel__body'],
  ['rounds-recover.css', DESK, '.ch-rcv.is-phone'],
  ['coachhelm.css', DESK, '.ch-hl.is-phone'],
  ['rounds-setup.css', PHONE, '.ch-rsu'],
  ['messages.css', PHONE, '.ch-msp-page'],
  ['messages.css', PHONE, '.ch-msp-skel'],
  ['messages.css', PHONE, '.ch-msp-to'],
  ['messages.css', PHONE, '.ch-msp-ann .ch-ms-ann'],
  ['messages.css', PHONE, '.ch-msp-ann .ch-ms-ann.is-letter'],
  ['coachhelm-ask.css', PHONE, '.ch-ask-top'],
  ['coachhelm-ask.css', PHONE, '.ch-ask-scroll'],
  ['coachhelm-dive.css', PHONE, '.ch-hd-scroll'],
];
/** Full-bleed pieces: out to the screen edge by the gutter, and their content back in by it. */
const PHONE_BLEEDS: [file: string, context: string, selector: string][] = [
  ['hub.css', PHONE, '.ch-hb-tabs'],
  ['coachhelm.css', PHONE, '.ch-hl.is-phone .ch-hl-plist'],
  ['coachhelm-views.css', PHONE, '.ch-hv-chips'],
  ['rounds.css', PHONE, '.ch-rv.is-phone .ch-rv-cardw'],
  ['stats.css', PHONE, '.ch-stm .ch-gd.is-phone .ch-gd__nav'],
  ['rounds-setup.css', PHONE, ".ch-rsu[data-ui='clubhouse'] .ch-rsu-band"],
  ['rounds-setup.css', PHONE, ".ch-rsu[data-ui='clubhouse'] .ch-rsu-dock"],
];
const GUTTER = 'var(--ch-page-x-phone)';
const BLEED = 'calc(-1 * var(--ch-page-x-phone))';

/** The left and right parts of every `<box>`, `<box>-inline`, `<box>-left` and `<box>-right` declaration in `rule`. */
function sides(rule: Rule, box: 'padding' | 'margin'): string[] {
  const out: string[] = [];
  rule.walkDecls((d) => {
    if (d.parent !== rule) return;
    const parts = postcss.list.space(d.value);
    if (d.prop === box) out.push(...(parts.length === 1 ? [parts[0]!] : parts.length === 4 ? [parts[1]!, parts[3]!] : [parts[1]!]));
    else if (d.prop === `${box}-inline` || d.prop === `${box}-left` || d.prop === `${box}-right`) out.push(...parts);
  });
  return out;
}

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

  it('the phone gutter is 16px, and 20px on a large phone (Plus and Pro Max widths)', () => {
    const css = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    expect(css).toMatch(/@media \(min-width: 414px\) \{\s*\[data-ui='clubhouse'\] \{\s*--ch-page-x-phone: var\(--ch-space-5\);\s*\}\s*\}/);
    expect(css.match(/--ch-page-x-phone:/g)).toHaveLength(2);
  });

  it.each(PHONE_EDGES)('%s %s %s sets its side edge on the phone gutter', (file, ctx, selector) => {
    const found = rules(file, ctx, selector);
    expect(found.length, 'the listed rule exists').toBeGreaterThan(0);
    const edges = found.flatMap((r) => sides(r, 'padding'));
    expect(edges.length, 'the rule sets a side edge').toBeGreaterThan(0);
    expect(edges.filter((v) => v !== GUTTER)).toEqual([]);
  });

  it.each(PHONE_BLEEDS)('%s %s %s runs full bleed by the phone gutter', (file, ctx, selector) => {
    // A later rule that only adds room at the end (the scorecard's fade) is not the bleed.
    const found = rules(file, ctx, selector).filter((r) => sides(r, 'margin').length > 0);
    expect(found.length, 'the listed rule exists').toBeGreaterThan(0);
    const out = found.flatMap((r) => sides(r, 'margin'));
    const back = found.flatMap((r) => sides(r, 'padding'));
    expect(out.length * back.length, 'the rule bleeds out and back').toBeGreaterThan(0);
    expect(out.filter((v) => v !== BLEED)).toEqual([]);
    expect(back.filter((v) => v !== GUTTER)).toEqual([]);
  });
});
