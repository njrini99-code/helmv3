import { LazyMotion, domAnimation } from 'motion/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A task notification (`?task=<id>`) opens Team Hub on that task: its row scrolls into view and is lit once. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn(), createEnrichedAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(), updateAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn(), createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), getPreviewUrl: vi.fn(), uploadGolfDocument: vi.fn() }));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ respondToEvent: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ completeTask: vi.fn(), uncompleteTask: vi.fn(), createTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ createGolfTravelItinerary: vi.fn(), getTravelerClassConflicts: vi.fn() }));

import { TeamHub, type ChHubTab } from '../screens/hub/TeamHub';
import type { ChTeamHub } from '../data/hub';
import type { ChHubWrites } from '../screens/hub/writes';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_PLAYER } from '../preview/fixtures-hub';

const ok = () => Promise.resolve({ success: true });
const writes = new Proxy({} as ChHubWrites, { get: () => vi.fn(ok) });

const scrolled: Array<{ el: Element; opts: unknown }> = [];
const original = Element.prototype.scrollIntoView;
beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
    scrolled.push({ el: this, opts });
  } as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

function hub(data: ChTeamHub, tab: ChHubTab | undefined, focusTask: string | null, focusTrip: string | null = null) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <TeamHub data={data} writes={writes} initialTab={tab} viewerName="Maya Reyes" focusTask={focusTask} focusTrip={focusTrip} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
}
const rowOf = (title: string) => screen.getAllByText(title).map((e) => e.closest('.ch-hb-task')).find(Boolean) as HTMLElement;

describe('100103 Team Hub · a notification’s task', () => {
  it('a coach on the Tasks tab: the row is scrolled to and lit, and no other row is', async () => {
    render(hub(PREVIEW_HUB_COACH, 'tasks', 't2'));
    await waitFor(() => expect(scrolled).toHaveLength(1));
    const row = rowOf('Post two practice rounds');
    expect(scrolled[0]!.el).toBe(row);
    expect(row.className).toMatch(/is-focus/);
    expect(rowOf('Sign travel waiver').className).not.toMatch(/is-focus/);
  });

  it('a player on Home: the task in Your tasks is scrolled to; the wash clears when its fade ends', async () => {
    render(hub(PREVIEW_HUB_PLAYER, undefined, 't1'));
    await waitFor(() => expect(scrolled).toHaveLength(1));
    const row = rowOf('Sign travel waiver');
    expect(scrolled[0]!.el).toBe(row);
    expect(row.className).toMatch(/\bis-focus\b/);
    fireEvent.animationEnd(row);
    expect(row.className).not.toMatch(/is-focus/);
  });

  it('only once: completing the task re-renders the list without scrolling back, and a rerender does not either', async () => {
    const user = userEvent.setup();
    const view = render(hub(PREVIEW_HUB_PLAYER, undefined, 't1'));
    await waitFor(() => expect(scrolled).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Sign travel waiver' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign travel waiver, done' })).toBeTruthy());
    view.rerender(hub(PREVIEW_HUB_PLAYER, undefined, 't1'));
    expect(scrolled).toHaveLength(1);
  });

  it('a task that is not in the shown rows is left alone', async () => {
    render(hub(PREVIEW_HUB_COACH, 'tasks', 'not-here'));
    await screen.findAllByText('Post two practice rounds');
    expect(scrolled).toHaveLength(0);
    expect(document.querySelector('.ch-hb-task.is-focus, .ch-hb-task.is-focus-still')).toBeNull();
  });
});

describe('Team Hub · the trip Calendar’s View itinerary names (?tab=travel&trip=)', () => {
  const passOf = (name: string) => screen.getAllByText(name).map((e) => e.closest('.ch-hb-pass')).find(Boolean) as HTMLElement;

  it('Travel scrolls that trip into view once, for a later trip as for the next one', async () => {
    const view = render(hub(PREVIEW_HUB_COACH, 'travel', null, 'sea'));
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0]!.el).toBe(passOf('Seahawk Intercollegiate'));
    view.rerender(hub(PREVIEW_HUB_COACH, 'travel', null, 'sea'));
    expect(scrolled).toHaveLength(1);
  });

  it('a trip that is not in the shown rows is left alone', async () => {
    render(hub(PREVIEW_HUB_PLAYER, 'travel', null, 'not-here'));
    await screen.findAllByText('Carolina Fall Invitational');
    expect(scrolled).toHaveLength(0);
  });
});
