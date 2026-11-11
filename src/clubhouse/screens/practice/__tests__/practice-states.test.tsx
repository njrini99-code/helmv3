import { render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChPlayerPracticeHome, ChPracticeHome } from '../../../data/practice-home-shape';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../preview/fixtures-practice-plan';
import { toSheetModel } from '../../coachhelm/plan/sheet/plan-sheet-model';
import HelperSession, { readRun } from '../builder/HelperSession';
import { CoachPlanBar, type ChPlanStatus } from '../CoachPlanBar';
import { DayStrip, dayStripLabel } from '../DayStrip';
import { PlayerPracticeHome } from '../PlayerPracticeHome';
import { PracticeHome } from '../PracticeHome';
import { PrintStudio, printSummary } from '../PrintStudio';

const chat = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../coachhelm/plan/PrintPlan', () => ({ printNode: vi.fn(), printPlan: vi.fn() }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ takeDownPracticePlan: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({ postPracticePlanToChat: vi.fn() }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: vi.fn(), copyPlanBody: vi.fn() }));
vi.mock('@/components/golf/coachhelm/chat/useCoachHelmChat', () => ({ useCoachHelmChat: (...a: unknown[]) => chat(...a) }));

const status: ChPlanStatus = { planId: 'p1', title: 'Plan', version: 2, status: 'published', edited: false, seen: { names: ['Sofia'], of: 9 } };

describe('the plan page says which of three states a plan is in', () => {
  const words = (s: ChPlanStatus) => {
    const { container, unmount } = render(<CoachPlanBar status={s} />);
    const bar = container.querySelector('.ch-prc-planbar')!;
    const out = { state: bar.getAttribute('data-state'), text: bar.querySelector('.ch-prc-planbar__s')!.textContent ?? '' };
    unmount();
    return out;
  };
  it('a draft, a published plan and a published plan with edits never read alike', () => {
    const draft = words({ ...status, status: 'draft', seen: null });
    const live = words(status);
    const edited = words({ ...status, edited: true });
    expect(draft).toEqual({ state: 'draft', text: expect.stringContaining('Only coaches can see this') });
    expect(live).toEqual({ state: 'live', text: expect.stringContaining('Players have this plan') });
    expect(edited).toEqual({ state: 'edited', text: expect.stringContaining('as you last published it') });
    expect(new Set([draft.text, live.text, edited.text]).size).toBe(3);
  });
  it('a draft never claims players have it, and edits never read as published and current', () => {
    expect(words({ ...status, status: 'draft', seen: null }).text).not.toMatch(/Published|Players have/);
    expect(words({ ...status, edited: true }).text).not.toMatch(/Players have this plan/);
  });
});

