import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coach Home parity with Player Home (spec B, docs/clubhouse/pages/P002-home): the team's four parts, "Waiting on you",
 * the CoachHelm action from a player and the Week's Next row. The catalog codes are in home.test.tsx (22401); this file
 * holds the rules under them: honest changes, the ranking, the queue's words, its parity with Team Hub, the Nudge.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
// CoachHelm not yet rebuilt for coaches: its links are not drawn (the rest of the nav is the real one).
const hide = vi.hoisted(() => ({ coachhelm: false }));
vi.mock('../shell/nav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shell/nav')>();
  return { ...actual, rebuiltHref: (href: string, role?: 'coach' | 'player') => (hide.coachhelm && href.startsWith('/golf/dashboard/coachhelm') ? null : actual.rebuiltHref(href, role)) };
});

import { legPeople } from '../data/home';
import { overdueTaskCount, rsvpQueue, unackedPostCount } from '../data/hub';
import { PREVIEW_HOME, PREVIEW_HOME_NOW, PREVIEW_LEGS, PREVIEW_QUEUE } from '../preview/fixtures';
import { PREVIEW_HUB_COACH } from '../preview/fixtures-hub';
import { CoachHome } from '../screens/home/CoachHome';
import { queueParts } from '../screens/home/CoachQueue';
import { DayCard } from '../screens/home/DayCard';
import { legChange, legPlayerHref, TeamLegs } from '../screens/home/TeamLegs';
import { nextReplies, Week } from '../screens/home/Week';
import type { TeamRankRow } from '../screens/stats/team-rank';
import { playerPeekActions } from '../ui/PlayerPeek';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

afterEach(() => {
  cleanup();
  hide.coachhelm = false;
});

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

describe('20105 the four parts’ changes are honest (spec B §1)', () => {
  it('a change inside its standard error is plain "No clear change vs previous 10"', () => {
    expect(legChange({ sg: 0.4, delta: 0.2, se: 0.3 })).toEqual({ tone: '', words: 'No clear change vs previous 10' });
  });

  it('a change that clears it is green when better and amber when worse', () => {
    expect(legChange({ sg: 0.4, delta: 0.5, se: 0.3 })).toEqual({ tone: 'is-gain', words: 'Better than previous 10' });
    expect(legChange({ sg: -0.4, delta: -0.5, se: 0.3 })).toEqual({ tone: 'is-loss', words: 'Worse than previous 10' });
  });

  it('no figure under 3 rounds with hole scores, and no change with no earlier ten', () => {
    expect(legChange({ sg: null, delta: null, se: null }).words).toMatch(/3 rounds with hole scores$/);
    expect(legChange({ sg: 0.2, delta: null, se: null })).toEqual({ tone: '', words: 'No earlier ten to compare' });
  });

  it('strokes gained of zero (or one that rounds to it) is plain ink, neither a gain nor a loss', () => {
    const rows = PREVIEW_LEGS.rows.map((r, i) => ({ ...r, sg: i === 0 ? 0 : i === 1 ? 0.04 : r.sg }));
    wrap(<TeamLegs legs={{ ...PREVIEW_LEGS, rows }} />);
    const sg = [...document.querySelectorAll('.ch-h-legs__sg')];
    expect(sg[0]!.className).not.toMatch(/is-(gain|loss)/);
    expect(sg[1]!.className).not.toMatch(/is-(gain|loss)/);
    expect(sg[2]!.className).toMatch(/is-loss/);
  });
});

