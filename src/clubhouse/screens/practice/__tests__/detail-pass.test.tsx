import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../preview/fixtures-practice-plan';
import { PracticePlanSheet } from '../../coachhelm/plan/sheet/PracticePlanSheet';
import { toSheetModel } from '../../coachhelm/plan/sheet/plan-sheet-model';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/practice.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
/** The phone block of the sheet: everything from its media query on. */
const phone = css.slice(css.indexOf('@media (max-width: 820px), (max-height: 500px) and (pointer: coarse) {\n  .ch-prc,'));

describe('the plan sheet’s figures', () => {
  // Each of these sets its own `font`, which resets the figures to proportional: the class has to be on the element itself.
  const sheet = document.createElement('div');
  sheet.innerHTML = renderToStaticMarkup(
    <PracticePlanSheet plan={toSheetModel({ body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach')} />,
  );
  const all = (selector: string) => [...sheet.querySelectorAll(selector)];

  it.each([
    ['a block’s start', '.pt b'],
    ['a block’s minutes', '.pt span'],
    ['a rotation’s turns', '.pp-rot .h:not(:first-child)'],
    ['the day of the month', '.pp-date b'],
    ['the players and the total, beside their headings', '.pp-h span'],
  ])('%s is in tabular numerals', (_what, selector) => {
    const found = all(selector);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((el) => el.classList.contains('ch-num'))).toBe(true);
  });
  it('the Time cell is in tabular numerals', () => {
    const time = all('.pp-meta div').find((d) => d.querySelector('dt')?.textContent === 'Time')!;
    expect(time.querySelector('dd')!.classList.contains('ch-num')).toBe(true);
    expect(time.querySelector('dd')!.textContent).toBe('2:00 to 5:00 PM');
  });
});

describe('Practice’s fields of more than one line', () => {
  // `.ch-input` is the one-line field, 44 tall on a phone: a note's second line was cut off under it.
  it.each(['builder/Sheets.tsx', 'builder/Builder.tsx', 'LibraryPages.tsx'])('%s draws a textarea as the shared multi-line field', (file) => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/screens/practice', file), 'utf8');
    const areas = src.match(/<textarea[^>]*>/g) ?? [];
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) {
      expect(area).toContain('className="ch-textarea"');
      expect(area).not.toContain('ch-input');
    }
  });
});

describe('Practice’s stylesheet, the detail pass', () => {
  it('keyboard focus on the green helper card is the champagne ring, on the text key and on the white one', () => {
    expect(rule('.ch-prc-feat :focus-visible')).toContain('outline-color: var(--ch-border-focus-on-dark)');
    expect(rule('.ch-root .ch-prc-feat .ch-btn:focus-visible')).toContain('0 0 0 4px var(--ch-border-focus-on-dark)');
  });
  it('a player’s chip in a group is 44 wide however short the name', () => {
    expect(rule('.ch-prc-player')).toMatch(/min-width: 44px;[\s\S]*min-height: 44px;/);
  });
  it('a print option’s switch takes the shared 44pt reach on a phone', () => {
    expect(phone).toMatch(/\.ch-prt-opt \.ch-switch \{\s*position: relative;/);
    expect(phone).toMatch(/\.ch-prt-opt \.ch-switch::after \{[^}]*inset: min\(0px, calc\(50% - 22px\)\);/);
  });
  it('a template’s rule runs to the card’s inset: only its name makes room for the card’s menu', () => {
    expect(rule('.ch-prc-tmpl__go')).toContain('padding-inline-end: 32px');
    expect(css).toMatch(/\.ch-prc-tmpl__go > small,\s*\.ch-prc-tmpl__go > \.ch-prc-glance \{\s*margin-inline-end: -32px;/);
  });
});
