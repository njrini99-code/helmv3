import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * S6 (premium plan 2026-11-19): a hover style sits inside a hover query, so a tap never leaves a row lit. New guards are
 * written (hover: hover) and (pointer: fine). This ratchet counts the selectors that still hover outside any hover
 * query, per sheet; the counts may only fall. Most left are a reset beside a hover (the same look either way) or a
 * screen another batch is reworking. `:not(:hover)` and autofill are not hovers.
 */
const BASELINE: Record<string, number> = {
  'auth.css': 3,
  'calendar.css': 2,
  'home.css': 1,
  'hub.css': 3,
  'messages-overlays.css': 1,
  'messages.css': 1,
  'onboard.css': 1,
  'practice.css': 1,
  'qualifiers.css': 2,
  'roster.css': 2,
  'rounds-setup.css': 2,
  'rounds-track.css': 1,
  'rounds.css': 1,
  'tournaments-home.css': 1,
};

const DIR = join(process.cwd(), 'src/clubhouse/styles');
const NOT = /:not\([^()]*(\([^()]*\)[^()]*)*\)/g;

function unguarded(file: string): number {
  let n = 0;
  postcss.parse(readFileSync(join(DIR, file), 'utf8')).walkRules((rule) => {
    for (const sel of rule.selectors) {
      const hovers = sel.replace(NOT, '');
      if (!hovers.includes(':hover') || hovers.includes('autofill')) continue;
      let guarded = false;
      for (let p: postcss.Node | undefined = rule.parent as postcss.Node | undefined; p; p = p.parent as postcss.Node | undefined) {
        if (p.type === 'atrule' && (p as postcss.AtRule).name === 'media' && /hover:\s*hover/.test((p as postcss.AtRule).params)) guarded = true;
      }
      if (!guarded) n += 1;
    }
  });
  return n;
}

describe('S6 hover guards', () => {
  it('no sheet hovers outside a hover query more than it did', () => {
    const over: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.css'))) {
      const n = unguarded(f);
      if (n > (BASELINE[f] ?? 0)) over.push(f + ': ' + n + ' (baseline ' + (BASELINE[f] ?? 0) + ')');
    }
    expect(over).toEqual([]);
  });
});
