/**
 * ============================================================================
 * FairwayPlayerCard — Wave 2 CoachHelm signal enrichment
 * ----------------------------------------------------------------------------
 * Before this pass the roster list card surfaced exactly ONE stat (Avg
 * score). This pins the new signal slice pulled from data already computed
 * server-side (roster/page.tsx): trend arrow, SG:Total (+ standing tier),
 * active focus-area count, active goal count — and the honest "None yet" /
 * em-dash degrade when a signal isn't available yet.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FairwayPlayerCard, type RosterPlayer } from './FairwayPlayerCard';

function makePlayer(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    hometown: 'Austin',
    state: 'TX',
    graduation_year: 2027,
    handicap: 2,
    status: 'active',
    rounds_count: 8,
    avg_score: 74.2,
    ...overrides,
  };
}

/**
 * The denominator was in hand and dropped.
 *
 * Observed in production 2026-08-18, coach Ben Potter / Guilford College. The
 * roster card showed Kalani Centeno at `SG:TOTAL -18.41` and Samanyu Bedi at
 * `-9.02` with nothing to separate them — Kalani has ONE round (that figure is
 * literally his single Aug 16 round at The Cardinal) and Samanyu has two, while
 * Luke Wise on the same screen has sixteen. A coach triaging the list reads
 * three numbers built on 1, 2 and 16 rounds as if they were comparable.
 *
 * `rounds_count` is already threaded to this component — roster/page.tsx:550
 * supplies it and FairwayCoachRoster sorts by it — it was declared in
 * `RosterPlayer` and never rendered. Every neighbouring surface states its
 * denominator: the team board prints "'30 · 1 rds · 88.0", round review prints
 * "14/15" per putting bucket. This card was the outlier.
 */
describe('FairwayPlayerCard — CoachHelm signal strip', () => {
  it('renders the trend glyph next to Avg score when a real trend signal exists', () => {
    render(<FairwayPlayerCard player={makePlayer({ recent_trend: 'improving' })} intent={null} />);
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });

  it('renders no trend glyph when there is no signal yet (honest, not fabricated)', () => {
    render(<FairwayPlayerCard player={makePlayer({ recent_trend: null })} intent={null} />);
    expect(screen.queryByText('Improving')).toBeNull();
    expect(screen.queryByText('Declining')).toBeNull();
    expect(screen.queryByText('Steady')).toBeNull();
  });

  it('formats a positive SG:Total with an explicit sign and the good tone', () => {
    render(<FairwayPlayerCard player={makePlayer({ sg_total: 0.42 })} intent={null} />);
    expect(screen.getByText('+0.42')).toBeInTheDocument();
  });

  it('formats a negative SG:Total without double-signing it', () => {
    render(<FairwayPlayerCard player={makePlayer({ sg_total: -1.3 })} intent={null} />);
    expect(screen.getByText('-1.30')).toBeInTheDocument();
  });

  it('shows an honest em-dash for SG:Total when the stats cache has no row yet', () => {
    render(<FairwayPlayerCard player={makePlayer({ sg_total: null })} intent={null} />);
    // Two "SG:Total" em-dash siblings aren't queried here — assert the label
    // renders and no signed number does.
    expect(screen.getByText('SG:Total')).toBeInTheDocument();
    expect(screen.queryByText(/^[+-]\d/)).toBeNull();
  });

  it('renders the standing-tier caption under SG:Total when present', () => {
    render(
      <FairwayPlayerCard
        player={makePlayer({ sg_total: 0.1, standing_tier: 'Top quartile on team' })}
        intent={null}
      />,
    );
    expect(screen.getByText('Top quartile on team')).toBeInTheDocument();
  });

  it('shows an active focus-area count badge when the player has one', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_focus_areas: 2 })} intent={null} />);
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('shows "None yet" for focus areas and goals when both are zero', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_focus_areas: 0, active_goals: 0 })} intent={null} />);
    expect(screen.getAllByText('None yet')).toHaveLength(2);
  });

  it('shows an active goals count badge when the player has one', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_goals: 3 })} intent={null} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('still renders the Avg score anchor stat and View player CTA unchanged', () => {
    render(<FairwayPlayerCard player={makePlayer()} intent={null} />);
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('74.2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View player/ })).toHaveAttribute(
      'href',
      '/golf/dashboard/roster/p1',
    );
  });

  it('states the round count behind the anchor stat', () => {
    render(<FairwayPlayerCard player={makePlayer({ rounds_count: 1, avg_score: 88 })} intent={null} />);
    // One round is the case that most needs the caveat.
    expect(screen.getByText(/1 round\b/i)).toBeInTheDocument();
  });

  it('pluralizes the round count', () => {
    render(<FairwayPlayerCard player={makePlayer({ rounds_count: 16 })} intent={null} />);
    expect(screen.getByText(/16 rounds/i)).toBeInTheDocument();
  });

  it('says "No rounds" rather than "0 rounds" when the player has never played', () => {
    render(<FairwayPlayerCard player={makePlayer({ rounds_count: 0, avg_score: undefined })} intent={null} />);
    expect(screen.getByText(/no rounds/i)).toBeInTheDocument();
  });
});

/**
 * GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1 (HIGH, "the standout defect of
 * the audit") — at 810×1080 tablet portrait and 844×390 mobile landscape the
 * 2-col roster grid gave each card ~265px, too narrow for its content:
 *   - the name collapsed to one letter + ellipsis ("Cole Bennett" -> "C..."),
 *     because it went through the shared PlayerIdentity primitive, which
 *     hardcodes single-line `truncate` on the name span.
 *   - the hometown truncated to two letters ("Austin..." -> "Aus...").
 *   - the Focus/Goals mini-stat badges clipped mid-word ("3 active" ->
 *     "3 activ") because Badge defaults to `whitespace-nowrap` and the card's
 *     own Surface clips at `overflow-hidden`.
 * FairwayCoachRoster's grid also moved off `md:grid-cols-2` (see its own
 * test) — these card-level fixes are the second line of defense so a very
 * long name or a genuinely narrow single-column width still can't repeat it.
 */
describe('FairwayPlayerCard — wrap-safe at narrow widths', () => {
  it('lets a long name wrap to 2 lines instead of truncating to one, and does not use single-line truncate', () => {
    render(
      <FairwayPlayerCard
        player={makePlayer({ first_name: 'Cole', last_name: 'Bennett' })}
        intent={null}
      />,
    );
    const nameEl = screen.getByText('Cole Bennett');
    expect(nameEl.className).toMatch(/\bline-clamp-2\b/);
    expect(nameEl.className).not.toMatch(/\btruncate\b/);
  });

  it('keeps the hometown on one truncating line with min-w-0 so it clips at the string end, not to 2 letters', () => {
    render(
      <FairwayPlayerCard
        player={makePlayer({ hometown: 'Austin', state: 'TX' })}
        intent={null}
      />,
    );
    const meta = screen.getByText('Austin, TX');
    expect(meta.className).toMatch(/\btruncate\b/);
    expect(meta.className).toMatch(/\bmin-w-0\b/);
  });

  it('lets the Focus mini-stat badge wrap instead of clipping mid-word ("3 active" never becomes "3 activ")', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_focus_areas: 3 })} intent={null} />);
    const badge = screen.getByText('3 active');
    expect(badge.className).toMatch(/\bwhitespace-normal\b/);
  });
});
