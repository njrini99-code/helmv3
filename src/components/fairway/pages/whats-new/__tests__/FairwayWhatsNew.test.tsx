/* eslint-disable jsx-a11y/anchor-is-valid, helm/no-raw-button -- thin test stand-ins for next/link and the design-system Button, not user-facing UI */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { WhatsNewItem } from '@/app/golf/actions/whats-new';

// ---------------------------------------------------------------------------
// Deterministic coverage for the Fairway "What's new" feed remediations:
//   P391 — machine-readable <time dateTime> + full-date title/aria-label
//   P392 — freshness "Updated …" line + a manual Refresh control (router.refresh)
//   P395 — each day <section> carries an accessible name with its count
//   P397 — quiet type segments filter the feed (and an honest filtered-empty)
//
// The heavy Fairway barrel (framer-motion ViewHeader, scroll-fade, Base UI) is
// replaced with thin stand-ins that surface the props under test, so these
// assertions are about FairwayWhatsNew's own behavior, not the design-system
// primitives. next/navigation is re-mocked locally to capture refresh().
// ---------------------------------------------------------------------------

const refreshMock = vi.fn();

// next/link's prefetch path constructs an IntersectionObserver; stub it as a
// no-op anchor so FeedRow renders without the observer constructor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: refreshMock,
  }),
}));

