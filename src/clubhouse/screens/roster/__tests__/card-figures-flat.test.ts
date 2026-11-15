import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W25 (preview walk, 11 Nov): on a Roster player card the strokes-gained unit "a round" wrapped under its bar on a line
// of its own, the figures sat in a beige well with its own shadow inside the white card, and an early player read
// "Needs 1 more" beside the "Early read" pill that already said so.

const read = (p: string) => readFileSync(join(process.cwd(), 'src/clubhouse', p), 'utf8');
const tsx = read('screens/roster/Roster.tsx');
const css = read('styles/roster.css');
const figures = tsx.slice(tsx.indexOf('function FaceFigures('), tsx.indexOf('function', tsx.indexOf('function FaceFigures(') + 10));

describe('W25 the player card figures', () => {
  it('keeps "a round" inside the strokes-gained figure, not under the bar', () => {
    expect(figures).toMatch(/<b className=\{'ch-num ' \+ changeTone\(sg[^}]*\}>[\s\S]*?<small className="ch-rs-fig__u">a round<\/small>[\s\S]*?<\/b>/);
    expect(figures).not.toContain('<span className="ch-rs-fig__m">a round</span>');
  });

  it('draws the figures on the card under a hairline, with no well or shadow of their own', () => {
    const rule = css.match(/\n\.ch-rs-figs \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('border-top: var(--ch-hairline-w) solid var(--ch-border-hairline)');
    expect(rule).not.toMatch(/background|box-shadow/);
  });

  it('says early once: the scoring caption no longer reads "Needs N more"', () => {
    expect(figures).not.toContain('earlyNeed');
    expect(figures).not.toMatch(/need \?\?/);
  });

  it('sets the unit in a type token, not raw font longhands', () => {
    const rule = css.match(/\.ch-rs-fig__u \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('font: var(--ch-type-12-medium)');
    expect(rule).not.toMatch(/font-(size|weight)/);
  });
});
