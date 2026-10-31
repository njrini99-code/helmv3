import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** F-0024 and F-0050: no phone text in these blocks under the 12 step, and each follows iPhone Text Size. */
const css = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function phone(src: string): string {
  const out: string[] = [];
  let at = src.indexOf('@media (max-width: 820px) {');
  while (at !== -1) {
    let depth = 0;
    let i = src.indexOf('{', at);
    const start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    out.push(src.slice(start, i));
    at = src.indexOf('@media (max-width: 820px) {', i);
  }
  return out.join('\n');
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A phone rule whose selector list names `sel` and sets a k-scaled 12 (a size or a 12 role). */
const twelve = (src: string, sel: string) =>
  new RegExp(`(?:^|[,}\\s])${esc(sel)}\\s*(?:,[^{}]*)?\\{[^}]*(?:calc\\(12 \\* var\\(--ch-type-k\\)\\)|var\\(--ch-type-12-(?:medium|strong)\\))`).test(phone(src));

describe('phone type floor (F-0024)', () => {
  it.each(['.ch-hb-ann__file em', '.ch-hb-file__ic em'])('hub: %s is a k-scaled 12 on the phone', (sel) => {
    expect(twelve(css('hub.css'), sel)).toBe(true);
  });
  it('hub.css draws no fixed 11px text', () => {
    expect(css('hub.css')).not.toMatch(/font(?:-size)?:[^;]*\b11px\b/);
  });
  it('the compare A/B tags are the 12 role on the phone and grow with Text Size', () => {
    const p = phone(css('tournaments-compare.css'));
    expect(p).toMatch(/\.ch-tour-cmp-tag\s*\{[^}]*font: var\(--ch-type-12-strong\);[^}]*min-height: calc\(20 \* var\(--ch-type-k\)\)/);
  });
});

describe('phone chart labels (F-0050)', () => {
  it('a line chart label is the 12 role on the phone', () => {
    expect(twelve(css('ui.css'), '.ch-line__t')).toBe(true);
  });
  it('the round trend labels take the k-scaled 12 floor', () => {
    expect(twelve(css('stats.css'), '.ch-sv-rt__t')).toBe(true);
  });
  it('the CoachHelm trend floor follows Text Size', () => {
    expect(phone(css('coachhelm-thread.css'))).not.toMatch(/\.ch-line__t\s*\{[^}]*font-size: 12px/);
  });
});
