import { LazyMotion, domAnimation } from 'motion/react';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Re-typing a SUBMITTED round from its review (CH-11522), against production's round page
 * (`rounds/[id]/page.tsx` + `RoundTypeEditor`): the owning player and a coach of the player's team may; the player is
 * offered the qualifiers they are entered in, a coach also the round's team's other qualifiers, and the save
 * (`updateRoundType`) enters the player in one of those. The action's own coach-enters-the-player write is covered by
 * src/app/golf/actions/__tests__/round-type.test.ts ("ENTERS the player and proceeds when a COACH asks").
 * Also the setup's reading of a qualifier the server says has no round (`qualifierBlockedReason`).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/rounds/x' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const updateRoundType = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({ getPlayerQualifiers: vi.fn(), getNextQualifierRoundNumber: vi.fn() }));
vi.mock('@/app/golf/actions/course-library', () => ({ getCourseDetail: vi.fn(), getRecentlyPlayedCourses: vi.fn(), getTeamSavedCourses: vi.fn(), getTeeWithHoles: vi.fn(), listCoursesStrict: vi.fn() }));

import { readRoundTypeOptions } from '../data/rounds-type-options';
import { loadRoundReview } from '../data/round-review';
import { currentRoundType, type ChReviewTypeEdit } from '../data/round-review-shape';
import { RoundReview } from '../screens/rounds/RoundReview';
import { qualifierHint } from '../screens/rounds/entry/RoundTypeSheet';
import { roundTypeFailure, savedLine } from '../screens/rounds/entry/round-type';
import { qualifierBlockedReason } from '../screens/rounds/entry/setup-reads';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_ROUND } from '../preview/fixtures-round-review';
import { ToastProvider } from '../ui/Toast';
import { createClient } from '@/lib/supabase/server';
import './dialog-polyfill';

type Filters = Array<[string, unknown[]]>;
const has = (f: Filters, key: string, ...args: unknown[]) => f.some(([k, a]) => k === key && JSON.stringify(a) === JSON.stringify(args));
const entry = (id: string, over: Record<string, unknown> = {}) => ({ qualifier: { id, name: `Q ${id}`, num_rounds: 3, status: 'in_progress', ...over } });

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  tables.current = {};
});

