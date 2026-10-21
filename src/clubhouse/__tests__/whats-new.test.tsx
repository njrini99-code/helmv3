// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WhatsNewItem } from '@/app/golf/actions/whats-new';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/whats-new' }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false }));
const refreshState = vi.hoisted(() => ({ refreshing: false }));
vi.mock('../lib/use-refresh', () => ({ useRefresh: () => ({ refresh: vi.fn(), refreshing: refreshState.refreshing }) }));
vi.mock('../lib/session-state', async () => {
  const { useState } = await import('react');
  return { useChSessionState: <T,>(_k: string, initial: T) => useState<T>(initial) };
});

import { passage, toWhatsNew, WHATS_NEW_FAILED } from '../data/whats-new-shape';
import { PREVIEW_WHATS_NEW, PREVIEW_WHATS_NEW_EMPTY, PREVIEW_WHATS_NEW_TRUNCATED } from '../preview/fixtures-whats-new';
import { WhatsNew, whatsNewLink } from '../screens/whats-new/WhatsNew';
import { WhatsNewSkeleton } from '../screens/whats-new/WhatsNewSkeleton';

afterEach(() => {
  cleanup();
  refreshState.refreshing = false;
});

const NOW = Date.UTC(2026, 9, 14, 20, 0);
const item = (over: Partial<WhatsNewItem>): WhatsNewItem => ({ type: 'insight_detected', occurredAt: '2026-10-14T17:00:00Z', playerId: 'p1', playerName: 'Ada Park', title: 'Putting', insightId: 'i1', ...over });

