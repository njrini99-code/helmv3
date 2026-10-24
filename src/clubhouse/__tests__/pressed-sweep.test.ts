import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * B6: the press controller (lib/press.ts) marks the pressed control with `data-ch-pressed`, and every pressed style
 * reads it, so a tap shorter than the row's delay still shows. The controls that had no pressed look at all now have
 * one. `:active` is read only inside `@media (hover: hover)` (auditor B6): iOS can paint it on the first frame of a
 * scroll, so on touch the controller's mark is the one pressed signal.
 */
/** A rule's declarations, as one normalised string. */
const body = (r: postcss.Rule) => r.nodes.filter((n) => n.type === 'decl').map((d) => String(d)).join(';');
const css = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the pressed state (B6)', () => {
  it.each([
    ['rounds-track.css', '.ch-rt-opt'],
    ['rounds-track.css', '.ch-rt-xopt'],
    ['rounds-track.css', '.ch-rt-rs'],
    ['hub.css', '.ch-hb-picks button'],
    ['hub.css', '.ch-hb-chip'],
    ['stats.css', '.ch-sf__chip'],
    ['coachhelm-ask.css', '.ch-ask-cmp__chip'],
  ])('%s %s has a [data-ch-pressed] rule', (file, sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(css(file)).toMatch(new RegExp(`${esc}\\[data-ch-pressed\\][^{]*\\{[^}]*background-image:`));
  });

  // The Ask composer and history (row 10): each tappable there has a pressed look of its own.
  it.each(['.ch-ask-cmp__send', '.ch-ask-hist__row', '.ch-ask-hist__iconbtn', '.ch-ask-hist__new'])('coachhelm-ask.css %s has a [data-ch-pressed] rule', (sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(css('coachhelm-ask.css')).toMatch(new RegExp(`${esc}\\[data-ch-pressed\\][^{]*\\{[^}]*background`));
  });

  it('no pressed style reads :active outside a hover query, and each one has its [data-ch-pressed] rule', () => {
    // Every stylesheet, so a new one can't bring back a pressed look a scroll flashes or a quick tap never shows.
    const files = readdirSync(join(ROOT, 'styles')).filter((f) => f.endsWith('.css'));
    expect(files.length).toBeGreaterThan(30);
    const off: string[] = [];
    let active = 0;
    for (const f of files) {
      const src = css(f);
      postcss.parse(src).walkRules((rule) => {
        const sel = rule.selector.replace(/::[\w-]+:active/g, '');
        if (!/:active(?![\w-])/.test(sel)) return;
        active += 1;
        let hover = false;
        for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && (p as postcss.AtRule).name === 'media' && /hover:\s*hover/.test((p as postcss.AtRule).params)) hover = true;
        if (!hover) off.push(`${f}: ${rule.selector}`);
        // The touch half: the same selector with the controller's mark in place of :active.
        // The touch half sits just before the hover query: the same selectors with the controller's mark, drawing the same.
        const twin = rule.parent?.type === 'atrule' ? rule.parent.prev() : undefined;
        for (const s of rule.selectors.filter((x) => /:active(?![\w-])/.test(x))) {
          const want = s.replace(/:active(?![\w-])/g, '[data-ch-pressed]');
          if (twin?.type !== 'rule' || !twin.selectors.includes(want)) off.push(`${f}: no [data-ch-pressed] twin for ${s}`);
          else if (body(twin) !== body(rule)) off.push(`${f}: ${s} does not draw what its [data-ch-pressed] twin draws`);
        }
      });
      if (src.includes(':is(:active, [data-ch-pressed])')) off.push(`${f}: :is(:active, [data-ch-pressed]) reads :active on touch`);
    }
    expect(active).toBeGreaterThan(100);
    expect(off).toEqual([]);
  });
});
