import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');
const css = (name: string) => src(`styles/${name}.css`);
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return sheet.slice(at, sheet.indexOf('}', at));
};

/** The rules behind the sweep's Home, Classes and Roster bugs. The gate sees the layouts; these hold what it can't. */
describe('Home, Classes and Roster lane', () => {
  const home = css('home');
  it('rows sit 16 inside the card, with their margins reset (CRH-1, CRH-2)', () => {
    const reset = home.slice(home.indexOf("(SYS-3)"), home.indexOf('(SYS-3)') + 400);
    expect(reset).toContain('margin-inline: 0');
    expect(reset).toContain('padding: 10px 16px');
  });
  it("the team's game is one column on a phone and 2 x 2 before four fit (CRH-3, CRH-31)", () => {
    expect(rule(home, "  .ch-hm[data-ch-crh='on'] .ch-hm-legs__grid")).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(home).toMatch(/max-width: 1180px\) \{\s*\.ch-h-main\[data-ch-crh='on'\] \.ch-hm-legs__grid \{\s*grid-template-columns: repeat\(2/);
  });
  it('this week is the card body, not a card in a card (CRH-4)', () => {
    const week = rule(home, ".ch-hm[data-ch-crh='on'] .ch-hm-week");
    expect(week).not.toContain('background');
    expect(week).not.toContain('box-shadow');
  });
  it('name links carry an underline, and bars no draw-in (CRH-8, CRH-20)', () => {
    expect(rule(home, "  .ch-hm[data-ch-crh='on'] .ch-hm-legs__a")).toContain('text-decoration: underline');
    expect(home).not.toContain('ch-hm-leg-grow');
  });
  it('the waiting capsules sit on the green on a first run (CRH-5)', () => {
    const coach = src('screens/home/CoachHome.tsx');
    expect(coach.indexOf('<CoachQueue queue={data.queue} phone />')).toBeLessThan(coach.indexOf('Get your team set up'));
    expect(coach.slice(coach.indexOf('Welcome to Clubhouse'), coach.indexOf('Welcome to Clubhouse') + 600)).toMatch(/<CoachQueue[^>]*\/>\s*<\/header>/);
  });
  it('no dead # link (CRH-21)', () => {
    expect(src('screens/home/HomePhone.tsx')).not.toContain("?? '#'");
    expect(src('screens/home/CoachHome.tsx')).not.toContain("?? '#'");
  });
  it('the week strip reads at 3:1 and grows with its words (CRH-11, CRH-12)', () => {
    const ui = css('ui');
    expect(rule(ui, '.ch-wks__d i span')).toContain('--ch-green-500');
    expect(rule(ui, '.ch-wks__d')).toContain('min-height: calc(64 * var(--ch-type-k))');
    expect(rule(ui, '.ch-wks__d')).not.toMatch(/\bheight: 64px/);
  });

  const classes = css('classes');
  it('binders keep their ring and fill past the first and when pressed (CRH-14, CRH-28)', () => {
    expect(rule(classes, "[data-ch-crh='on'].ch-cl.is-phone .ch-cl-card + .ch-cl-card")).toContain('--ch-classes-shadow-2');
    expect(rule(classes, "[data-ch-crh='on'].ch-cl.is-phone .ch-cl-card[data-ch-pressed]")).toContain('background: var(--ch-cl-t)');
  });
  it('the ribbon labels sit at their hours and an out-of-hours class still shows (CRH-15, CRH-27)', () => {
    const view = src('screens/classes/ClassesCrh.tsx');
    expect(view).toContain("style={{ left: '30%' }}");
    expect(view).toContain("style={{ left: '60%' }}");
    expect(view).toContain('is-out');
    expect(rule(classes, "[data-ch-crh='on'] .ch-cl-ribbon i.is-out")).toContain('min-width');
  });
  it('the term card has no raw hex and its Soon list is one column on a phone (CRH-18, CRH-35)', () => {
    expect(rule(classes, "[data-ch-crh='on'] .ch-cl-term__now")).toContain('--ch-on-green-ink');
    expect(rule(classes, "  [data-ch-crh='on'] .ch-cl-term:not(.is-desk) .ch-cl-term__soon")).toContain('minmax(0, 1fr)');
  });
  it('one binder wrapper (CRH-33); Return moves to the next field (MOB-CRH-8)', () => {
    expect(src('screens/classes/ClassesView.tsx')).not.toContain('<div className="ch-cl-deck">{deck}</div>');
    const form = src('screens/classes/ClassForm.tsx');
    expect(form.match(/enterKeyHint="next"/g)).toHaveLength(5);
    expect(form.match(/enterKeyHint="done"/g)).toHaveLength(1);
  });

  const roster = css('roster');
  it('leaders and year chips get their year colour wherever data-year sits (CRH-13)', () => {
    expect(roster).toContain("[data-ch-crh='on'] [data-year='sr'] {");
    expect(roster).not.toContain(":is(.ch-rs-mix, .ch-rs-mix__lg) [data-year='sr']");
  });
  it('coin initials meet the 12 floor; the profile note stays above the keyboard (CRH-25, MOB-CRH-1)', () => {
    expect(roster).not.toContain('--ch-av-type: 11px');
    expect(src('screens/roster/RosterPhoneCrh.tsx')).toMatch(/key=\{`player-\$\{open\.id\}`\} keyboardAware/);
  });
  it('the sort bar sits directly above the players it sorts (CRH-30)', () => {
    const team = src('screens/roster/TeamRosterPhoneCrh.tsx');
    expect(team.indexOf('ch-rsx-sort')).toBeGreaterThan(team.indexOf('title="Coaches"'));
    expect(team.indexOf('ch-rsx-sort')).toBeLessThan(team.indexOf('title="Players"'));
  });
  it('the desk toolbar is one control; no form yet is a dash, not grey bars (QA-13)', () => {
    const desk = src('screens/roster/Roster.tsx');
    expect(desk).toContain('label="Layout"');
    expect(desk).not.toContain('<FormStubs');
    expect(desk).toContain('aria-label="Needs 3 rounds"');
  });
});
