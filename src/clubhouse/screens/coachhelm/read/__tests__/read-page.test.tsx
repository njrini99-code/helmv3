import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
const device = vi.hoisted(() => ({ phone: false }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => device.phone, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../../../../shell/nav', async (orig) => ({ ...(await orig<typeof import('../../../../shell/nav')>()), rebuiltHref: (href: string) => href }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ status: 'recorded' })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));

import { ToastProvider } from '../../../../ui/Toast';
import { previewReadHead, previewReadView } from '../../../../preview/fixtures-coachhelm-read';
import type { ChViewLoad, ChViewVoice } from '../../../../data/coachhelm-views-shape';
import type { ChReadView } from '../../../../data/coachhelm-read-view-shape';
import type { ChCoachHelmWrites } from '../../writes';
import type { ChReadWrites } from '../actions';
import { ReadPage, ReadSkeleton } from '../ReadPage';
import '../../../../__tests__/dialog-polyfill';

/**
 * The read page as each viewer gets it (7 Nov design), from the real shapers: the head's four lines, the actions directly under it
 * with one primary, the three tabs on the phone, the stepper and J and K on desktop, every state visibly its own, and a player's page
 * with no coach control and no coach-only figure in the DOM.
 */

const coachVoice = (q: string): ChViewVoice => ({ role: 'coach', ...previewReadHead(q) });
const PLAYER: ChViewVoice = { role: 'player' };
const writesSpy = (over: Partial<ChCoachHelmWrites> = {}): ChCoachHelmWrites => ({ assign: vi.fn(async () => ({ success: true })), dismiss: vi.fn(async () => ({ success: true })), undo: vi.fn(async () => ({ success: true })), ...over });

const readWritesSpy = (): ChReadWrites => ({ removeFocus: vi.fn(async () => ({ success: true })), recheck: vi.fn(async () => ({ success: true, insightsCreated: 1 })) });
const lastRead = { writes: readWritesSpy() };

function show(q: string, role: 'coach' | 'player', opts: { state?: string; load?: ChViewLoad<ChReadView>; writes?: ChCoachHelmWrites; over?: (v: ChReadView) => ChReadView; holdMs?: number } = {}) {
  const Wrap = ({ children }: { children: ReactNode }) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>{children}</ToastProvider>
    </LazyMotion>
  );
  const built = previewReadView(q, role, opts.state === 'gone', opts.state);
  const load = opts.load ?? ({ status: 'ready', data: opts.over ? opts.over(built) : built } as const);
  const writes = opts.writes ?? writesSpy();
  const hrefOf = (id: string) => `/read/${id}`;
  lastRead.writes = readWritesSpy();
  render(<ReadPage load={load} voice={role === 'coach' ? coachVoice(q) : PLAYER} writes={writes} playerWrites={{ accept: vi.fn(async () => ({ success: true })), decline: vi.fn(async () => ({ success: true })) }} readWrites={lastRead.writes} holdMs={opts.holdMs ?? 60} hrefOf={hrefOf} />, { wrapper: Wrap });
  return writes;
}
const main = () => screen.getByRole('main');
const sec = (name: string) => main().querySelector(`[data-ch-read-sec="${name}"]`);

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  device.phone = false;
});

