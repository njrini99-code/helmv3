// @vitest-environment jsdom
/**
 * StandingDrill — the per-row counterfactual line is sized off the player's
 * OWN attempts per round for attempt-rate metrics (DC-ATTEMPT-1), and shows no
 * line at all when that rate is unknown, instead of the legacy per-unit
 * constant that overstated putting by more than 2x.
 *
 * Fixture: reconciliation 2026-09-25 (player 49ffe06d…) — 3-5 ft make 47.7%
 * vs Tour 90.5%, 44 band attempts over 21 rounds, 30-day baseline 72.8.
 * Own-rate sizing: 0.428 × 44/21 ≈ 0.90 strokes → 72.8 → 71.9. The legacy
 * path (42.8 × 0.10, clamped) projected a drop of more than 2 strokes.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageRouter } from '@/components/fairway/modules';
import { StandingDrill, standingProjection } from '../StandingDrill';
import { resolveStandingAttemptRates } from '../standingAttemptRates';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function standing(metric_id: string, player_value: number, pga_value: number, over: Partial<PlayerStanding> = {}): PlayerStanding {
  return {
    player_id: 'p-1',
    metric_id: metric_id as PlayerStanding['metric_id'],
    player_value,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value,
    pga_delta: player_value - pga_value,
    computed_at: '2026-09-24T06:00:00Z',
    ...over,
  };
}

const ROWS: Record<string, PlayerStanding> = {
  sg_total: standing('sg_total', -1.2, 0, { team_avg: -0.8, team_n: 8, team_pct: 30 }),
  putts_made_3_5ft_pct: standing('putts_made_3_5ft_pct', 47.7, 90.5, { team_avg: 60, team_n: 8, team_pct: 20 }),
  gir_pct: standing('gir_pct', 50, 67, { team_avg: 48, team_n: 8, team_pct: 60 }),
};

const RATES = resolveStandingAttemptRates({ rounds_played: 21, putt_attempts_3_5ft: 44 });

function renderDrill(rates: Record<string, number> | null) {
  return render(
    <StageRouter
      param="view"
      homeKey="home"
      views={[
        {
          key: 'home',
          node: <StandingDrill standingByMetric={ROWS} playerBaseline={72.8} attemptsPerRoundByMetric={rates} />,
        },
      ]}
    />,
  );
}

function openGroup(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function lineFor(container: HTMLElement, metric: string): string | null {
  const row = container.querySelector(`[data-slot="standing-row"][data-metric="${metric}"]`);
  expect(row).not.toBeNull();
  return row!.querySelector('[data-slot="standing-counterfactual"]')?.textContent ?? null;
}

describe('resolveStandingAttemptRates', () => {
  it('divides band attempts by rounds played, skips empty bands, and keeps par-type hole counts', () => {
    const r = resolveStandingAttemptRates({ rounds_played: 21, putt_attempts_3_5ft: 44, putt_attempts_5_10ft: 0, sand_attempts: 21 });
    expect(r.putts_made_3_5ft_pct).toBeCloseTo(44 / 21, 6);
    expect(r.putts_made_5_10ft_pct).toBeUndefined();
    expect(r.scrambling_pct_sand).toBeCloseTo(1, 6);
    expect(r.scoring_par_4).toBe(10);
    expect(r.gir_pct).toBeUndefined();
  });

  it('returns no per-player rates when rounds_played is zero or missing', () => {
    const r = resolveStandingAttemptRates({ rounds_played: 0, putt_attempts_3_5ft: 44 });
    expect(r.putts_made_3_5ft_pct).toBeUndefined();
  });
});

describe('standingProjection — own attempt rate, no legacy fallback', () => {
  const cfg = METRIC_RENDER_CONFIG.putts_made_3_5ft_pct;

  it('sizes the 3-5 ft gap off 44/21 attempts a round (≈0.90 strokes)', () => {
    const p = standingProjection('putts_made_3_5ft_pct', ROWS.putts_made_3_5ft_pct!, cfg, 72.8, RATES);
    expect(p).not.toBeNull();
    expect(p!.attempts_used).toBeCloseTo(44 / 21, 6);
    expect(p!.strokes_saved_per_round).toBeCloseTo(0.897, 3);
  });

  it('returns null (no line) for an attempt-rate metric with no known rate', () => {
    expect(standingProjection('putts_made_3_5ft_pct', ROWS.putts_made_3_5ft_pct!, cfg, 72.8, null)).toBeNull();
    expect(standingProjection('gir_pct', ROWS.gir_pct!, METRIC_RENDER_CONFIG.gir_pct, 72.8, RATES)).toBeNull();
  });

  it('keeps the constant path for SG (not an attempt-rate metric)', () => {
    const p = standingProjection('sg_total', ROWS.sg_total!, METRIC_RENDER_CONFIG.sg_total, 72.8, null);
    expect(p?.strokes_saved_per_round).toBeCloseTo(1.2, 6);
  });
});

describe('StandingDrill render', () => {
  it('prints the own-rate projection on the putting row, not the legacy one', () => {
    const { container } = renderDrill(RATES);
    openGroup(/Putting/);
    const line = lineFor(container, 'putts_made_3_5ft_pct');
    expect(line).toContain('72.8 → 71.9');
    expect(line).not.toMatch(/→ 70\./);
  });

  it('shows no putting or GIR strokes line without a rate, but keeps the SG line', () => {
    const { container } = renderDrill(null);
    openGroup(/Putting/);
    openGroup(/Approach/);
    openGroup(/Strokes Gained/);
    expect(lineFor(container, 'putts_made_3_5ft_pct')).toBeNull();
    expect(lineFor(container, 'gir_pct')).toBeNull();
    expect(lineFor(container, 'sg_total')).toContain('72.8 → 71.6');
  });

  it('opens with one summary: ahead-of-team count, the biggest win, and the refresh date', () => {
    const { container } = renderDrill(RATES);
    const summary = container.querySelector('[data-slot="standing-summary"]') as HTMLElement;
    expect(summary).not.toBeNull();
    // gir 50 vs team 48 is ahead; sg_total and 3-5 ft are behind.
    expect(within(summary).getByText('1 of 3')).toBeTruthy();
    // SG: Total (the aggregate, drawn as the visual) is never the "win"; the
    // putting row leads at its honest own-rate size (0.9, not the legacy 2+).
    expect(summary.textContent).toContain('Biggest win: Putts Made 3-5 ft. Closing it is worth about 0.9 strokes a round.');
    expect(summary.textContent).toContain('updated Sep 24');
    // Detail stays behind closed disclosures until tapped.
    expect(container.querySelector('[data-slot="standing-row"]')).toBeNull();
    for (const btn of within(container.querySelector('[data-slot="standing-categories"]') as HTMLElement).getAllByRole('button')) {
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(btn.className).toContain('min-h-11');
    }
  });
});
