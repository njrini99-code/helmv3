/**
 * ============================================================================
 * player-dashboard-parts — GenomeFingerprintTeaser radar overflow (audit #170)
 * ----------------------------------------------------------------------------
 * The strokes-gained radar's `PolarAngleAxis` labels (e.g. "Approach") can sit
 * past the recharts `<svg>`'s own box on a narrow card. Every non-root `<svg>`
 * gets `overflow: hidden` from the browser's UA stylesheet by default, so that
 * label clips hard at the SVG edge ("Approach" → "Approac") with nothing in
 * this component's own styling asking for it. jsdom has no layout engine, so
 * this can't assert a literal pixel measurement — it asserts the class-level
 * contract that makes that clip impossible in a real browser: the radar's
 * wrapper overrides every descendant `<svg>` to `overflow: visible`.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GenomeFingerprintTeaser, TodayCard } from './player-dashboard-parts';
import type {
  StrokesGainedSnapshot,
  TodayEvent,
  ActionItem,
} from '@/app/golf/actions/dashboard-data';

const FULL_SG: StrokesGainedSnapshot = {
  sg_total: 1.2,
  sg_off_tee: 0.4,
  sg_approach: 0.9,
  sg_around_green: -0.2,
  sg_putting: 0.1,
};

describe('GenomeFingerprintTeaser — radar axis labels are never clipped by the SVG box', () => {
  it('wraps the radar in a container that overrides descendant <svg> overflow to visible', () => {
    const { container } = render(<GenomeFingerprintTeaser strokesGained={FULL_SG} />);

    const wrapper = Array.from(container.querySelectorAll<HTMLElement>('div')).find((el) =>
      el.className.includes('[&_svg]:overflow-visible'),
    );
    expect(wrapper).toBeDefined();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * TodayCard — Wave 3 player-home premium pass (Nick's flagged element)
 * ----------------------------------------------------------------------------
 * The old "What needs you" subtitle + populated "N thing(s) need(s) you"
 * preview row (a hero-style restatement of the SAME count the Action center
 * section already shows in full below it) is gone. The card's body now
 * always shows the player's real today content — next event + lead task —
 * regardless of whether a Hub feed (`hubSummary`) is present; `hubSummary`
 * only gates the footer's "See details" link.
 * ──────────────────────────────────────────────────────────────────────── */

const EVENT: TodayEvent = {
  id: 'e1',
  title: 'Team practice',
  event_type: 'practice',
  start_time: '2026-07-22T14:00:00.000Z',
  end_time: null,
  location: 'Range',
};

const TASK: ActionItem = {
  id: 't1',
  type: 'task',
  title: 'Submit round',
  date: '2026-07-22',
  overdue: false,
};

describe('TodayCard — no restated "N thing(s) need(s) you" preview row', () => {
  it('renders the real next event + lead task even when a hubSummary is present', () => {
    render(
      <TodayCard
        events={[EVENT]}
        actionItems={[TASK]}
        hubSummary={{ visible: true, count: 3 }}
      />,
    );

    expect(screen.getByText('Team practice')).toBeInTheDocument();
    expect(screen.getByText('Submit round')).toBeInTheDocument();
    // The old preview copy must never render again, in any form.
    expect(screen.queryByText(/things? needs? you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what needs you/i)).not.toBeInTheDocument();
  });

  it('shows the honest "Nothing scheduled" empty state when there is no local today content, even with a visible hubSummary', () => {
    render(<TodayCard events={[]} actionItems={[]} hubSummary={{ visible: true, count: 2 }} />);

    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    expect(screen.queryByText(/things? needs? you/i)).not.toBeInTheDocument();
  });

  it('gates the "See details" CTA on hubSummary.visible, independent of local today content', () => {
    render(<TodayCard events={[]} actionItems={[]} hubSummary={{ visible: true, count: 2 }} />);
    expect(screen.getByRole('link', { name: /see details/i })).toBeInTheDocument();
  });

  it('renders no "See details" CTA when there is no hubSummary (teamless player)', () => {
    render(<TodayCard events={[EVENT]} actionItems={[TASK]} />);
    expect(screen.queryByRole('link', { name: /see details/i })).not.toBeInTheDocument();
  });
});
