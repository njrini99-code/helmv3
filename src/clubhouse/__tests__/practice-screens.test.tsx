import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const del = vi.fn();
const copy = vi.fn();
const push = vi.fn();
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: (...a: unknown[]) => save(...a), deletePracticePlan: (...a: unknown[]) => del(...a), copyPlanBody: (...a: unknown[]) => copy(...a), recordPracticePlanOpen: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({ savePracticePlanDraft: (...a: unknown[]) => saveDraft(...a), undoPracticePlanDraft: vi.fn(), listPlanFolders: async () => ({ folders: [] }) }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: (...a: unknown[]) => publish(...a) }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: vi.fn() }));
vi.mock('@/components/golf/coachhelm/chat/useCoachHelmChat', () => ({ useCoachHelmChat: () => ({ messages: [], busy: false, error: undefined, send: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/practice', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { emptyBody, makeBlock, addBlock } from '../screens/practice/builder/builder-model';
import { Builder, type BuilderPreview } from '../screens/practice/builder/Builder';
import { NewPlanSheet } from '../screens/practice/NewPlanSheet';
import { PlayerPracticeHome } from '../screens/practice/PlayerPracticeHome';
import { PracticeHome } from '../screens/practice/PracticeHome';
import { CH_NAV_PRACTICE, isRebuilt, navFor, phonePushedTop, phoneSectionsFor } from '../shell/nav';
import type { ChBuilderData, ChPracticeHome } from '../data/practice-home-shape';
import { PT_PLAN } from '../preview/fixtures-practice-thread';
import { ToastProvider } from '../ui/Toast';

const ROSTER = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Ava Lind' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Eli Brandt' }];
const data = (over: Partial<ChBuilderData> = {}): ChBuilderData => ({
  planId: 'plan-1',
  teamId: 'team-1',
  eventId: 'event-1',
  version: 4,
  status: 'draft',
  edited: false,
  title: 'Thursday practice',
  meta: 'Thu, Nov 5 · 2:00 to 5:00 PM',
  dayWord: 'Thursday',
  start: '2026-11-05T19:00:00Z',
  end: '2026-11-05T22:00:00Z',
  zone: 'America/New_York',
  team: 'Demo',
  coaches: ['Coach Lin'],
  roster: ROSTER,
  body: emptyBody('Lakeside', ROSTER.map((r) => r.id), false),
  why: {},
  step: 'blocks',
  drills: [{ ref: 'lib:d1', name: 'Gate drill', area: 'Putting', kind: 'skill', minutes: 45, source: 'GolfHelm' }],
  helperOn: true,
  facts: [{ lead: 'Putting', text: 'loses 0.9 a round' }],
  ...over,
});
const show = (d: ChBuilderData, preview?: BuilderPreview) =>
  render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <ToastProvider>
          <Builder data={d} preview={preview} />
        </ToastProvider>
      </div>
    </LazyMotion>,
  );

beforeEach(() => {
  [save, saveDraft, publish, del, copy, push].forEach((f) => f.mockReset());
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Practice in the nav', () => {
  it('flag on: after Calendar, for both roles, beside Tournaments when that is on too', () => {
    for (const role of ['coach', 'player'] as const) {
      const ids = navFor(role, { tournaments: true }).map((i) => i.id);
      expect(ids[ids.indexOf('calendar') + 1]).toBe('practice');
      expect(ids).toContain('tournaments');
      expect(phoneSectionsFor(role, { }).some((i) => i.id === 'practice')).toBe(true);
    }
    expect(CH_NAV_PRACTICE.href).toBe('/golf/dashboard/practice');
  });
  it('its addresses are rebuilt routes, so the page decides; the builder pushes in from Practice', () => {
    expect(isRebuilt('/golf/dashboard/practice', 'coach')).toBe(true);
    expect(isRebuilt('/golf/dashboard/practice/plan/abc/edit', 'coach')).toBe(true);
    expect(phonePushedTop('/golf/dashboard/practice/plan/abc/edit', 'coach')).toMatchObject({ back: 'Practice', parent: '/golf/dashboard/practice' });
    expect(phonePushedTop('/golf/dashboard/practice/plan/abc/edit', 'player')).toBeNull();
  });
});

const HOME: ChPracticeHome = { teamName: 'Demo', week: [], weekLine: null, upNext: null, drafts: [], published: [], past: [], open: [], copies: [], roster: [], firstRun: true };

describe('the landing', () => {
  it('CH-13396 first run: one card, no empty headers, New plan on the page', () => {
    render(<PracticeHome data={{ ...HOME, open: [{ id: 'e', label: 'Thursday, Nov 5', detail: '2:00 to 5:00 PM', title: 'Practice', place: '', allDay: false }] }} />);
    expect(screen.getByText('Plan your first practice')).toBeTruthy();
    expect(screen.queryByText('Drafts')).toBeNull();
    expect(screen.getAllByRole('button', { name: /New plan/ }).length).toBeGreaterThan(0);
  });
  it('CH-13396 a coach with plans and no practice coming is told what to do about it, and the plans still list', () => {
    render(<PracticeHome data={{ ...HOME, firstRun: false, past: [{ id: 'a', day: 'Tue', title: 'Old', time: '3:00', line: '', state: 'Done', href: '/x' }] }} />);
    // The week's tiles say "No practice" day by day: the words under them don't say it again.
    expect(screen.getByText('Add a practice on the calendar')).toBeTruthy();
    expect(screen.getByText('Then plan it here.')).toBeTruthy();
    expect(screen.queryByText(/No practices? this week/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to Calendar' }).getAttribute('href')).toBe('/golf/dashboard/calendar');
    expect(screen.getByRole('button', { name: /Past plans \(1\)/ })).toBeTruthy();
  });
  it('CH-13397 a player with nothing published is told so, with no New plan', () => {
    render(<PlayerPracticeHome data={{ next: null, week: [], upcoming: [], past: [] }} />);
    expect(screen.getByText(/hasn’t published a plan/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New plan/ })).toBeNull();
  });
});

describe('New plan (CH-13395)', () => {
  const events = [
    { id: 'e1', label: 'Thursday, Nov 5', detail: '2:00 to 5:00 PM · Lakeside', title: 'Thursday practice', place: 'Lakeside', allDay: false },
    { id: 'e2', label: 'Monday, Nov 9', detail: 'All day', title: 'Monday practice', place: '', allDay: true },
  ];
  const sheet = () => render(<NewPlanSheet open onClose={vi.fn()} events={events} copies={[]} roster={ROSTER.map((r) => r.id)} />);

  it('CH-13181 an all-day practice is listed and can’t be picked', () => {
    sheet();
    const row = screen.getByRole('radio', { name: /Monday, Nov 9/, hidden: true }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain('Give this practice a start and end time');
  });
  it('Ask CoachHelm saves an empty plan and opens the builder filling', async () => {
    save.mockResolvedValue({ success: true, planId: 'p', version: 1, updatedAt: null });
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Build plan', hidden: true }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/golf/dashboard/practice/plan/p/edit?fill=1'));
    expect(save.mock.calls[0]![0].body.variants.main.blocks).toEqual([]);
  });
  it('CH-13580 another coach got there first: says so and opens nothing', async () => {
    save.mockResolvedValue({ success: false, error: 'stale', stale: true });
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Build plan', hidden: true }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});

describe('the builder', () => {
  it('flag off: no helper card, and the plan is still editable', () => {
    show(data({ helperOn: false }));
    expect(screen.queryByText('Fill this plan')).toBeNull();
    expect(screen.getByText('No blocks yet')).toBeTruthy();
  });

  it('flag on: the helper leads with what was read, and nothing saves until something changes', async () => {
    show(data());
    expect(screen.getByRole('button', { name: 'Fill this plan' })).toBeTruthy();
    expect(screen.getByText('loses 0.9 a round', { exact: false })).toBeTruthy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    expect(save).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('an edit saves 800ms later, by id, with the version it read, and the next with the one it got back', async () => {
    save.mockResolvedValueOnce({ success: true, planId: 'plan-1', version: 5, updatedAt: null }).mockResolvedValueOnce({ success: true, planId: 'plan-1', version: 6, updatedAt: null });
    show(data());
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan title' }), { target: { value: 'Short game day' } });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(save.mock.calls[0]![0]).toMatchObject({ planId: 'plan-1', expectedVersion: 4, title: 'Short game day' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan title' }), { target: { value: 'Wedges' } });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(save.mock.calls[1]![0]).toMatchObject({ expectedVersion: 5, title: 'Wedges' });
  });

  it('CH-13580 a stale save stops and offers Load latest, without overwriting', async () => {
    save.mockResolvedValue({ success: false, error: 'stale', stale: true });
    show(data());
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan title' }), { target: { value: 'Wedges' } });
    expect(await screen.findByRole('button', { name: 'Load latest' }, { timeout: 2000 })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('CH-13080 three failures in a row ask; Try again retries', async () => {
    save.mockResolvedValue({ success: false, error: 'nope' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show(data());
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan title' }), { target: { value: 'Wedges' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800 + 2000 + 2000 + 100);
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('CH-13084 offline keeps the plan on this device and says so', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    show(data());
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan title' }), { target: { value: 'Wedges' } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Offline'), { timeout: 2000 });
    expect(save).not.toHaveBeenCalled();
    online.mockRestore();
    window.sessionStorage.clear();
  });

  it('CH-13581 CH-13895 a block’s inspector edits it, and Delete has Undo', async () => {
    const body = addBlock(emptyBody('Lakeside', [], false), makeBlock('team', emptyBody('Lakeside', [], false), 'a'));
    show(data({ body }), {});
    fireEvent.click(screen.getByRole('button', { name: /^2:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'More, Length' }));
    expect(screen.getByText('35 min of 3 h')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Delete block/ }));
    expect(screen.queryByRole('button', { name: /^2:00/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: /^2:00/ })).toBeTruthy();
  });

  it('suggestions: nothing joins the plan until kept, Remove takes one away, Keep all keeps the rest, and the Why goes beside the body', async () => {
    saveDraft.mockResolvedValue({ success: true, planId: 'plan-1', version: 5, documentId: null, folder: 'Practice plans', created: false, savedAt: '' });
    show(data(), { ghosts: PT_PLAN });
    const ghosts = () => screen.queryAllByRole('listitem').filter((l) => l.getAttribute('data-ch') === 'ghost-block');
    const n = ghosts().length;
    expect(n).toBeGreaterThan(1);
    expect(screen.getByText('0 of 3 h')).toBeTruthy();
    fireEvent.click(within(ghosts()[0]!).getByRole('button', { name: /^Remove/ }));
    expect(ghosts()).toHaveLength(n - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep all' }));
    expect(ghosts()).toHaveLength(0);
    expect(screen.getByText(/suggestions kept/)).toBeTruthy();
  });

  it('CH-13180 CH-13896 a drill longer than its slot warns and doesn’t block', () => {
    const base = emptyBody('Lakeside', [], false);
    const team = { ...makeBlock('team', base, 't'), len: 30, drill: { src: 'lib', id: 'd1' } } as Parameters<typeof addBlock>[1];
    show(data({ body: addBlock(base, team), step: 'drills' }), {});
    expect(screen.getByText('Drill runs 45 min; turn is 30.')).toBeTruthy();
  });

  it('CH-13582 Split evenly deals every player into lettered groups', () => {
    show(data({ step: 'groups' }), {});
    fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split', hidden: true }));
    expect(screen.getByLabelText('Group A')).toBeTruthy();
    expect(screen.getByLabelText('Group B')).toBeTruthy();
  });

  it('Review refuses to publish an empty plan and links the problem', () => {
    show(data({ step: 'review' }), {});
    expect(screen.getByText(/Fix 1 problem to publish/)).toBeTruthy();
    // One Publish key on a Mac, the head's: Review's own strip doesn't draw a second.
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('CH-13081 Publish confirms first, then publishes the saved version and tells who', async () => {
    publish.mockResolvedValue({ success: true, version: 4, recipients: 3, documentId: null, firstPublish: true });
    const base = emptyBody('Lakeside', ROSTER.map((r) => r.id), false);
    show(data({ body: addBlock(base, makeBlock('team', base, 't')), step: 'review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(publish).not.toHaveBeenCalled();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(screen.getByRole('button', { name: /Publish to 3 people/, hidden: true }));
      await screen.findByText('Publishing in 8 seconds');
      // Nothing is written or sent until the hold runs out.
      await act(() => vi.advanceTimersByTimeAsync(7000));
      expect(publish).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await waitFor(() => expect(publish).toHaveBeenCalledWith({ planId: 'plan-1', expectedVersion: 4, notify: 'now' }));
      await waitFor(() => expect(push).toHaveBeenCalledWith('/golf/dashboard/practice/plan/plan-1'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('Undo inside the 8 second hold publishes nothing and tells nobody', async () => {
    const base = emptyBody('Lakeside', ROSTER.map((r) => r.id), false);
    show(data({ body: addBlock(base, makeBlock('team', base, 't')), step: 'review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(screen.getByRole('button', { name: /Publish to 3 people/, hidden: true }));
      fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
      await act(() => vi.advanceTimersByTimeAsync(9000));
      expect(publish).not.toHaveBeenCalled();
      expect(screen.getByText('Not published. Nobody was told.')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CH-13082 Delete draft asks first and stays put when refused; CH-13083 is the bank’s toast', async () => {
    del.mockResolvedValue({ success: false, error: 'no' });
    const base = emptyBody('Lakeside', [], false);
    show(data({ body: addBlock(base, makeBlock('team', base, 't')), step: 'review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete', hidden: true }));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ planId: 'plan-1' }));
    expect(push).not.toHaveBeenCalled();
  });
});
