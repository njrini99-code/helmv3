import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * B6: the press controller (lib/press.ts) marks the pressed control with `data-ch-pressed`, and every pressed style
 * reads it as well as `:active`, so a tap shorter than the row's delay still shows. The controls that had no pressed
 * look at all now have one.
 */
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
    expect(css(file)).toMatch(new RegExp(`${esc}:is\\(:active, \\[data-ch-pressed\\]\\)[^{]*\\{[^}]*background-image:`));
  });

  // The Ask composer and history (row 10): each tappable there has a pressed look of its own.
  it.each(['.ch-ask-cmp__send', '.ch-ask-hist__row', '.ch-ask-hist__iconbtn', '.ch-ask-hist__new'])('coachhelm-ask.css %s has a [data-ch-pressed] rule', (sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(css('coachhelm-ask.css')).toMatch(new RegExp(`${esc}:is\\(:active, \\[data-ch-pressed\\]\\)[^{]*\\{[^}]*background`));
  });

  it('no pressed style in any stylesheet reads :active alone', () => {
    // Every stylesheet, so a new one can't bring back a pressed look that a quick tap never shows.
    const files = readdirSync(join(ROOT, 'styles')).filter((f) => f.endsWith('.css'));
    expect(files.length).toBeGreaterThan(30);
    const bare = files.flatMap((f) =>
      [...css(f).matchAll(/([^{};]*)\{/g)]
        .map((m) => m[1]!)
        .filter((sel) => /:active(?![\w-])/.test(sel.replace(/:is\(:active, \[data-ch-pressed\]\)/g, '')) && !/::[\w-]+:active/.test(sel))
        .map((sel) => `${f}: ${sel.trim()}`),
    );
    expect(bare).toEqual([]);
  });
});