describe('print says what it is missing and what it will send', () => {
  const plan = toSheetModel({ body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: 'Short game', team: 'Demo', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach');
  it('a drills read that failed is said, not drawn as a plan with no drills', () => {
    render(<PrintStudio plan={plan} drills={[]} drillsUnread planHref="/x" />);
    expect(screen.getByText('This plan’s drills didn’t load')).toBeTruthy();
    expect(screen.getByText(/there is no drills appendix/)).toBeTruthy();
  });
  it('a plan that names no drills says nothing of the kind', () => {
    render(<PrintStudio plan={plan} drills={[]} planHref="/x" />);
    expect(screen.queryByText('This plan’s drills didn’t load')).toBeNull();
  });
  it('counts the sheets before the press, by piece', () => {
    expect(printSummary([])).toBe('Nothing to print yet');
    expect(printSummary([{ part: 'Coach copy' }, { part: 'Coach copy' }])).toBe('2 sheets · Coach copy');
    expect(printSummary([{ part: 'Coach copy' }, { part: 'Coach copy' }, { part: 'Range board' }, { part: 'Drills appendix' }, { part: 'Drills appendix' }, { part: 'Drills appendix' }])).toBe('6 sheets · Coach copy 2 · Range board 1 · Drills appendix 3');
    const { container } = render(<PrintStudio plan={plan} drills={[]} planHref="/x" />);
    expect(container.querySelector('[data-ch="print-count"]')?.textContent).toContain('3 sheets · Coach copy 2 · Range board 1');
  });
  it('nothing in a printed sheet can be pressed', () => {
    const { container } = render(<PrintStudio plan={plan} drills={[{ name: 'Lag ladder', line: 'Putting · 20 min', setup: 'Tees.', goal: 'Inside 3 feet.' }]} planHref="/x" />);
    expect(container.querySelectorAll('.ch-prt-page :is(button, a, input, select, [role="switch"])').length).toBe(0);
  });
});

describe('the day to scale', () => {
  it('says in words what it draws: blocks and minutes, then what is suggested and what is open', () => {
    expect(dayStripLabel([{ id: 'a', min: 30 }, { id: 'b', min: 60, tone: 'skill' }, { id: 'g', min: 15, tone: 'ghost' }, { id: 'o', min: 75, tone: 'open' }])).toBe('2 blocks, 1 h 30, 15 min suggested, 1 h 15 open');
  });
  it('a segment is as wide as its minutes, and an empty day draws nothing', () => {
    const { container, rerender } = render(<DayStrip segs={[{ id: 'a', min: 30 }, { id: 'b', min: 90, tone: 'pressure' }]} />);
    const segs = [...container.querySelectorAll<HTMLElement>('.ch-prc-day__bar i')];
    expect(segs.map((s) => s.style.flexGrow)).toEqual(['30', '90']);
    expect(segs[1]!.getAttribute('data-tone')).toBe('pressure');
    rerender(<DayStrip segs={[]} />);
    expect(container.querySelector('.ch-prc-day')).toBeNull();
  });
});

describe('the builder’s helper', () => {
  const planPart = { type: 'data-practice-plan', id: 'plan-1', data: PP_PLAN_PART };
  const said = (parts: unknown[]): UIMessage => ({ id: 'm1', role: 'assistant', parts } as unknown as UIMessage);
  beforeEach(() => chat.mockReset());
  it('reads the drafted plan from the stream’s plan part, the newest one', () => {
    const run = readRun([said([{ type: 'text', text: 'Reading your rounds.' }, planPart]), said([{ ...planPart, data: { ...PP_PLAN_PART, title: 'Second' } }])]);
    expect(run.plan?.title).toBe('Second');
    expect(readRun([said([{ type: 'text', text: 'One question first.' }])])).toEqual({ plan: null, brief: null, said: 'One question first.' });
  });
  it('asks on the practice helper’s own surface, once, and hands the builder the plan it drafts', () => {
    const send = vi.fn();
    chat.mockReturnValue({ messages: [said([planPart])], send, busy: false, error: undefined });
    const onPlan = vi.fn();
    const { rerender } = render(<HelperSession request="Fill the draft" onPlan={onPlan} onDone={vi.fn()} />);
    rerender(<HelperSession request="Fill the draft" onPlan={onPlan} onDone={vi.fn()} />);
    expect(chat).toHaveBeenCalledWith({ surface: 'practice_helper' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Fill the draft');
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![0].draft.body.variants.main.blocks.length).toBeGreaterThan(0);
  });
  it('a failed run reports itself and hands over no plan', () => {
    chat.mockReturnValue({ messages: [], send: vi.fn(), busy: false, error: new Error('x') });
    const onPlan = vi.fn();
    const onDone = vi.fn();
    render(<HelperSession request="Fill the draft" onPlan={onPlan} onDone={onDone} />);
    expect(onPlan).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({ failed: true, said: '', busy: false });
  });
});

const HOME: ChPracticeHome = { teamName: 'Demo', week: [], weekLine: null, upNext: null, drafts: [], published: [], past: [], open: [{ id: 'e', label: 'Thursday, Nov 5', detail: '2:00 to 5:00 PM', title: 'Practice', place: '', allDay: false }], copies: [], roster: [], firstRun: true };

describe('Practice home', () => {
  it('first run offers three starts, and none when there is no practice to plan', () => {
    const { unmount } = render(<PracticeHome data={HOME} />);
    const card = screen.getByText('Plan your first practice').closest('section')!;
    expect(within(card).getByRole('button', { name: /Ask CoachHelm/ })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /Blank/ })).toBeTruthy();
    expect(within(card).getByRole('link', { name: /Start from a template/ }).getAttribute('href')).toBe('/golf/dashboard/practice/templates');
    unmount();
    render(<PracticeHome data={{ ...HOME, open: [] }} />);
    expect(screen.queryByRole('button', { name: /Ask CoachHelm/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Add a practice' })).toBeTruthy();
  });
  it('Up next says whether players have the plan, and draws the day only from real lengths', () => {
    const up = { title: 'Thursday practice', when: 'Thu, Nov 5', rows: [{ time: '2:00', title: 'Warm-up', place: 'Range', min: 30 }, { time: '2:30', title: 'Rotation', place: '3 stations', min: 60 }], state: 'Draft' as const, planHref: null, editHref: '/e', eventId: null };
    const { container, unmount } = render(<PracticeHome data={{ ...HOME, firstRun: false, upNext: up }} />);
    const card = container.querySelector('.ch-prc-next')!;
    expect(within(card as HTMLElement).getByText('Draft')).toBeTruthy();
    expect(card.querySelector('.ch-prc-day__bar')?.getAttribute('aria-label')).toBe('2 blocks, 1 h 30');
    unmount();
    const bare = render(<PracticeHome data={{ ...HOME, firstRun: false, upNext: { ...up, rows: up.rows.map(({ min: _m, ...r }) => r) } }} />);
    expect(bare.container.querySelector('.ch-prc-day')).toBeNull();
  });
  it('a past plan reads Ended, and edits not yet published are said on the row', () => {
    render(<PracticeHome data={{ ...HOME, firstRun: false, published: [{ id: 'c', day: 'Tue', title: 'Tune-up', time: '3:00', line: '', state: 'Updated', href: '/c', edits: true }], drafts: [{ id: 'd', day: 'Wed', title: 'Old', time: '3:00', line: '', state: 'Done', href: '/d' }] }} />);
    expect(screen.getByText('Edits not published')).toBeTruthy();
    expect(screen.getByText('Ended')).toBeTruthy();
  });
});

describe('the player’s Practice', () => {
  const data: ChPlayerPracticeHome = {
    next: { planHref: '/p', title: 'Thursday practice', when: '2:00 to 5:00 PM', context: 'Thursday · Group B', focus: 'Putts inside 6 feet.', group: { name: 'B', me: 'Jonah', mates: ['Eli', 'Owen'] }, stops: [{ time: '2:00', place: 'Range', line: 'Warm-up' }, { time: '2:30', place: 'Green, back', line: 'Lag ladder', now: true }, { time: '2:50', place: 'Chipping green', line: 'Up and down', next: true }, { time: '3:10', place: 'Green, front', line: 'Clock drill' }, { time: '3:30', place: 'To the course', line: '' }] },
    week: [],
    upcoming: [],
    past: [],
  };
  it('leads with their own next practice: focus, their group, and the stop that is on now', () => {
    render(<PlayerPracticeHome data={data} />);
    expect(screen.getByText('Putts inside 6 feet.')).toBeTruthy();
    expect(screen.getByText('Group B')).toBeTruthy();
    const stops = screen.getByLabelText('Your stops');
    expect(within(stops).queryByText('Range')).toBeNull();
    expect(within(stops).getByText('Now')).toBeTruthy();
    expect(within(stops).getByText('Next')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open plan · 5 stops' }).getAttribute('href')).toBe('/p');
  });
  it('has no way to make, edit or publish a plan', () => {
    render(<PlayerPracticeHome data={data} />);
    expect(screen.queryByRole('button', { name: /New plan|Edit|Publish/ })).toBeNull();
    expect(screen.queryByText(/Because|Draft/)).toBeNull();
  });
});
