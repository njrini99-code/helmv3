// @vitest-environment jsdom
/**
 * ============================================================================
 * NotificationRow — required-nullable `now`, no internal clock read
 * ----------------------------------------------------------------------------
 * `now` is required (not optional) precisely so every caller — including
 * this test — must decide what to render before the clock is known, instead
 * of the row quietly reading `Date.now()` itself (React #418: the value
 * would differ between a server render and the client's first paint).
 *
 * `now: null` (the pre-mount state every caller seeds with, per
 * NotificationBell/NotificationsLatestModule) falls back to the same
 * absolute, en-US/UTC-pinned `fullDateTime` string every pass renders
 * identically — never a relative "3m ago" label that depends on the reader's
 * clock. Once `now` is seeded, the row switches to the fast-moving relative
 * label, keyed off the caller's `now`, not an internal read.
 *
 * NOTE: as observed in review, this component tree has no reachable render
 * path today where `now` stays `null` past first paint (NotificationBell and
 * NotificationsLatestModule both seed `now` synchronously in a mount effect
 * before this row is visible) — so this is hardening for a real prop
 * contract, not a fix for an actively-reachable mismatch.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationRow } from './NotificationRow';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

function makeItem(overrides: Partial<UnifiedNotificationItem> = {}): UnifiedNotificationItem {
  return {
    id: 'n1',
    source: 'messages',
    category: 'messages',
    title: 'Jordan Lee sent a message',
    body: 'See you at practice',
    action_url: null,
    created_at: '2026-09-01T15:00:00.000Z',
    read_at: null,
    ...overrides,
  } as UnifiedNotificationItem;
}

describe('NotificationRow — now: Date | null', () => {
  it('renders the absolute, timezone-pinned date (not a clock-dependent relative label) when now is null', () => {
    render(<NotificationRow item={makeItem()} onClick={vi.fn()} now={null} />);
    expect(screen.getByText('Tue, Sep 1, 2026, 3:00 PM UTC')).toBeInTheDocument();
  });

  it('renders a relative label derived from the caller-provided now once seeded, not from the real system clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z')); // far from the real clock
    const now = new Date('2026-09-01T15:03:00.000Z'); // 3 minutes after created_at
    render(<NotificationRow item={makeItem()} onClick={vi.fn()} now={now} />);
    expect(screen.getByText('3m ago')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
