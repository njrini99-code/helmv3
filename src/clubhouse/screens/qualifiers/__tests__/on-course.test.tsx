// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/qualifiers' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_LIVE, PREVIEW_LIVE_MANY, PREVIEW_LIVE_NOW } from '../../../preview/fixtures-live';
import type { LiveLane } from '../../../live/model';
import { isOwnRoundOn, qualifierLiveLines } from '../on-course';
import { LiveOnCourse } from '../LiveOnCourse';
import { LiveLine } from '../QualifiersList';

afterEach(cleanup);

const qid = PREVIEW_LIVE.lanes.find((l) => l.roundType === 'qualifier')!.qualifierId!;
const lane = (over: Partial<LiveLane>): LiveLane => ({ ...PREVIEW_LIVE.lanes[0]!, ...over });

describe('qualifierLiveLines (CH-16622)', () => {
  it('counts the players on the course per qualifier, with the round most of them are playing', () => {
    const lines = qualifierLiveLines(PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW);
    // Sofia, Mateo (round 2) and Priya report; Ellis (14 minutes) and Noor are quiet, Ada is posted, Jonah is practice.
    expect(lines[qid]).toEqual({ round: 2, n: 3 });
  });

  it('a tie goes to the later round, and practice rounds never count', () => {
    const a = lane({ roundId: 'a', qualifierRound: 1, qualifierId: 'q' });
    const b = lane({ roundId: 'b', qualifierRound: 2, qualifierId: 'q' });
    const p = lane({ roundId: 'p', roundType: 'practice', qualifierId: null, qualifierRound: null });
    expect(qualifierLiveLines([a, b, p], PREVIEW_LIVE_NOW)).toEqual({ q: { round: 2, n: 2 } });
  });

  it('is empty when nobody is out', () => {
    expect(qualifierLiveLines([], PREVIEW_LIVE_NOW)).toEqual({});
  });
});

describe('isOwnRoundOn', () => {
  const mine = PREVIEW_LIVE.lanes.find((l) => l.name === 'Sofia Reyes')!;
  it('is true while the player is on the course or finished but not posted', () => {
    expect(isOwnRoundOn(PREVIEW_LIVE.lanes, mine.playerId, qid)).toBe(true);
    expect(isOwnRoundOn([{ ...mine, phase: 'finished' }], mine.playerId, qid)).toBe(true);
  });
  it('is false once posted, on another qualifier, or with no player', () => {
    expect(isOwnRoundOn([{ ...mine, phase: 'posted' }], mine.playerId, qid)).toBe(false);
    expect(isOwnRoundOn(PREVIEW_LIVE.lanes, mine.playerId, 'other')).toBe(false);
    expect(isOwnRoundOn(PREVIEW_LIVE.lanes, null, qid)).toBe(false);
  });
});

describe('LiveLine on the list', () => {
  it('reads "Round 2 live · 4 on the course" with the static dot', () => {
    const { container } = render(<LiveLine line={{ round: 2, n: 4 }} />);
    const el = container.querySelector('[data-ch-code="CH-16622"]')!;
    expect(el.textContent).toBe('Round 2 live · 4 on the course');
    expect(el.querySelector('.ch-lv-dot')).toBeTruthy();
  });
  it('draws nothing without a line', () => {
    const { container } = render(<LiveLine />);
    expect(container.firstChild).toBeNull();
  });
});

describe('LiveOnCourse', () => {
  const onCourse = { snapshot: PREVIEW_LIVE, teamId: 't', heldBack: false };
  const base = { qualifierId: qid, day: '2026-10-14', active: true, phone: false, now: PREVIEW_LIVE_NOW, frozen: true };

  it('gives a coach the live lanes of the qualifier, no event rows (CH-16620)', () => {
    render(<LiveOnCourse {...base} coach onCourse={onCourse} />);
    expect(screen.getByRole('heading', { name: 'On the course · 5' }).getAttribute('data-ch-code')).toBe('CH-16620');
    expect(screen.queryByRole('link', { name: /See all/ })).toBeNull();
  });

  it('opens the live view scoped to the qualifier when there are more lanes than fit (phone: four)', () => {
    render(<LiveOnCourse {...base} phone coach onCourse={{ ...onCourse, snapshot: PREVIEW_LIVE_MANY }} />);
    expect(screen.getByRole('link', { name: /See all/ }).getAttribute('href')).toBe(`/golf/dashboard/live?qualifier=${qid}`);
  });

  it('tells a player mid-round that the standings wait for their round (CH-16621), and shows no lanes', () => {
    const { container } = render(<LiveOnCourse {...base} coach={false} onCourse={{ ...onCourse, heldBack: true }} />);
    expect(container.querySelector('[data-ch-code="CH-16621"]')?.textContent).toBe('Standings update when your round is posted.');
    expect(container.querySelector('.ch-lv-lane')).toBeNull();
  });

  it('draws nothing for a player who is not held back, when the qualifier is not in progress, or without a feed', () => {
    expect(render(<LiveOnCourse {...base} coach={false} onCourse={onCourse} />).container.firstChild).toBeNull();
    cleanup();
    expect(render(<LiveOnCourse {...base} active={false} coach onCourse={onCourse} />).container.firstChild).toBeNull();
    cleanup();
    expect(render(<LiveOnCourse {...base} coach onCourse={undefined} />).container.firstChild).toBeNull();
  });
});