describe('20105 20103 who gains and loses most (Team Stats’ ranking)', () => {
  const row = (id: string, value: number | null, rank: number | null, tied = false): TeamRankRow => ({ id, name: id, short: `${id.toUpperCase()}.`, value, se: 0.2, n: 10, state: 'steady', rank, tied });

  it('players sharing a place are named together, first place gaining and the last losing', () => {
    const who = legPeople([row('a', 0.9, 1, true), row('b', 0.8, 1, true), row('c', 0.1, 3), row('d', -0.6, 4, true), row('e', -0.7, 4, true)]);
    expect(who.gains).toEqual({ ids: ['a', 'b'], names: ['A.', 'B.'], value: 0.9 });
    // The last place is named from the bottom: the one losing most first.
    expect(who.loses).toEqual({ ids: ['e', 'd'], names: ['E.', 'D.'], value: -0.7 });
  });

  it('one ranked player gains and nobody loses; everyone in one place loses nothing either', () => {
    expect(legPeople([row('a', 0.3, 1), row('b', null, null)])).toEqual({ gains: { ids: ['a'], names: ['A.'], value: 0.3 }, loses: null });
    expect(legPeople([row('a', 0.3, 1, true), row('b', 0.2, 1, true)]).loses).toBeNull();
    expect(legPeople([row('b', null, null)])).toEqual({ gains: null, loses: null });
  });

  it('a name opens that player’s Game tab on Stats, on the same Last 10', () => {
    expect(legPlayerHref('p1')).toBe('/golf/dashboard/stats?player=p1&tab=game');
    wrap(<TeamLegs legs={PREVIEW_LEGS} />);
    expect(screen.getAllByRole('link', { name: 'Theo M.' })[0]!.getAttribute('href')).toBe('/golf/dashboard/stats?player=theo&tab=game');
    // One ranked player gains most: the Loses most cell stays empty, not "—".
    const one = { ...PREVIEW_LEGS, rows: PREVIEW_LEGS.rows.map((r) => ({ ...r, loses: null })) };
    cleanup();
    wrap(<TeamLegs legs={one} />);
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(within(firstRow).getAllByRole('cell').at(-1)!.textContent).toBe('');
  });
});

describe('20104 20103 “Waiting on you”: its words and where each part opens (spec B §2)', () => {
  it('only the parts above zero, in order: join requests, replies, tasks, posts', () => {
    expect(queueParts(PREVIEW_QUEUE).parts.map((p) => [p.key, p.text])).toEqual([
      ['joins', '1 join request'],
      ['replies', '3 replies missing'],
      ['tasks', '2 tasks overdue'],
      ['posts', '1 post awaiting acknowledgement'],
    ]);
    const one = queueParts({ joinRequests: 2, replies: { missing: 1, events: [{ id: 'e1', date: '2026-10-14', missing: 1 }] }, overdueTasks: 1, unackedPosts: 3 });
    expect(one.parts.map((p) => p.text)).toEqual(['2 join requests', '1 reply missing', '1 task overdue', '3 posts awaiting acknowledgement']);
    expect(queueParts({ joinRequests: 0, replies: { missing: 0, events: [] }, overdueTasks: 0, unackedPosts: 0 })).toEqual({ parts: [], failed: false });
  });

  it('replies open their event when one event holds them, and Calendar (saying how many events) when more do', () => {
    const one = queueParts({ ...PREVIEW_QUEUE, replies: { missing: 2, events: [{ id: 'a5', date: '2026-10-16', missing: 2 }] } });
    expect(one.parts.find((p) => p.key === 'replies')).toMatchObject({ href: '/golf/dashboard/calendar?date=2026-10-16&event=a5', title: undefined });
    expect(queueParts(PREVIEW_QUEUE).parts.find((p) => p.key === 'replies')).toMatchObject({ href: '/golf/dashboard/calendar', title: 'across 2 events' });
  });

  it('the other parts open the screens that hold them', () => {
    expect(Object.fromEntries(queueParts(PREVIEW_QUEUE).parts.map((p) => [p.key, p.href]))).toMatchObject({
      joins: '/golf/dashboard/roster',
      tasks: '/golf/dashboard/team-hub?tab=tasks',
      posts: '/golf/dashboard/team-hub?tab=ann',
    });
  });

  it('counts as Team Hub counts, on the Hub’s own coach fixtures', () => {
    const hub = PREVIEW_HUB_COACH;
    // The Hub's RSVPs rows each say how many haven't replied; Home sums the same rows.
    expect(rsvpQueue(hub.rsvps.rows)).toEqual({ missing: 3, events: hub.rsvps.rows.map((r) => ({ eventId: r.eventId, missing: r.counts!.none })) });
    expect(overdueTaskCount(hub.tasks.rows)).toBe(hub.tasks.rows.filter((t) => t.status === 'overdue').length);
    // One more overdue row is one more (the Hub's fixture already has its own overdue task, t4).
    expect(overdueTaskCount([...hub.tasks.rows, { ...hub.tasks.rows[0]!, status: 'overdue' }])).toBe(overdueTaskCount(hub.tasks.rows) + 1);
    // a1 asks for an acknowledgement Jonah hasn't given; a2 and a3 don't ask.
    expect(unackedPostCount(hub.announcements.rows)).toBe(1);
    expect(unackedPostCount([{ needAck: true, notAcked: null }])).toBeNull();
    expect(rsvpQueue([{ eventId: 'x', counts: null }])).toBeNull();
  });
});