describe('readRoundTypeOptions: the Fairway round page’s qualifier reads', () => {
  const input = { playerId: 'p1', roundId: 'r1', roundTeamId: 'team-1' };

  it('a player is offered only the qualifiers they are entered in, finished ones included, and the team is not read', async () => {
    const team = vi.fn(() => ({ data: [{ id: 'q9', name: 'Team only', num_rounds: 2, status: 'in_progress' }] }));
    tables.current = {
      golf_qualifier_entries: { data: [entry('q1'), entry('q2', { status: 'completed' })] },
      golf_qualifiers: team,
      golf_rounds: { data: [{ qualifier_id: 'q1', qualifier_round_number: 2 }] },
    };
    const res = await readRoundTypeOptions(await createClient(), { ...input, coach: false });
    expect(team).not.toHaveBeenCalled();
    expect(res).toEqual({
      readFailed: false,
      qualifiers: [
        { id: 'q1', name: 'Q q1', numRounds: 3, takenRoundNumbers: [2], isCompleted: false, playerEntered: true },
        { id: 'q2', name: 'Q q2', numRounds: 3, takenRoundNumbers: [], isCompleted: true, playerEntered: true },
      ],
    });
  });

  it('a coach is also offered the ROUND team’s other qualifiers (test ones left out), marked not entered, with their taken slots', async () => {
    let teamFilters: Filters = [];
    let takenFilters: Filters = [];
    tables.current = {
      golf_qualifier_entries: { data: [entry('q1')] },
      golf_qualifiers: (f) => {
        teamFilters = f;
        return { data: [{ id: 'q1', name: 'Q q1', num_rounds: 3, status: 'in_progress' }, { id: 'q3', name: 'Spring', num_rounds: 2, status: 'completed' }] };
      },
      golf_rounds: (f) => {
        takenFilters = f;
        return { data: [{ qualifier_id: 'q3', qualifier_round_number: 1 }] };
      },
    };
    const res = await readRoundTypeOptions(await createClient(), { ...input, coach: true });
    expect(has(teamFilters, 'eq', 'team_id', 'team-1')).toBe(true);
    expect(has(teamFilters, 'eq', 'is_test', false)).toBe(true);
    expect(res.qualifiers.map((q) => [q.id, q.playerEntered, q.isCompleted, q.takenRoundNumbers])).toEqual([
      ['q1', true, false, []],
      ['q3', false, true, [1]],
    ]);
    // The action's clash rule: this round excluded, abandoned rounds don't hold a slot.
    expect(has(takenFilters, 'neq', 'id', 'r1')).toBe(true);
    expect(has(takenFilters, 'neq', 'status', 'abandoned')).toBe(true);
    expect(has(takenFilters, 'in', 'qualifier_id', ['q1', 'q3'])).toBe(true);
  });

  it('a coach of a round with no team gets only the entered qualifiers, as on Fairway', async () => {
    const team = vi.fn(() => ({ data: [] }));
    tables.current = { golf_qualifier_entries: { data: [entry('q1')] }, golf_qualifiers: team, golf_rounds: { data: [] } };
    const res = await readRoundTypeOptions(await createClient(), { ...input, roundTeamId: null, coach: true });
    expect(team).not.toHaveBeenCalled();
    expect(res.qualifiers.map((q) => q.id)).toEqual(['q1']);
  });

  it.each([
    ['the entries', { golf_qualifier_entries: { error: { message: 'boom' } } }],
    ['the team’s qualifiers', { golf_qualifier_entries: { data: [] }, golf_qualifiers: { error: { message: 'boom' } } }],
    ['the taken slots', { golf_qualifier_entries: { data: [entry('q1')] }, golf_qualifiers: { data: [] }, golf_rounds: { error: { message: 'boom' } } }],
  ])('CH-11218 %s failing is "couldn’t tell", logged, never a shorter list', async (_, t) => {
    tables.current = t as never;
    await expect(readRoundTypeOptions(await createClient(), { ...input, coach: true })).resolves.toEqual({ qualifiers: [], readFailed: true });
    expect(logServer).toHaveBeenCalled();
  });

  it('nothing to offer is an honest empty list, without reading rounds', async () => {
    const rounds = vi.fn(() => ({ data: [] }));
    tables.current = { golf_qualifier_entries: { data: [] }, golf_qualifiers: { data: [] }, golf_rounds: rounds };
    await expect(readRoundTypeOptions(await createClient(), { ...input, coach: true })).resolves.toEqual({ qualifiers: [], readFailed: false });
    expect(rounds).not.toHaveBeenCalled();
  });
});

describe('loadRoundReview carries the type change for both viewers', () => {
  const row = { ...PREVIEW_REVIEW_ROUND, round_type: 'qualifier', team_id: 'team1', qualifier_id: 'q1', qualifier_round_number: 2, status: 'completed', is_test: false };
  const rounds = (f: Filters) => (has(f, 'select', 'qualifier_id, qualifier_round_number') ? { data: [] } : { data: row });

  it('the owning player: what the round counts as now, and their entered qualifiers', async () => {
    tables.current = { golf_rounds: rounds, golf_qualifier_entries: { data: [entry('q1')] }, golf_holes: { data: [] }, golf_shots: { data: [] } };
    const r = await loadRoundReview(row.id, { role: 'player', playerId: row.player_id });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.typeEdit.viewer).toBe('player');
    expect(r.typeEdit.current).toEqual({ type: 'qualifier', qualifierId: 'q1', roundNumber: 2 });
    expect(r.typeEdit.options.qualifiers.map((q) => q.id)).toEqual(['q1']);
  });

  it('a coach of the player’s team: the team’s qualifiers are read by the round’s team', async () => {
    let teamFilters: Filters = [];
    tables.current = {
      golf_rounds: rounds,
      golf_team_members: { data: [{ id: 'm1' }] },
      golf_qualifier_entries: { data: [] },
      golf_qualifiers: (f) => ((teamFilters = f), { data: [{ id: 'q5', name: 'Fall', num_rounds: 3, status: 'in_progress' }] }),
      golf_players: { data: { first_name: 'Ava', last_name: 'Lee' } },
      golf_holes: { data: [] },
      golf_shots: { data: [] },
    };
    const r = await loadRoundReview(row.id, { role: 'coach', teamId: 'team1' });
    expect(r.kind === 'ok' && r.typeEdit.viewer).toBe('coach');
    expect(r.kind === 'ok' && r.typeEdit.options.qualifiers).toEqual([{ id: 'q5', name: 'Fall', numRounds: 3, takenRoundNumbers: [], isCompleted: false, playerEntered: false }]);
    expect(has(teamFilters, 'eq', 'team_id', 'team1')).toBe(true);
  });

  it('a type outside the three editable ones reads as practice, as the Fairway editor reads it', () => {
    expect(currentRoundType({ round_type: 'qualifying', qualifier_id: 'q1', qualifier_round_number: 1 })).toEqual({ type: 'practice', qualifierId: null, roundNumber: null });
    expect(currentRoundType({ round_type: 'tournament' })).toEqual({ type: 'tournament', qualifierId: null, roundNumber: null });
  });
});

