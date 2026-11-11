import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeSubline } from '../model';

/**
 * Coach Home, the owner pass of 6 Nov (HOME-S1 to S10), as far as it still applies to the page: the release branch has since moved the
 * leaderboard and the week off the desktop Home, and the cards onto the one raised recipe, so those items have no rule here.
 */
const home = readFileSync(join(process.cwd(), 'src/clubhouse/styles/home.css'), 'utf8');
/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const at = home.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return home.slice(at, home.indexOf('}', at));
};

describe('Coach Home, the owner pass: the phone’s cards', () => {
  it('Today, Team scoring and The team’s game are one group 12 apart, and This week starts the next', () => {
    expect(rule(".ch-hm[data-ch-crh='on'] .ch-hm-body")).toContain('gap: 12px');
    expect(rule(".ch-hm[data-ch-crh='on'] .ch-hm-body > * + .ch-hm-sec:has(> .ch-hm-week)")).toContain('margin-top: 12px');
  });

  it('the first run’s two cards keep 24 between them', () => {
    expect(rule(".ch-hm[data-ch-crh='on'] .ch-hm-body:has(> .ch-hm-setup)")).toContain('gap: 24px');
  });

  it('a card’s title sits over a hairline from the 16 inset, not a rule across the card', () => {
    const head = rule(".ch-hm[data-ch-crh='on'] :is(.ch-hm-sec__h, .ch-hm-form__head)");
    expect(head).toContain('box-shadow: none');
    const line = rule(".ch-hm[data-ch-crh='on'] :is(.ch-hm-sec__h, .ch-hm-form__head)::after");
    expect(line).toContain('inset: auto 0 0 16px');
    expect(line).toContain('height: var(--ch-hairline-w)');
  });

  it('the card’s link sits on the 16 inset with no negative margin, and reaches 44 through a layer', () => {
    const link = rule(".ch-hm[data-ch-crh='on'] .ch-hm-link");
    expect(link).toContain('margin: 0');
    expect(link).toContain('padding: 0');
    expect(rule(".ch-hm[data-ch-crh='on'] .ch-hm-link::after")).toContain('inset: -14px -8px');
  });

  it('Team scoring’s three figures share one inset hairline and no rule between them, over the line’s soft fill', () => {
    const figs = rule(".ch-hm[data-ch-crh='on'] .ch-hm-form__figs");
    expect(figs).toContain('margin: 0 16px');
    expect(figs).toContain('border-top: var(--ch-hairline-w) solid var(--ch-separator)');
    expect(rule(".ch-hm[data-ch-crh='on'] .ch-hm-form__figs > div + div")).toContain('border-left: 0');
    expect(rule(".ch-hm[data-ch-crh='on'] .ch-hm-form__svg path:first-of-type")).toContain('display: block');
  });
});

describe('Coach Home, the owner pass: the desktop', () => {
  it('the brief keeps a reading measure on the hero', () => {
    expect(rule(".ch-h-main[data-ch-crh='on'] .ch-dh-brief")).toContain('max-width: 60ch');
  });

  it('a short list’s footnote reads from the left under the last row (HOME-S4)', () => {
    const rest = rule('.ch-dh-rest');
    expect(rest).not.toContain('text-align: center');
    expect(rest).not.toContain('place-content: center');
    expect(rest).toContain('font: var(--ch-type-13)');
  });
});

describe('Coach Home, the owner pass: the brief', () => {
  it('makes no sentence of a player with no rounds (HOME-S5)', () => {
    const on = { name: 'Theo Marchetti', status: 'improving', quietDays: 2 } as never;
    const line = homeSubline([on], { roundsError: false, nextCompetition: null, unposted: [{ name: 'Audit Testplayer' }] });
    expect(line).toBe('Everyone with enough rounds is on track.');
    expect(line).not.toMatch(/Audit|no 18-hole/);
  });
});