vi.mock('@/components/fairway', () => {
  return {
    // ViewHeader stand-in: render meta + secondaryActions, and expose the
    // segment row as real buttons that call onSegmentChange.
    ViewHeader: ({
      meta,
      secondaryActions,
      segments,
      segmentValue,
      onSegmentChange,
      segmentsAriaLabel,
    }: {
      meta?: ReactNode;
      secondaryActions?: ReactNode;
      segments?: { value: string; label: ReactNode; badge?: ReactNode }[];
      segmentValue?: string;
      onSegmentChange?: (v: string) => void;
      segmentsAriaLabel?: string;
    }) => (
      <header>
        <div data-testid="vh-meta">{meta}</div>
        <div data-testid="vh-actions">{secondaryActions}</div>
        {segments ? (
          <div role="group" aria-label={segmentsAriaLabel} data-testid="vh-segments">
            {segments.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={segmentValue === s.value}
                onClick={() => onSegmentChange?.(s.value)}
              >
                {s.label} {s.badge != null ? <span data-testid={`badge-${s.value}`}>{s.badge}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </header>
    ),
    Surface: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    EmptyState: ({
      title,
      description,
      action,
    }: {
      title?: ReactNode;
      description?: ReactNode;
      action?: ReactNode;
    }) => (
      <div data-testid="empty-state">
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    ),
    InlineNotice: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => (
      <div role="alert">
        {title}
        {children}
      </div>
    ),
    Button: ({
      children,
      onClick,
      busy,
      leftIcon,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      busy?: boolean;
      leftIcon?: ReactNode;
    }) => (
      <button type="button" onClick={onClick} aria-busy={busy || undefined}>
        {leftIcon}
        {children}
      </button>
    ),
    Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  };
});

import { FairwayWhatsNew } from '../FairwayWhatsNew';

function item(overrides: Partial<WhatsNewItem>): WhatsNewItem {
  return {
    type: 'insight_detected',
    occurredAt: new Date().toISOString(),
    playerId: 'p1',
    playerName: 'Alex Doe',
    title: 'Something happened',
    ...overrides,
  };
}

beforeEach(() => {
  refreshMock.mockClear();
  // localStorage may be touched by the seen-state effect; keep it inert.
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

/**
 * Regression guard for the React #418 hydration error this feed threw in
 * production on every load.
 *
 * The component carries 'use client' — which Next server-renders anyway — and
 * formatted every timestamp with `toLocale*(undefined)`, i.e. "whatever locale
 * and timezone the runtime happens to have". That is Node's on the server and
 * the browser's on the client, so the same instant rendered as two different
 * strings and React tore the subtree down (#418, text content mismatch).
 *
 * The property that makes hydration agree is that the rendered time is a pure
 * function of (instant, timeZone prop) and owes NOTHING to the ambient runtime
 * zone. These tests pin exactly that: one fixed UTC instant, rendered under two
 * explicit zones, must produce the two correct — and different — wall clocks.
 * If someone reinstates a runtime-default formatter, both cases collapse to the
 * same string and these fail.
 */
describe('FairwayWhatsNew — timestamps are a pure function of the timeZone prop (#418)', () => {
  // 15:42 UTC is 11:42 in New York (EDT, UTC-4) and 00:42 the NEXT DAY in
  // Tokyo (UTC+9) — a zone difference big enough to cross the date line, so a
  // regression cannot pass by coincidence.
  const occurredAt = '2026-06-18T15:42:00.000Z';

  it('formats against the supplied zone, not the runtime default', () => {
    const { unmount } = render(
      <FairwayWhatsNew
        success
        items={[item({ occurredAt, title: 'Insight detected' })]}
        timeZone="America/New_York"
      />,
    );
    const ny = document.querySelector('time[datetime="2026-06-18T15:42:00.000Z"]');
    expect(ny?.textContent).toContain('11:42');
    // The full date carried for AT/hover must follow the same zone.
    expect(ny?.getAttribute('aria-label') ?? '').toContain('Jun 18');
    unmount();

    render(
      <FairwayWhatsNew
        success
        items={[item({ occurredAt, title: 'Insight detected' })]}
        timeZone="Asia/Tokyo"
      />,
    );
    const tokyo = document.querySelector('time[datetime="2026-06-18T15:42:00.000Z"]');
    expect(tokyo?.textContent).toContain('12:42');
    // Tokyo is a day ahead at this instant — proves the DATE follows the zone
    // too, not just the clock.
    expect(tokyo?.getAttribute('aria-label') ?? '').toContain('Jun 19');
  });

  it('falls back to one consistent zone when the team has not set one', () => {
    // No `timeZone` prop: the formatters pass `undefined` through, which resolves
    // to the viewer's own zone. That is still deterministic ACROSS hydration,
    // because server and client each receive the same (absent) value — what must
    // never come back is a formatter that ignores the prop entirely.
    render(<FairwayWhatsNew success items={[item({ occurredAt, title: 'Insight detected' })]} />);
    const el = document.querySelector('time[datetime="2026-06-18T15:42:00.000Z"]');
    expect(el).not.toBeNull();
    expect(el?.textContent ?? '').toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('FairwayWhatsNew', () => {
  it('P391: renders each timestamp as a <time dateTime> with a full-date title/aria-label', () => {
    const occurredAt = '2026-06-18T15:42:00.000Z';
    render(<FairwayWhatsNew success items={[item({ occurredAt, title: 'Insight detected' })]} />);

    const timeEl = document.querySelector('time[datetime="2026-06-18T15:42:00.000Z"]');
    expect(timeEl).not.toBeNull();
    // Full localized date+time is carried for AT + hover, not just the bare time.
    expect(timeEl?.getAttribute('aria-label') ?? '').toMatch(/2026/);
    expect(timeEl?.getAttribute('title') ?? '').toMatch(/2026/);
  });

  it('P392: shows an "Updated" freshness line and a Refresh control that calls router.refresh()', () => {
    render(<FairwayWhatsNew success items={[item({})]} />);

    expect(screen.getByText(/Updated/i)).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshBtn);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('P395: gives each day section an accessible name carrying its count', () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    render(
      <FairwayWhatsNew
        success
        items={[
          item({ occurredAt: today.toISOString(), title: 'A' }),
          item({ occurredAt: new Date(today.getTime() + 60_000).toISOString(), title: 'B' }),
        ]}
      />,
    );

    // Today's group is a labelled <section> reporting "2 updates".
    const section = screen.getByRole('region', { name: /Today, 2 updates/i });
    expect(section).toBeInTheDocument();
    // The visible "(2)" count is aria-hidden (the accessible name carries it).
    const hiddenCount = section.querySelector('[aria-hidden="true"]');
    expect(hiddenCount?.textContent ?? '').toContain('(2)');
  });

  it('P397: type segments filter the feed and report per-type counts', () => {
    const now = new Date();
    render(
      <FairwayWhatsNew
        success
        items={[
          item({ type: 'insight_detected', title: 'INS', occurredAt: now.toISOString() }),
          item({ type: 'pattern_validated', title: 'PAT', occurredAt: new Date(now.getTime() - 1000).toISOString() }),
          item({ type: 'focus_area_created', title: 'FOC', occurredAt: new Date(now.getTime() - 2000).toISOString() }),
        ]}
      />,
    );

    // All three visible initially.
    expect(screen.getByText('INS')).toBeInTheDocument();
    expect(screen.getByText('PAT')).toBeInTheDocument();
    expect(screen.getByText('FOC')).toBeInTheDocument();

    // Per-type badges reflect the true counts.
    expect(screen.getByTestId('badge-insights').textContent).toBe('1');
    expect(screen.getByTestId('badge-patterns').textContent).toBe('1');
    expect(screen.getByTestId('badge-focus').textContent).toBe('1');

    // Filtering to Insights hides the pattern + focus rows.
    fireEvent.click(screen.getByRole('button', { name: /Insights/i }));
    expect(screen.getByText('INS')).toBeInTheDocument();
    expect(screen.queryByText('PAT')).not.toBeInTheDocument();
    expect(screen.queryByText('FOC')).not.toBeInTheDocument();
  });

  it('P397: a filter that matches nothing shows an honest filtered-empty state, not "No activity yet"', () => {
    const now = new Date();
    render(
      <FairwayWhatsNew
        success
        items={[
          item({ type: 'insight_detected', title: 'INS', occurredAt: now.toISOString() }),
          item({ type: 'insight_resolved', title: 'INS2', occurredAt: new Date(now.getTime() - 1000).toISOString() }),
        ]}
      />,
    );

    // Switch to Patterns — there are no pattern events.
    fireEvent.click(screen.getByRole('button', { name: /Patterns/i }));
    const empty = screen.getByTestId('empty-state');
    expect(within(empty).getByText(/No matching activity/i)).toBeInTheDocument();
    // And it offers a one-click return to the full feed.
    fireEvent.click(within(empty).getByRole('button', { name: /Show all updates/i }));
    expect(screen.getByText('INS')).toBeInTheDocument();
  });
});
