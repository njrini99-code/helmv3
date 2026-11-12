import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ChBriefWorking } from '../../../../data/coachhelm-coach-brief-shape';
import type { ChInsight } from '../../../../data/coachhelm-shape';
import type { ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { WorkingCard, workingRows } from '../Cards';

/**
 * W11 (staging, 11 Nov, desktop 1920): Working on listed nine focus areas, nearly all with an empty ring (no target to fill toward),
 * every state line in the same green ("Active · 6 rounds since Sep 25"), and the same focus once for each of three players
 * ("Lag putts → 3-putt cascade" for Cole, Dylan and Jackson). Rings only where there is a target, a shared focus as one row, and
 * quiet state lines.
 */

afterEach(cleanup);

const area = (id: string, who: string, title: string, progress: ChBriefWorking['progress'] = null): ChBriefWorking => ({ id, who, title, word: 'Active', line: progress ? 'Three-putts 0.9 to 0.5 a round · target 0.4' : null, since: '6 rounds since Sep 25', href: '#', progress });
const CASCADE = 'Lag putts → 3-putt cascade';
const STAGING: ChBriefWorking[] = [
  area('w1', 'Cole Bennett', CASCADE),
  area('w2', 'Mason Reed', 'Tee shots with driver: penalties'),
  area('w3', 'Dylan Park', CASCADE),
  area('w4', 'Owen Carter', 'Wedges from 50 to 100 yd', { from: 24, now: 21, target: 18 }),
  area('w5', 'Jackson Lee', `  ${CASCADE.toLowerCase()} `),
  area('w6', 'Ethan Brooks', 'Bogey after a missed green'),
  area('w7', 'Tyler Moss', 'Scrambling from sand'),
  area('w8', 'Cole Bennett', 'Approach from 125 to 175'),
  area('w9', 'Mason Reed', 'Up and down from 30 yd'),
];
const eli = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
const proposal = { player: eli, read: { ...(eli.reads.needs[0] as ChInsight), id: 'p1', title: 'Penalty strokes: 1.1 per round', value: '1.1' } as ChInsight };

const card = () => {
  render(<WorkingCard working={STAGING} proposed={[proposal]} failed={false} />);
  return [...document.querySelectorAll<HTMLElement>('[data-ch-team-card="work"] .wk')];
};

describe('Working on (W11)', () => {
  it('a focus three players share is one row, with their names, in the brief’s order', () => {
    const rows = workingRows(STAGING);
    expect(rows).toHaveLength(7);
    expect(rows[0]!.areas.map((a) => a.who)).toEqual(['Cole Bennett', 'Dylan Park', 'Jackson Lee']);
    const drawn = card();
    expect(drawn).toHaveLength(8);
    const shared = drawn.filter((r) => r.classList.contains('is-shared'));
    expect(shared).toHaveLength(1);
    expect(shared[0]!.querySelector('b')!.textContent).toBe(CASCADE);
    expect(shared[0]!.textContent).toContain('Cole, Dylan and Jackson');
    expect(document.body.textContent!.split(CASCADE).length - 1).toBe(1);
  });

  it('a ring only where the focus has a target, closing its row; none for a shared focus or a proposal', () => {
    const drawn = card();
    const ringed = drawn.filter((r) => r.querySelector('.ringc'));
    expect(ringed).toHaveLength(1);
    expect(ringed[0]!.textContent).toContain('Owen · Wedges from 50 to 100 yd');
    expect(ringed[0]!.lastElementChild!.classList.contains('ringc')).toBe(true);
    for (const r of drawn) expect(r.firstElementChild!.tagName).toBe('DIV');
  });

  it('the meta still counts every focus area; the state lines carry no green', () => {
    card();
    expect(document.querySelector('[data-ch-team-card="work"] .meta')!.textContent).toBe('10 focus areas');
    expect(document.querySelectorAll('.wk .st.ok, .wk .st.wait')).toHaveLength(0);
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');
    const st = css.match(/\.ch-htb \.wk \.st \{([^}]*)\}/)?.[1] ?? '';
    expect(st).toContain('color:var(--ch-ink-600)');
    expect(css).not.toMatch(/\.wk \.st\.ok/);
    expect(st).not.toMatch(/font-weight/);
  });
});