describe('the read’s structure', () => {
  it('the head is one card with What, Why, Next and When, and the actions come straight after it', () => {
    show('penalties', 'coach');
    const article = main().querySelector('article.ch-hd-dos')!;
    const head = article.querySelector('header.ch-hd-dos__h')!;
    expect([...head.querySelectorAll('dl.ch-hd-read dt')].map((n) => n.textContent)).toEqual(['What', 'Why', 'Next', 'When']);
    expect(head.querySelector('.ch-hl-pri')?.textContent).toBe('Priority');
    expect(head.nextElementSibling?.getAttribute('data-ch-read-actions')).toBe('open');
    // One primary on the page, and it is Assign as focus; Dismiss and Message sit beside it, not in a menu.
    const primaries = main().querySelectorAll('.ch-btn--primary');
    expect(primaries.length).toBe(1);
    expect(primaries[0]?.textContent).toContain('Assign as focus');
    const row = within(head.nextElementSibling as HTMLElement);
    expect(row.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    const message = row.getByRole('link', { name: 'Message Eli' });
    expect(message.getAttribute('href')).toContain('messages?player=pl-eli');
    // One group of the real keys: Dismiss and Message are the same quiet Button, side by side after the primary.
    expect([...(head.nextElementSibling as HTMLElement).children].map((n) => n.className.replace(/\s+/g, ' ').trim())).toEqual(['ch-btn ch-btn--primary', 'ch-btn ch-btn--ghost', 'ch-btn ch-btn--ghost']);
  });

  it('desktop draws every section open, in the design’s order, and no tabs', () => {
    show('penalties', 'coach');
    expect([...main().querySelectorAll('[data-ch-read-sec]')].map((n) => n.getAttribute('data-ch-read-sec'))).toEqual(['measured', 'moved', 'cause', 'where', 'rounds', 'sure', 'plan', 'right']);
    expect(screen.queryByRole('radiogroup', { name: 'Parts of this read' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Eli Brandt' })).toBeTruthy();
    expect(main().textContent).toContain('Junior · Last round Sep 28');
  });

  it('a section with no data draws nothing: the putting read has no trend and no ladder, the penalties read no drill', () => {
    show('putts', 'coach');
    expect(sec('moved')).toBeNull();
    expect(sec('week')?.textContent).toContain('Downhill ladder');
    expect(sec('measured')?.textContent).toContain('The gap, same distance');
    expect(sec('measured')?.textContent).not.toContain('Against');
    cleanup();
    show('penalties', 'coach');
    expect(sec('week')).toBeNull();
  });

  it('one page says one round count: 21 rounds on the measure, 21 on the rounds card, and the counts of the cause agree', () => {
    show('penalties', 'coach');
    const text = main().textContent ?? '';
    expect(text).not.toMatch(/\b28 rounds\b|\b4 rounds\b/);
    expect(sec('rounds')?.textContent).toContain('Newest 8 of 21');
    expect(sec('measured')?.textContent).toContain('21 rounds');
    expect(sec('cause')?.textContent).toContain('17 of 23');
    expect(sec('cause')?.textContent).toContain('14 of 23 penalties went this way.');
    expect(text).not.toContain('18.0 strokes');
  });

  it('how sure is a disclosure: closed at first, and what CoachHelm checked is inside it for a coach', async () => {
    show('penalties', 'coach');
    const key = screen.getByRole('button', { name: /How sure is this · Solid read/ });
    expect(key.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(key);
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(sec('sure')?.textContent).toContain('Checked: Club off the tee · Where the miss finished · Par and length of the hole');
  });
});

describe('the phone', () => {
  it('has three tabs under the actions, and a tab shows only its own sections', async () => {
    device.phone = true;
    show('penalties', 'coach');
    const tabs = screen.getByRole('radiogroup', { name: 'Parts of this read' });
    expect(within(tabs).getAllByRole('radio').map((b) => b.textContent)).toEqual(['Measured', 'Cause', 'Rounds']);
    expect(sec('measured')).toBeTruthy();
    expect(sec('cause')).toBeNull();
    await userEvent.click(within(tabs).getByRole('radio', { name: 'Cause' }));
    await waitFor(() => expect(sec('cause')).toBeTruthy());
    expect(sec('where')?.textContent).toContain('Oak Hollow, hole 7');
    // The tail and the player's other reads stay under every tab.
    expect(sec('plan')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'More on Eli' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Fairways with driver: 48%/ }).getAttribute('href')).toBe('/read/in-tee');
  });

  it('a player’s middle tab is What it shows', () => {
    device.phone = true;
    show('putts', 'player');
    expect(within(screen.getByRole('radiogroup', { name: 'Parts of this read' })).getAllByRole('radio').map((b) => b.textContent)).toEqual(['Measured', 'What it shows', 'Rounds']);
    expect(screen.getByRole('heading', { name: 'Your other reads' })).toBeTruthy();
  });
});

describe('desktop: the player’s reads beside the read', () => {
  it('the rail lists them by area with this one current, and the stepper says where it is', () => {
    show('penalties', 'coach');
    const rail = screen.getByRole('navigation', { name: 'Eli’s reads' });
    expect(within(rail).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/read/in-tee', '/read/in-pen', '/read/in-dbl']);
    expect(within(rail).getByRole('link', { current: true }).textContent).toContain('Penalty strokes');
    expect(main().querySelector('.ch-hr-step')?.textContent).toContain('2 of 3');
  });

  it('J opens the next read and K the one before, and neither fires while typing', () => {
    show('penalties', 'coach');
    fireEvent.keyDown(window, { key: 'j' });
    expect(router.replace).toHaveBeenLastCalledWith('/read/in-dbl');
    fireEvent.keyDown(window, { key: 'k' });
    expect(router.replace).toHaveBeenLastCalledWith('/read/in-tee');
    router.replace.mockClear();
    const field = document.createElement('input');
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(router.replace).not.toHaveBeenCalled();
    field.remove();
  });

  it('the steps stop at the ends', async () => {
    show('putts', 'coach');
    expect(main().querySelector('.ch-hr-step')?.textContent).toContain('1 of 3');
    expect((screen.getByRole('button', { name: 'Previous read' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Next read' }));
    expect(router.replace).toHaveBeenCalledWith('/read/in-brk');
  });
});

describe('a coach acts on the read', () => {
  it('Assign turns the row, the pill, the list and the plan at once, and saves nothing while Undo is offered', async () => {
    const writes = show('penalties', 'coach', { holdMs: 5000 });
    await userEvent.click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(main().getAttribute('data-ch-read-state')).toBe('assigned');
    expect(writes.assign).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
    expect(main().querySelector('header.ch-hd-dos__h .ch-hl-pri')?.textContent).toBe('Assigned');
    expect(sec('plan')?.textContent).toContain('Proposed to Eli just now');
    expect(main().querySelector('[data-ch-read-actions="assigned"]')?.textContent).toContain('Eli is told when Undo closes.');
    expect(within(screen.getByRole('navigation', { name: 'Eli’s reads' })).getByRole('link', { current: true }).textContent).toContain('Assigned');
    // Undo is the write never sent: the key comes back and nothing was saved.
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(main().getAttribute('data-ch-read-state')).toBe('open');
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    expect(writes.assign).not.toHaveBeenCalled();
  });

  it('when Undo closes, one write goes for this player and the read stays assigned', async () => {
    const writes = show('penalties', 'coach', { holdMs: 40 });
    await userEvent.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await waitFor(() => expect(writes.assign).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(vi.mocked(writes.assign).mock.calls[0]?.[0]).toMatchObject({ playerId: 'pl-eli', insightId: 'in-pen' });
    await waitFor(() => expect(main().querySelector('[data-ch-read-actions="assigned"]')?.textContent).toContain('Eli sees it as a proposal'));
    expect(main().getAttribute('data-ch-read-state')).toBe('assigned');
  });

  it('a refused Assign puts the key back and says so (CH-13001)', async () => {
    show('penalties', 'coach', { holdMs: 40, writes: writesSpy({ assign: vi.fn(async () => ({ success: false, error: 'nope' })) }) });
    await userEvent.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13001"]')).toBeTruthy(), { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy());
    expect(main().getAttribute('data-ch-read-state')).toBe('open');
  });

  it('leaving the page while Undo is offered sends the held write at once', async () => {
    const writes = show('penalties', 'coach', { holdMs: 5000 });
    await userEvent.click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(writes.assign).not.toHaveBeenCalled();
    fireEvent(window, new Event('pagehide'));
    await waitFor(() => expect(writes.assign).toHaveBeenCalledTimes(1));
  });

  it('Remove focus is offered on a focus made from this read, waits behind Undo, then deletes that focus area and reads the page again', async () => {
    show('penalties', 'coach', { state: 'assigned', holdMs: 40 });
    await userEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
    expect(main().getAttribute('data-ch-read-state')).toBe('removed');
    expect(sec('plan')?.textContent).toContain('Not part of a focus or goal yet.');
    await waitFor(() => expect(lastRead.writes.removeFocus).toHaveBeenCalledWith('fa-read'), { timeout: 4000 });
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('Undo on Remove focus deletes nothing', async () => {
    show('penalties', 'coach', { state: 'assigned', holdMs: 5000 });
    await userEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(main().getAttribute('data-ch-read-state')).toBe('assigned');
    expect(lastRead.writes.removeFocus).not.toHaveBeenCalled();
  });

  it('Dismiss writes once, leaves the read readable with one line and Undo, and Undo restores the row', async () => {
    const writes = show('penalties', 'coach');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(writes.dismiss).toHaveBeenCalledWith('in-pen');
    await waitFor(() => expect(main().getAttribute('data-ch-read-state')).toBe('dismissed'));
    const row = main().querySelector('[data-ch-read-actions="dismissed"]') as HTMLElement;
    expect(row.textContent).toContain('Dismissed.');
    expect(sec('measured')).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: 'Undo' }));
    expect(writes.undo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy());
  });
});

describe('a player on their own read', () => {
  it('has no coach control, reads against the Tour only, and Ask about this is the one primary', () => {
    show('penalties', 'player');
    expect(main().getAttribute('data-ch-read-viewer')).toBe('player');
    expect(screen.queryByRole('button', { name: /assign as focus|propose again|dismiss|undo/i })).toBeNull();
    expect(screen.queryByText(/^Message Eli/)).toBeNull();
    const primaries = main().querySelectorAll('.ch-btn--primary');
    expect(primaries.length).toBe(1);
    expect(primaries[0]?.textContent).toContain('Ask about this');
    expect(sec('measured')?.textContent).toContain('Against Tour');
    expect(screen.getByRole('heading', { level: 1, name: 'Your reads' })).toBeTruthy();
    // No priority pill for a player: only whether it is theirs.
    expect(main().querySelector('header.ch-hd-dos__h .ch-hl-pri')).toBeNull();
  });

  it('no team pool, teammate, checked line, rung or likely cause is in the DOM, on any of the three reads', async () => {
    for (const q of ['penalties', 'putts', 'approach']) {
      show(q, 'player');
      await userEvent.click(screen.getByRole('button', { name: /How sure is this/ }));
      const html = document.body.innerHTML;
      for (const word of ['Team pool', 'the team', 'teammate', 'Checked:', 'Rung', 'Likely', 'Long par 4s', 'times as often', 'Why CoachHelm thinks so', 'Eli', 'Jonah', 'Priya']) expect(html.includes(word), `${q}: ${word}`).toBe(false);
      expect(main().querySelector('[data-ch-read-coach]')).toBeNull();
      expect(screen.getByRole('heading', { name: 'What CoachHelm sees' })).toBeTruthy();
      cleanup();
    }
  });

  it('the coach’s page of the same reads holds what the player check looks for', async () => {
    show('approach', 'coach');
    await userEvent.click(screen.getByRole('button', { name: /How sure is this/ }));
    const html = document.body.innerHTML;
    for (const word of ['Team pool', 'the team', 'teammates', 'Checked:', 'Likely, from totals', 'Long par 4s', 'times as often', 'Why CoachHelm thinks so']) expect(html.includes(word), word).toBe(true);
  });

  it('a proposal from this read is answered in place, and the pill says it is waiting on them', () => {
    show('putts', 'player', { state: 'proposed' });
    expect(main().getAttribute('data-ch-read-state')).toBe('proposed');
    expect(main().querySelector('header.ch-hd-dos__h .ch-hl-pri')?.textContent).toBe('Proposed for you');
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(sec('plan')?.textContent).toContain('Suggested focus');
  });

  it('their active focus says so, and Ask steps back to secondary', () => {
    show('putts', 'player', { state: 'focus' });
    expect(main().getAttribute('data-ch-read-state')).toBe('focus');
    expect(main().querySelector('header.ch-hd-dos__h .ch-hl-pri')?.textContent).toBe('Your focus');
    expect(main().querySelectorAll('.ch-btn--primary').length).toBe(0);
    expect(sec('plan')?.textContent).toContain('Your focus');
  });
});

describe('every state looks its own', () => {
  it('stale counts the newer rounds under the claim, and Re-check now takes Assign’s place (CH-13903, CH-13906)', async () => {
    show('penalties', 'coach', { state: 'stale' });
    expect(main().getAttribute('data-ch-read-state')).toBe('stale');
    const note = main().querySelector('header.ch-hd-dos__h [data-ch-code="CH-13903"]');
    expect(note?.textContent).toContain('2 newer rounds aren’t counted yet');
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
    expect(main().querySelector('[data-ch-code="CH-13906"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    // The coach's own re-check of this one player, then the page reads its data again.
    const primaries = main().querySelectorAll('.ch-btn--primary');
    expect(primaries.length).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Re-check now' }));
    expect(lastRead.writes.recheck).toHaveBeenCalledWith('pl-eli');
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('a stale read with the rounds unread still names the day, and a player is offered no re-check', () => {
    show('penalties', 'coach', { state: 'stale', over: (v) => ({ ...v, read: v.read && { ...v.read, headline: { ...v.read.headline, newer: null } } }) });
    expect(main().querySelector('[data-ch-code="CH-13903"]')?.textContent).toContain('A round played Oct 3 isn’t counted yet');
    cleanup();
    show('putts', 'player', { state: 'stale' });
    expect(screen.queryByRole('button', { name: 'Re-check now' })).toBeNull();
    expect(main().querySelector('[data-ch-code="CH-13903"]')).toBeTruthy();
  });

  it('assigned on load: the row is Message, the plan shows the focus', () => {
    show('penalties', 'coach', { state: 'assigned' });
    expect(main().getAttribute('data-ch-read-state')).toBe('assigned');
    expect(main().querySelector('[data-ch-read-actions="assigned"]')?.textContent).toContain('Message Eli');
    expect(sec('plan')?.textContent).toContain('Focus made from this read');
  });

  it('a failed load is the centred danger page with Try again, and nothing of the read (CH-13866)', async () => {
    show('penalties', 'coach', { load: { status: 'failed' } });
    const page = main().querySelector('section.ch-empty-page--danger');
    expect(page?.getAttribute('role')).toBe('alert');
    expect(page?.getAttribute('data-ch-code')).toBe('CH-13866');
    expect(main().querySelector('article.ch-hd-dos')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('a read no longer on the list is its own page, with the way back to the player’s reads (CH-13861)', () => {
    show('penalties', 'coach', { state: 'gone' });
    expect(main().getAttribute('data-ch-read-state')).toBe('gone');
    expect(main().querySelector('section.ch-empty-page--danger')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Eli’s reads' }).getAttribute('href')).toContain('player=pl-eli');
    expect(main().querySelector('article.ch-hd-dos')).toBeNull();
  });

  it('off is the CoachHelm off page with the reason (CH-13313)', () => {
    show('penalties', 'coach', { load: { status: 'off', reason: 'Exam week' } });
    expect(document.querySelector('[data-ch-code="CH-13313"]')?.textContent).toContain('Exam week');
  });

  it('a part that failed says so inside its own card, with Try again; the read above stays (CH-13281)', async () => {
    show('penalties', 'coach', { over: (v) => ({ ...v, failed: { ...v.failed, rounds: true } }) });
    const card = sec('rounds') as HTMLElement;
    expect(card.querySelector('[data-ch-code="CH-13281"]')).toBeTruthy();
    expect(card.querySelector('ol.ch-hd-rounds')).toBeNull();
    expect(main().querySelector('header.ch-hd-dos__h dl.ch-hd-read')).toBeTruthy();
    await userEvent.click(within(card).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('loading is the page’s own shape: the green head with four label rows, two actions and the first card', () => {
    for (const phone of [true, false]) {
      device.phone = phone;
      const Wrap = ({ children }: { children: ReactNode }) => <LazyMotion features={domAnimation}>{children}</LazyMotion>;
      const { container } = render(<ReadSkeleton />, { wrapper: Wrap });
      const el = container.querySelector('main') as HTMLElement;
      // The route skeleton's mark (RouteFrame, base.css) and the crossfade it asks for.
      expect(el.getAttribute('aria-busy')).toBe('true');
      expect(el.getAttribute('aria-label')).toMatch(/^Loading/);
      expect(el.getAttribute('data-ch-arrive')).toBe('crossfade');
      expect(el.querySelectorAll('article.ch-hd-dos header.ch-hd-dos__h .ch-skel-rows__r').length).toBe(4);
      expect(el.querySelectorAll('article.ch-hd-dos .ch-hl-cact .ch-skel').length).toBe(2);
      expect(el.querySelectorAll('.ch-hr-sec .ch-surface').length).toBe(1);
      expect(!!el.querySelector('.ch-hd-rail')).toBe(!phone);
      cleanup();
    }
  });
});

describe('how it has moved', () => {
  it('is the read’s metric round by round on the one line chart, with a window switch that swaps the caption', async () => {
    show('penalties', 'coach');
    const card = sec('moved') as HTMLElement;
    expect(card.querySelector('.ch-line')).toBeTruthy();
    expect(card.textContent).toContain('Penalties per round, oldest to newest');
    expect(card.textContent).toContain('1.5 a round over the last 8 rounds');
    expect(card.textContent).toContain('Dashed line: Tour 0.3');
    const win = within(card).getByRole('radiogroup', { name: 'Rounds shown' });
    expect(within(win).getAllByRole('radio').map((b) => b.textContent)).toEqual(['Last 8', 'Season']);
    await userEvent.click(within(win).getByRole('radio', { name: 'Season' }));
    await waitFor(() => expect(card.textContent).toContain('across the season, 10 rounds'));
    // Drawn in place: the chart asks for no draw-in.
    expect(card.querySelector('[data-draw]')).toBeNull();
  });

  it('a before and an after alone are a quiet row under the measure, never a card', () => {
    show('approach', 'coach');
    expect(sec('moved')).toBeNull();
    expect(sec('measured')?.querySelector('[data-ch-read-since]')?.textContent).toContain('From 34% to 43%, up 9 pts');
  });

  it('the rounds list says what the metric was in each round, and a counted hole its score', () => {
    show('penalties', 'coach');
    expect(sec('rounds')?.textContent).toContain('3 penalties');
    expect(sec('where')?.textContent).toContain('+2');
  });
});

describe('a player’s way to their coach', () => {
  it('Message names the coach and opens the thread with them', () => {
    show('penalties', 'player');
    expect(screen.getByRole('link', { name: 'Message Coach Reyes' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=user-coach-reyes');
  });

  it('with no coach on the page it is Message your coach, to Messages', () => {
    show('penalties', 'player', { over: (v) => ({ ...v, coach: undefined }) });
    expect(screen.getByRole('link', { name: 'Message your coach' }).getAttribute('href')).toBe('/golf/dashboard/messages');
  });
});

describe('the lane stylesheet', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-read.css'), 'utf8');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('is layout on tokens: no hex, no raw rgb(), no !important', () => {
    expect(rules.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(rules.match(/\brgba?\(/g)).toBeNull();
    expect(rules).not.toContain('!important');
  });

  it('names only ch- classes, and is a fraction of the 1,324 lines it replaced', () => {
    const classes = [...rules.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1] as string).filter((c) => !/^\d/.test(c));
    expect(classes.filter((c) => !c.startsWith('ch-') && !c.startsWith('is-'))).toEqual([]);
    expect(css.split('\n').length).toBeLessThan(200);
  });

  it('moves only transform and opacity, and nothing grows: no width, height or scale animation, no ring', () => {
    const transitions = [...rules.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1] as string);
    expect(transitions.every((t) => /^transform\b/.test(t))).toBe(true);
    const frames = [...rules.matchAll(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/g)].map((m) => m[1] as string).join(' ');
    expect(frames).not.toMatch(/width|height|scale|stroke|inset|margin|padding/);
    expect(rules).not.toMatch(/scaleX|stroke-dash|900ms/);
  });
});
