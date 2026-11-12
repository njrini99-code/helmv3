import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChBuilderData } from '../../../data/practice-home-shape';
import { askWords, emptyBody, leaveAskPicks, lengthChoices, takeAskPicks } from '../builder/builder-model';
import { Builder } from '../builder/Builder';
import { NewPlanSheet } from '../NewPlanSheet';

/**
 * New plan › Ask CoachHelm (S-BLD.new-sheet): the sheet asks how long and what to work on, and both go in the helper's first message, sent through the chat hook's
 * own `send`. Nothing here restyles or reaches into the thread.
 */
const push = vi.fn();
const save = vi.fn();
const helper = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../coachhelm/plan/PrintPlan', () => ({ printNode: vi.fn(), printPlan: vi.fn() }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: (...a: unknown[]) => save(...a), copyPlanBody: vi.fn(), deletePracticePlan: vi.fn() }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: vi.fn() }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ updateGolfEvent: vi.fn() }));
vi.mock('../builder/HelperSession', () => ({ default: (p: { request: string }) => (helper(p.request), null) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  push.mockReset();
  helper.mockReset();
  save.mockReset().mockResolvedValue({ success: true, planId: 'p9', version: 1, updatedAt: null });
  window.sessionStorage.clear();
});

const events = [
  { id: 'e1', label: 'Thursday, Nov 5', detail: '2:00 to 5:00 PM · Lakeside', title: 'Thursday practice', place: 'Lakeside', allDay: false, minutes: 180 },
  { id: 'e2', label: 'Friday, Nov 6', detail: '3:00 PM · Lakeside', title: 'Friday practice', place: 'Lakeside', allDay: false, minutes: null },
];
const sheet = () => render(<NewPlanSheet open onClose={vi.fn()} events={events} copies={[]} roster={['r1']} zone="America/New_York" />);
const picked = (name: string) => (screen.getByRole('radiogroup', { name: 'How long', hidden: true }).querySelector('[aria-checked="true"]') as HTMLElement | null)?.textContent === name;

describe('the picks, as words', () => {
  it('offers the calendar’s window and the two half-hours under it', () => {
    expect(lengthChoices(180)).toEqual([120, 150, 180]);
    expect(lengthChoices(75)).toEqual([45, 75]); // 15 minutes is not a practice
    expect(lengthChoices(45)).toEqual([60, 90, 120]); // too short a window to cut down
    expect(lengthChoices(null)).toEqual([60, 90, 120]);
  });
  it('says the length and the work, or nothing when nothing was picked', () => {
    expect(askWords({ minutes: 150, areas: ['Putting', 'Short game'] })).toBe('Make it 2 h 30 long. Work on putting and short game');
    expect(askWords({ minutes: null, areas: ['Putting', 'Approach', 'Pressure'] })).toBe('Work on putting, approach and pressure');
    expect(askWords({ minutes: 120, areas: [] })).toBe('Make it 2 h long');
    expect(askWords({ minutes: null, areas: [] })).toBe('');
    expect(askWords(null)).toBe('');
  });
  it('are left for one builder and taken once; anything that is not a pick is dropped', () => {
    leaveAskPicks('p1', { minutes: 150, areas: ['Putting'] });
    expect(takeAskPicks('p2')).toBeNull();
    expect(takeAskPicks('p1')).toEqual({ minutes: 150, areas: ['Putting'] });
    expect(takeAskPicks('p1')).toBeNull();
    window.sessionStorage.setItem('ch-prc-ask:p3', JSON.stringify({ minutes: 9000, areas: ['Putting', 7, null] }));
    expect(takeAskPicks('p3')).toEqual({ minutes: null, areas: ['Putting'] });
    window.sessionStorage.setItem('ch-prc-ask:p4', 'not json');
    expect(takeAskPicks('p4')).toBeNull();
  });
});

describe('New plan, Ask CoachHelm picked', () => {
  it('asks how long, starting on the calendar’s window, and what to work on, starting on nothing', () => {
    sheet();
    expect(screen.getByText('What should Thursday cover?')).toBeTruthy();
    expect(picked('3 h')).toBe(true);
    expect(screen.getByText('Your calendar has 2:00 to 5:00 PM.')).toBeTruthy();
    const work = screen.getByRole('group', { name: 'Work on', hidden: true });
    expect(within(work).getAllByRole('button', { hidden: true }).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByText('Pick none and CoachHelm goes by your team’s numbers.')).toBeTruthy();
  });
  it('asks nothing for Blank, and the press is Create plan again', () => {
    sheet();
    fireEvent.click(screen.getByRole('radio', { name: /^Blank/, hidden: true }));
    expect(screen.queryByText('What should Thursday cover?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create plan', hidden: true })).toBeTruthy();
  });
  it('a practice with no end time offers three usual lengths and picks none for the coach', () => {
    sheet();
    fireEvent.click(screen.getByRole('radio', { name: /Friday, Nov 6/, hidden: true }));
    expect(screen.getByText('This practice has no end time on the calendar.')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'How long', hidden: true }).querySelector('[aria-checked="true"]')).toBeNull();
  });
  it('Build plan saves an empty draft, leaves both picks for the builder, and opens it filling', async () => {
    sheet();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'How long', hidden: true })).getByRole('radio', { name: '2 h 30', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Putting', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Pressure', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Build plan', hidden: true }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/golf/dashboard/practice/plan/p9/edit?fill=1'));
    expect(save.mock.calls[0]![0].body.variants.main.blocks).toEqual([]);
    expect(takeAskPicks('p9')).toEqual({ minutes: 150, areas: ['Putting', 'Pressure'] });
  });
});

const data = (planId: string): ChBuilderData => ({
  planId,
  teamId: 't',
  eventId: 'e1',
  version: 1,
  status: 'draft',
  edited: false,
  title: 'Thursday practice',
  meta: 'Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside',
  dayWord: 'Thursday',
  start: '2026-11-05T19:00:00Z',
  end: '2026-11-05T22:00:00Z',
  zone: 'America/New_York',
  team: 'Demo',
  coaches: ['Coach Lin'],
  roster: [{ id: 'r1', name: 'Sofia Reed' }],
  body: emptyBody('Lakeside', ['r1'], false),
  why: {},
  step: 'blocks',
  drills: [],
  helperOn: true,
  facts: [],
});

describe('the builder, opened from that sheet', () => {
  it('puts both picks in the helper’s first message', async () => {
    leaveAskPicks('p9', { minutes: 150, areas: ['Putting', 'Pressure'] });
    await act(async () => {
      render(<Builder data={data('p9')} autoFill />);
    });
    await waitFor(() => expect(helper).toHaveBeenCalled());
    const request = helper.mock.calls[0]![0] as string;
    expect(request).toContain('Fill the draft for Thursday practice');
    expect(request).toContain('The coach says: Make it 2 h 30 long. Work on putting and pressure.');
    expect(request).not.toContain('Use your best guesses');
  });
  it('with nothing picked, asks with best guesses, as before', async () => {
    await act(async () => {
      render(<Builder data={data('p8')} autoFill />);
    });
    await waitFor(() => expect(helper).toHaveBeenCalled());
    expect(helper.mock.calls[0]![0]).toContain('Use your best guesses.');
  });
});