describe('20103 20806 the Week’s Next row says who hasn’t replied, with one Nudge (spec B §4)', () => {
  const next = PREVIEW_HOME.phone.today.find((e) => e.id === 'a1')!;
  const today = PREVIEW_HOME.week.days.find((d) => d.isToday)?.date ?? null;

  it('the line and Nudge show while someone hasn’t replied and the event still takes replies', () => {
    wrap(<Week week={PREVIEW_HOME.week} events={PREVIEW_HOME.phone.today} />);
    const row = document.querySelector('.ch-h-agenda__row.is-next') as HTMLElement;
    expect(within(row).getByText('5 of 6 going · Eli hasn’t replied')).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'Nudge Eli about Short-game block' })).toBeTruthy();
    // Only the Next row.
    expect(document.querySelectorAll('.ch-h-agenda__nudge')).toHaveLength(1);
  });

  it('no line and no Nudge once the replies are closed, or when everyone has replied', () => {
    expect(nextReplies({ ...next, replyOpen: false }, today)).toBeNull();
    expect(nextReplies({ ...next, replyOpen: undefined }, today)).toBeNull();
    expect(nextReplies({ ...next, awaiting: [] }, today)).toBeNull();
    expect(nextReplies(null, today)).toBeNull();
  });

  it('names two and more without listing them', () => {
    const two = nextReplies({ ...next, going: 4, awaiting: [{ id: 'eli', name: 'Eli Brandt' }, { id: 'ava', name: 'Ava Lindqvist' }] }, today)!;
    expect(two.line).toBe('4 of 6 going · Eli and 1 other haven’t replied');
    expect(two.nudge).toMatchObject({ label: 'Nudge 2', aria: 'Nudge 2 players about Short-game block' });
    const three = nextReplies({ ...next, going: 3, awaiting: [{ id: 'eli', name: 'Eli Brandt' }, { id: 'ava', name: 'Ava Lindqvist' }, { id: 'jonah', name: 'Jonah Okafor' }] }, today)!;
    expect(three.line).toBe('3 of 6 going · Eli and 2 others haven’t replied');
  });

  it('the Nudge is the phone day card’s own: the same prefilled Messages link, never sent', () => {
    const desk = nextReplies(next, today)!.nudge!.href;
    wrap(<DayCard phase={{ kind: 'event', e: next, live: false }} now={new Date(PREVIEW_HOME_NOW)} today={today} onOpenRound={() => {}} />);
    expect(screen.getByRole('link', { name: /Nudge Eli/ }).getAttribute('href')).toBe(desk);
    expect(desk).toMatch(/^\/golf\/dashboard\/messages\?/);
  });

  it('no countdown on the coach’s desktop Home', () => {
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    expect(document.querySelector('.ch-cd')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('20103 CH-1832 CoachHelm from a player (spec B §3)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('the player peek offers CoachHelm, the player’s deep dive; not drawn while CoachHelm isn’t rebuilt', () => {
    expect(playerPeekActions({ id: 'p 1' }).find((a) => a.label === 'CoachHelm')?.href).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=p%201');
    hide.coachhelm = true;
    expect(playerPeekActions({ id: 'p1' }).find((a) => a.label === 'CoachHelm')?.href).toBeNull();
  });

  it.each([
    ['rebuilt', false],
    ['not rebuilt', true],
  ])('the phone’s round sheet has CoachHelm after Player stats when CoachHelm is %s', async (_, hidden) => {
    hide.coachhelm = hidden;
    const user = userEvent.setup();
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    await user.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Theo Marchetti' });
    const helm = within(sheet).queryByRole('link', { name: 'CoachHelm' });
    if (hidden) expect(helm).toBeNull();
    else {
      expect(helm!.getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=theo');
      const names = within(sheet).getAllByRole('link').map((a) => a.textContent);
      expect(names.indexOf('CoachHelm')).toBeGreaterThan(names.indexOf('Player stats'));
    }
  });
});