describe('toWhatsNew', () => {
  it('groups by the team’s calendar day, not UTC: 01:30 UTC on the 15th is still the 14th in New York', () => {
    const feed = toWhatsNew([item({ occurredAt: '2026-10-15T01:30:00Z', insightId: 'a' }), item({ occurredAt: '2026-10-14T13:00:00Z', insightId: 'b' })], { nowMs: NOW, zone: 'America/New_York' });
    expect(feed.days.map((d) => [d.label, d.items.length])).toEqual([['Today', 2]]);
    expect(feed.days[0]!.items.map((i) => i.time)).toEqual(['9:30 PM', '9:00 AM']);
  });

  it('labels Today, Yesterday and then the weekday and date, newest first', () => {
    const feed = toWhatsNew([item({ occurredAt: '2026-10-09T15:00:00Z', insightId: 'c' }), item({ occurredAt: '2026-10-14T15:00:00Z', insightId: 'a' }), item({ occurredAt: '2026-10-13T15:00:00Z', insightId: 'b' })], { nowMs: NOW, zone: 'America/New_York' });
    expect(feed.days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Fri, Oct 9']);
  });

  it('counts by kind, sets only resolved insights and completed focus areas as good, and drops a repeat of the same event', () => {
    const feed = toWhatsNew(
      [item({ type: 'insight_resolved', insightId: 'a' }), item({ type: 'pattern_validated', patternId: 'p', insightId: undefined }), item({ type: 'focus_area_completed', focusAreaId: 'f', insightId: undefined }), item({ type: 'focus_area_created', focusAreaId: 'g', insightId: undefined }), item({ type: 'insight_resolved', insightId: 'a' })],
      { nowMs: NOW },
    );
    expect(feed.counts).toEqual({ all: 4, insights: 1, patterns: 1, focus: 2 });
    expect(feed.days.flatMap((d) => d.items).filter((i) => i.good).map((i) => i.what).sort()).toEqual(['Focus area completed', 'Insight resolved']);
  });

  it('skips an event with no usable time and falls back to the default zone for a bad one', () => {
    const feed = toWhatsNew([item({ occurredAt: 'not a date' }), item({ insightId: 'ok' })], { nowMs: NOW, zone: 'Mars/Olympus' });
    expect(feed.total).toBe(1);
    expect(feed.days[0]!.items[0]!.time).toBe('1:00 PM');
  });

  it('trims a long passage at a word and says nothing for blank text', () => {
    expect(passage('   ')).toBeNull();
    expect(passage(undefined)).toBeNull();
    const long = passage('word '.repeat(100))!;
    expect(long.length).toBeLessThanOrEqual(221);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('WhatsNew', () => {
  it('draws the week by day, with each row naming the player and what happened', () => {
    render(<WhatsNew data={PREVIEW_WHATS_NEW} />);
    expect(screen.getByRole('heading', { level: 1, name: 'What’s new' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy();
    const today = screen.getByRole('list', { name: /^Today, 3 updates/ });
    expect(within(today).getByText('Short putts inside six feet')).toBeTruthy();
    expect(within(today).getByText('Insight resolved')).toBeTruthy();
  });

  it('opens a focus area on the player’s Development tab and the rest on their stats', () => {
    expect(whatsNewLink({ playerId: 'p1', kind: 'focus' })).toBe('/golf/dashboard/stats?player=p1&tab=dev');
    expect(whatsNewLink({ playerId: 'p1', kind: 'insights' })).toBe('/golf/dashboard/stats?player=p1');
  });

  it('CH-13331 narrows to one kind, and says so when a kind has nothing', async () => {
    const user = userEvent.setup();
    render(<WhatsNew data={toWhatsNew([item({ insightId: 'a' })], { nowMs: NOW })} />);
    await user.click(screen.getByRole('radio', { name: /Patterns 0/ }));
    expect(screen.getByText('Nothing of this kind this week')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /All 1/ }));
    expect(screen.getByText('Putting')).toBeTruthy();
  });

  it('CH-13330 says the week is quiet instead of drawing an empty list', () => {
    render(<WhatsNew data={PREVIEW_WHATS_NEW_EMPTY} />);
    expect(screen.getByText('Nothing new this week')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('CH-13231 never passes a failed read off as a quiet week', () => {
    render(<WhatsNew data={WHATS_NEW_FAILED} />);
    expect(screen.getByText('What’s new didn’t load')).toBeTruthy();
    expect(screen.queryByText('Nothing new this week')).toBeNull();
  });

  it('CH-13332 says older updates may be missing when a category hit its ceiling', () => {
    render(<WhatsNew data={PREVIEW_WHATS_NEW_TRUNCATED} />);
    expect(screen.getByText(/Older updates from earlier in the week may be missing/)).toBeTruthy();
  });

  it('CH-13230 keeps the week the coach was reading when a refresh fails, and says it may be out of date', () => {
    const { rerender } = render(<WhatsNew data={PREVIEW_WHATS_NEW} />);
    rerender(<WhatsNew data={WHATS_NEW_FAILED} />);
    expect(screen.getByText('This week may be out of date')).toBeTruthy();
    expect(screen.getByText('Short putts inside six feet')).toBeTruthy();
  });

  it('CH-13431 says “Updating…” beside the heading while the page reads again, and marks the page busy', () => {
    refreshState.refreshing = true;
    const { container } = render(<WhatsNew data={PREVIEW_WHATS_NEW} />);
    expect(screen.getByRole('status').textContent).toBe('Updating…');
    expect(container.querySelector('main')!.getAttribute('aria-busy')).toBe('true');
  });

  it('CH-13232 a feed that crashes while drawing is contained: the heading stays and the notice has Try again', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<WhatsNew data={{ ...PREVIEW_WHATS_NEW, days: [{ key: '2026-10-14', label: 'Today', items: null as never }] }} />);
    expect(container.querySelector('[data-ch-code="CH-13232"]')).toBeTruthy();
    expect(screen.getByText(/couldn’t be shown/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'What’s new' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('CH-13430 loads as a skeleton in the page’s shape, busy and named', () => {
    const { container } = render(<WhatsNewSkeleton />);
    const main = container.querySelector('main')!;
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(main.getAttribute('aria-label')).toBe('Loading what’s new');
    expect(main.getAttribute('data-ch-code')).toBe('CH-13430');
  });
});
