import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Roster craft pass (13 Nov 2026): layout, spacing and hierarchy only. The data and copy lines (the strokes-gained
// sentence's words, the class mix's "not set", the profile's This season card) belong to another pass and are left as they are.

const read = (p: string) => readFileSync(join(process.cwd(), 'src/clubhouse', p), 'utf8');
const css = read('styles/roster.css');
const tsx = read('screens/roster/Roster.tsx');
const peek = read('screens/roster/RosterPeek.tsx');
/** The body of the first rule whose selector is exactly `sel`. */
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const figures = tsx.slice(tsx.indexOf('function FaceFigures('), tsx.indexOf('function', tsx.indexOf('function FaceFigures(') + 10));

describe('Roster craft pass', () => {
  it('the phone drops the leaders’ empty wrapper, so the team card stands 18px over the sort as drawn, not 30 (CR-06)', () => {
    expect(rule("  [data-ch-crh='on'] .ch-rsx-sec:empty")).toContain('display: none');
  });

  it('the team card’s total sits on the redline’s 34/.9 leading, so "players" is on the counts line (06 7.2)', () => {
    const total = rule("[data-ch-crh='on'] .ch-rs-tcard__n b");
    expect(total).toContain('font: var(--ch-type-34-strong)');
    expect(total).toContain('line-height: var(--ch-lead-figure)');
    expect(read('styles/tokens.css')).toContain('--ch-lead-figure: 0.9;');
    expect(rule("[data-ch-crh='on'] .ch-rs-tcard__n span")).toContain('line-height: var(--ch-lead-tight)');
  });

  it('the desk head’s line keeps the text measure (CR-14)', () => {
    expect(rule("  [data-ch-crh='on'].ch-rsd .ch-rs-head p")).toContain('max-width: var(--ch-measure-text)');
  });

  it('a card with no place to show labels its figure "Scoring avg" on one line, with no lone "Avg" caption under it', () => {
    expect(figures).toContain("placed ? 'Scoring' : 'Scoring avg'");
    expect(figures).not.toContain(": 'Avg'");
    expect(figures).toMatch(/\{placed && <span className="ch-rs-fig__m">/);
  });

  it('the card’s handicap figure sits on the right edge with the two figures above it', () => {
    const hcp = rule('.ch-rs-face__hcp');
    expect(hcp).toContain('display: flex');
    expect(hcp).toContain('justify-content: space-between');
    expect(rule('.ch-rs-face__hcp b')).not.toContain('margin-left');
  });

  it('a teammate’s card holds its handicap at the foot, flat under a hairline, so the figures line up across a row', () => {
    const one = rule('.ch-rs-face__figs--one');
    expect(one).toContain('margin-top: auto');
    expect(one).toContain('border-top: var(--ch-hairline-w) solid var(--ch-border-hairline)');
    expect(one).toContain('background: none');
    expect(one).toContain('box-shadow: none');
  });

  it('the desk panel’s Message is not a second primary (CR-07)', () => {
    const from = peek.indexOf('className="ch-rs-peek__quick"');
    const quick = peek.slice(from, peek.indexOf('Schedule 1:1', from));
    expect(quick).toContain('Message');
    expect(quick).not.toContain('variant="primary"');
  });
});
