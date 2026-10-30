import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** F-0021 (phone, 44pt) and F-0022 (desktop pointer, 24px): the controls the audit found short reach their target. */
const css = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The bodies of every `@media (<query>) {…}` block in a sheet, joined. */
function blocks(src: string, query: string): string {
  const out: string[] = [];
  let at = src.indexOf(`@media (${query}) {`);
  while (at !== -1) {
    let depth = 0;
    let i = src.indexOf('{', at);
    const start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    out.push(src.slice(start, i));
    at = src.indexOf(`@media (${query}) {`, i);
  }
  return out.join('\n');
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rule = (src: string, sel: string, decl: string) => new RegExp(`${esc(sel)}\\s*\\{[^}]*${esc(decl)}`).test(src);

describe('phone targets reach 44pt (F-0021)', () => {
  it('a select is drawn at 44 on the phone, like a text field', () => {
    expect(rule(blocks(css('controls.css'), 'max-width: 820px'), '.ch-root .ch-select select', 'height: 44px')).toBe(true);
    expect(rule(blocks(css('stats.css'), 'max-width: 820px'), '.ch-sv-tr__menu .ch-select select', 'height: 44px')).toBe(true);
  });
  it.each(['.ch-hl-since__b', '.ch-hs-ld__why'])('%s takes the shared 44pt reach', (sel) => {
    const phone = blocks(css('controls.css'), 'max-width: 820px');
    expect(phone).toMatch(new RegExp(`:where\\([^)]*${esc(sel)}[^)]*\\)::after`));
  });
  it('the all:unset buttons position themselves, so the reach has a box to grow from', () => {
    expect(rule(css('coachhelm.css'), '.ch-hl-since__b', 'position: relative')).toBe(true);
    expect(rule(css('coachhelm-standing.css'), '.ch-hs-ld__why', 'position: relative')).toBe(true);
  });
  it('the new-event title is 44 tall on the phone', () => {
    expect(rule(blocks(css('calendar.css'), 'max-width: 820px'), '.ch-ed__title', 'min-height: 44px')).toBe(true);
  });
});

describe('desktop pointer targets reach 24px (F-0022)', () => {
  const fine = blocks(css('ui.css'), 'pointer: fine');
  it.each(['.ch-hw-more', '.ch-tr__link', '.ch-tour-cmp-div'])('%s grows to 24 under a mouse', (sel) => {
    expect(fine).toMatch(new RegExp(`:where\\([^)]*${esc(sel)}[^)]*\\)::after\\s*\\{[^}]*inset: min\\(0px, calc\\(50% - 12px\\)\\)`));
  });
  it('the timeline thumb grows through ::before (its ::after is the dot)', () => {
    expect(fine).toMatch(/\.ch-tour-cmp-tl__thumb::before\s*\{[^}]*inset: min\(0px, calc\(50% - 12px\)\)/);
  });
  it('a month chip is at least 24 tall', () => {
    expect(rule(css('calendar.css'), '.ch-mo__ev', 'min-height: 24px')).toBe(true);
  });
});
