import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * dsx-08: nothing a person needs is found only by hovering. A rule that shows something on hover (its opacity rises
 * from 0, it turns visible, it starts taking taps) is either matched by a rule that shows the same thing where there is
 * no hover (`(hover: none)` or `(pointer: coarse)`), or is named below with the reason a finger doesn't need it. A new
 * hover-only reveal fails here.
 */

const DIR = join(process.cwd(), 'src/clubhouse/styles');

/** Reveals a finger never needs, by sheet and the revealed selector (`:hover` taken out), with why. */
const ALLOW: Record<string, string> = {
  'calendar.css .ch-ev.is-draggable .ch-ev__grip::after': 'a desk drag hint; touch drags by holding the event, which lifts it',
  'calendar.css .ch-ev-bar.is-draggable .ch-ev-bar__grip::after': 'a desk drag hint; touch drags by holding the bar',
  'calendar.css .ch-ev::before': 'the hover tint itself, not a control',
  'home.css .ch-h-lb__row.is-link::after': 'the row chevron; the whole row is the link and takes the press wash (home.css is in #2658)',
  'messages-overlays.css .ch-ms-msg, .ch-ms-msg:focus-within .ch-msv-hoverbar': 'the desk reaction bar; on the phone a held message lifts its own bar (hold-lift)',
  'messages.css [data-ch-ms-v2] .ch-ms-msg .ch-msv-time': 'the time beside a message on a desk; the phone shows times in the day stamps',
  'roster.css .ch-rs-em__x': 'the remove key is drawn at rest at a lower opacity; hover only deepens it',
  'rounds.css .ch-rv .ch-rzpt .ch-rzpt__c i': 'a hover emphasis on the zone chart, not a control',
  'ui.css .ch-btn > .ch-btn__layer': "the key's own hover fill",
  'ui.css .ch-lift::after': 'the lifted shadow on hover, a decoration',
  'tournaments-compare.css .ch-tour-cmp-div .ch-tour-cmp-div__grip': 'shown at rest under (hover: none)',
};

const REVEAL = (d: postcss.Declaration) =>
  (d.prop === 'opacity' && !/^0(\.0+)?$/.test(d.value)) || (d.prop === 'visibility' && d.value === 'visible') || (d.prop === 'pointer-events' && d.value === 'auto');
const NOT = /:not\([^()]*(\([^()]*\)[^()]*)*\)/g;
const strip = (sel: string) =>
  sel
    .replace(NOT, '')
    .replace(/:is\(:hover, ?:focus-within\)/g, '')
    .replace(/:hover/g, '')
    .replace(/:where\(\s*([^()]*)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

function scan() {
  const hoverOnly: string[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.css'))) {
    const root = postcss.parse(readFileSync(join(DIR, f), 'utf8'));
    const touchShown = new Set<string>();
    const hovered: string[] = [];
    root.walkRules((rule) => {
      const reveals = rule.nodes.some((n) => n.type === 'decl' && REVEAL(n));
      if (!reveals) return;
      let touch = false;
      for (let p = rule.parent as postcss.Node | undefined; p; p = p.parent as postcss.Node | undefined) {
        if (p.type === 'atrule' && (p as postcss.AtRule).name === 'media' && /hover:\s*none|pointer:\s*coarse/.test((p as postcss.AtRule).params)) touch = true;
      }
      for (const sel of rule.selectors) {
        if (touch) touchShown.add(strip(sel));
        else if (sel.replace(NOT, '').includes(':hover')) hovered.push(strip(sel));
      }
    });
    for (const s of hovered) {
      const shown = [...touchShown].some((t) => t === s || t.endsWith(s.split(' ').pop()!));
      if (!shown && !ALLOW[`${f} ${s}`]) hoverOnly.push(`${f} ${s}`);
    }
  }
  return hoverOnly;
}

describe('no affordance only a hover can find (dsx-08)', () => {
  it('every hover reveal is shown on touch too, or named with its reason', () => {
    expect(scan()).toEqual([]);
  });
});
