// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const feed = vi.hoisted(() => ({ override: null as null | 'paused' | 'offline' }));
vi.mock('../../../live/use-live-rounds', async (orig) => {
  const real = await orig<typeof import('../../../live/use-live-rounds')>();
  return { ...real, useLiveRounds: (o: Parameters<typeof real.useLiveRounds>[0]) => ({ ...real.useLiveRounds(o), feed: feed.override ?? real.useLiveRounds(o).feed }) };
});

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_LIVE, PREVIEW_LIVE_EMPTY, PREVIEW_LIVE_EVENT, PREVIEW_LIVE_FINISHED, PREVIEW_LIVE_MANY, PREVIEW_LIVE_NOW, PREVIEW_LIVE_ONE } from '../../../preview/fixtures-live';
import { LiveNowCard } from '../LiveNowCard';
import type { LiveSnapshot } from '../../../live/model';

afterEach(() => {
  cleanup();
  feed.override = null;
});

const card = (initial: LiveSnapshot, phone = true) => render(<LiveNowCard initial={initial} phone={phone} frozen now={PREVIEW_LIVE_NOW} />);

describe('Home: Live now', () => {
  it('draws no card at all when nobody is out (the absence is the state)', () => {
    const { container } = card(PREVIEW_LIVE_EMPTY);
    expect(container.firstChild).toBeNull();
  });

  it('titles the card by who is out (CH-16600): one, then four', () => {
    card(PREVIEW_LIVE_ONE);
    expect(screen.getByRole('heading', { name: 'Live now · 1 on the course' }).getAttribute('data-ch-code')).toBe('CH-16600');
    cleanup();
    card(PREVIEW_LIVE);
    // Sofia, Mateo, Priya, Jonah, Ellis are reporting; Noor has gone quiet and waits in the live view.
    expect(screen.getByRole('heading', { name: 'Live now · 5 on the course' })).toBeTruthy();
  });

  it('shows at most four lanes on a phone and six on a wide screen, sorted by to-par, with See all (CH-16601)', () => {
    const seven: LiveSnapshot = { ...PREVIEW_LIVE_MANY, lanes: PREVIEW_LIVE_MANY.lanes.slice(0, 7) };
    const { container } = card(seven);
    expect(container.querySelectorAll('.ch-lv-lane')).toHaveLength(4);
    const more = screen.getByRole('link', { name: 'See all 7' });
    expect(more.getAttribute('data-ch-code')).toBe('CH-16601');
    expect(more.getAttribute('href')).toBe('/golf/dashboard/live');
    const toPars = [...container.querySelectorAll('.ch-lv-lane')].map((l) => l.getAttribute('data-round'));
    expect(toPars).toHaveLength(4);
    cleanup();
    expect(card(seven, false).container.querySelectorAll('.ch-lv-lane')).toHaveLength(6);
  });

  it('a mixed qualifier and practice day is one card whose sub lines name each round type', () => {
    const { container } = card(PREVIEW_LIVE);
    expect(container.querySelectorAll('.ch-lv-card')).toHaveLength(1);
    const subs = [...container.querySelectorAll('.ch-lv-sub')].map((s) => s.textContent ?? '');
    expect(subs.some((t) => t.startsWith('Qualifier'))).toBe(true);
    expect(subs.some((t) => t.startsWith('Practice'))).toBe(true);
  });

  it('when only finished lanes remain, the title is Finished today without the dot (CH-16602)', () => {
    const { container } = card(PREVIEW_LIVE_FINISHED);
    expect(screen.getByRole('heading', { name: 'Finished today · 2' }).getAttribute('data-ch-code')).toBe('CH-16602');
    expect(container.querySelector('.ch-lv-card__head .ch-lv-dot')).toBeNull();
  });

  it('says so when the feed fails or the device is offline, in place of the dot (CH-16604, CH-16605)', () => {
    feed.override = 'paused';
    const a = card(PREVIEW_LIVE);
    expect(a.container.querySelector('[data-ch-code="CH-16604"]')!.textContent).toBe('Can’t refresh right now');
    expect(a.container.querySelector('.ch-lv-card__head .ch-lv-dot')).toBeNull();
    cleanup();
    feed.override = 'offline';
    const b = card(PREVIEW_LIVE);
    expect(b.container.querySelector('[data-ch-code="CH-16605"]')!.textContent).toBe('You’re offline');
  });

  it('opens the live view from the head: a chevron on the phone, a text button on a wide screen (CH-16603)', () => {
    const a = card(PREVIEW_LIVE);
    expect(a.container.querySelector('a.ch-lv-card__open')!.getAttribute('aria-label')).toBe('Open live view');
    cleanup();
    card(PREVIEW_LIVE, false);
    expect(screen.getByRole('link', { name: 'Open live view' }).getAttribute('href')).toBe('/golf/dashboard/live');
  });

  it('shows a tracked tournament as one row linking to its own live view (CH-16685)', () => {
    card(PREVIEW_LIVE_EVENT);
    const row = screen.getByRole('link', { name: /Fall Invitational · live/ });
    expect(row.getAttribute('href')).toBe('/golf/dashboard/tournaments/tour-fall/live');
    expect(row.getAttribute('data-ch-code')).toBe('CH-16685');
  });

  it('a lane opens the player in a sheet with Message (prefilled, never sent) and Open qualifier', async () => {
    card(PREVIEW_LIVE_ONE);
    await userEvent.click(screen.getByRole('button', { name: /Sofia Reyes/ }));
    const sheet = document.querySelector<HTMLElement>('dialog.ch-modal[open]')!;
    expect(sheet).toBeTruthy();
    expect(within(sheet).getByText(/Message Sofia/)).toBeTruthy();
    expect(within(sheet).getByText('Open qualifier')).toBeTruthy();
    expect(within(sheet).getAllByRole('table', { hidden: true })).toHaveLength(2);
  });
});