describe('CH-11522 Change round type on the review', () => {
  const edit = (over: Partial<ChReviewTypeEdit> = {}): ChReviewTypeEdit => ({
    viewer: 'player',
    current: { type: 'practice', qualifierId: null, roundNumber: null },
    options: { readFailed: false, qualifiers: [{ id: 'q1', name: 'Fall qualifier', numRounds: 3, takenRoundNumbers: [1], isCompleted: false, playerEntered: true }] },
    ...over,
  });

  it('is not drawn without a type change (the preview, a fixture)', () => {
    wrap(<RoundReview review={PREVIEW_REVIEW} />);
    expect(code('CH-11522')).toBeNull();
  });

  it('the player picks Qualifier, its first free round, and Save sends updateRoundType Fairway’s payload, then the page reads again', async () => {
    updateRoundType.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    wrap(<RoundReview review={PREVIEW_REVIEW} typeEdit={edit()} />);
    await user.click(within(code('CH-11522') as HTMLElement).getByRole('button', { name: 'Change round type' }));
    const sheet = code('CH-11521') as HTMLElement;
    await user.click(within(sheet).getByRole('radio', { name: 'Qualifier' }));
    // One entered qualifier is picked for them; round 1 is held by another round, so round 2 is chosen.
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateRoundType).toHaveBeenCalledWith({ roundId: PREVIEW_REVIEW.id, roundType: 'qualifier', qualifierId: 'q1', qualifierRoundNumber: 2 }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await waitFor(() => expect(document.body.textContent).toContain('This round now counts as round 2 of Fall qualifier'));
  });

  it('a coach is offered a qualifier the player isn’t in; it says the save enters them, and the toast says it did', async () => {
    updateRoundType.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const options = { readFailed: false, qualifiers: [{ id: 'q3', name: 'Spring qualifier', numRounds: 2, takenRoundNumbers: [], isCompleted: false, playerEntered: false }] };
    wrap(<RoundReview review={PREVIEW_REVIEW} typeEdit={edit({ viewer: 'coach', options })} />);
    await user.click(within(code('CH-11522') as HTMLElement).getByRole('button', { name: 'Change round type' }));
    const sheet = code('CH-11521') as HTMLElement;
    await user.click(within(sheet).getByRole('radio', { name: 'Qualifier' }));
    expect(sheet.textContent).toContain('Not entered yet. Saving enters the player in it.');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateRoundType).toHaveBeenCalledWith({ roundId: PREVIEW_REVIEW.id, roundType: 'qualifier', qualifierId: 'q3', qualifierRoundNumber: 1 }));
    await waitFor(() => expect(document.body.textContent).toContain('This round now counts as round 1 of Spring qualifier · the player was entered in it'));
  });

  it('CH-11316 a coach whose team has no qualifier is told to create one, not to ask a coach', async () => {
    const user = userEvent.setup();
    wrap(<RoundReview review={PREVIEW_REVIEW} typeEdit={edit({ viewer: 'coach', options: { readFailed: false, qualifiers: [] } })} />);
    await user.click(within(code('CH-11522') as HTMLElement).getByRole('button', { name: 'Change round type' }));
    await user.click(within(code('CH-11521') as HTMLElement).getByRole('radio', { name: 'Qualifier' }));
    expect(code('CH-11316')!.textContent).toBe('This team has no qualifier to add a round to. Create one, then change this round here.');
  });

  it('CH-11020 a refusal is the action’s toast, in the coach’s words for a coach; the sheet stays open', async () => {
    updateRoundType.mockResolvedValue({ success: false, error: "You don't have permission to change this round." });
    const user = userEvent.setup();
    wrap(<RoundReview review={PREVIEW_REVIEW} typeEdit={edit({ viewer: 'coach', current: { type: 'qualifier', qualifierId: 'q1', roundNumber: 2 } })} />);
    await user.click(within(code('CH-11522') as HTMLElement).getByRole('button', { name: 'Change round type' }));
    const sheet = code('CH-11521') as HTMLElement;
    await user.click(within(sheet).getByRole('radio', { name: 'Practice' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(code('CH-11020')).not.toBeNull());
    expect(updateRoundType).toHaveBeenCalledWith({ roundId: PREVIEW_REVIEW.id, roundType: 'practice', qualifierId: null, qualifierRoundNumber: null });
    expect(code('CH-11020')!.textContent).toContain('Only a coach of the team the round was played for can.');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('copy that follows the round and the viewer', () => {
  const q = { id: 'q1', name: 'Fall', numRounds: 3, takenRoundNumbers: [], isCompleted: true };

  it('a closed qualifier on a LIVE round says it must be reopened before the round can be submitted (submit_round_atomic refuses it)', () => {
    expect(qualifierHint(q, true)).toBe('Closed. It has to be reopened before this round can be submitted.');
    expect(qualifierHint(q, false)).toBe('Finished. Adding this round changes its final standings.');
    expect(qualifierHint({ ...q, isCompleted: false }, true)).toBe('3 rounds');
    expect(qualifierHint({ ...q, isCompleted: false, playerEntered: false }, false)).toBe('Not entered yet. Saving enters the player in it.');
  });

  it('savedLine names an entry the save made; a player’s permission refusal keeps the player’s words', () => {
    expect(savedLine({ type: 'qualifier', qualifierId: 'q1', roundNumber: 2 }, { ...q, playerEntered: false })).toBe('This round now counts as round 2 of Fall · the player was entered in it');
    expect(savedLine({ type: 'qualifier', qualifierId: 'q1', roundNumber: 2 }, q)).toBe('This round now counts as round 2 of Fall');
    expect(roundTypeFailure("You don't have permission to change this round.")).toMatch(/entered in it and an active member/);
    expect(roundTypeFailure("You don't have permission to change this round.", 'coach')).toMatch(/Only a coach of the team/);
  });
});

describe('setup: a qualifier the server says has no round (qualifierBlockedReason)', () => {
  it.each([
    [{ code: 'qualifier_round_limit_reached', error: 'This qualifier is still open, but your coach configured 2 rounds.' }, 2, 'All 2 rounds are in. Ask your coach to add a round if you need another.'],
    [{ error: 'You have more than one saved round for this qualifier. Do not start another one; use Continue Round so your existing scorecards stay intact.' }, 3, 'You have more than one saved round in this qualifier. Continue one from Rounds.'],
    [{ error: 'You are not entered in this qualifier' }, 3, 'You’re no longer entered in this qualifier. Ask your coach.'],
    [{ error: 'Qualifier not found' }, 3, 'This qualifier isn’t there any more. Ask your coach.'],
    [{ error: 'We could not verify your qualifier round history. Please try again.' }, 3, 'We couldn’t check this qualifier. Try again in a moment.'],
  ])('%j', (next, rounds, words) => {
    expect(qualifierBlockedReason(next, rounds)).toBe(words);
  });
});
