/**
 * EvidencePanel tests — UI-1 of the Insight Quality phase.
 *
 * Covers:
 *  - renders nothing when evidence is missing (legacy pre-phase rows)
 *  - compact mode surfaces the four key facts
 *  - expanded mode surfaces all seven rows
 *  - confidence colour thresholds (green ≥ 0.7, amber 0.4-0.7, gray < 0.4)
 *  - formatValue handles every InsightUnit enum value
 *
 * These are pure-render tests — no server actions, no routing, no mocks
 * beyond what src/test/setup.tsx already provides.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  EvidencePanel,
  formatValue,
  formatWindow,
  confidenceColor,
  sanitizeStrokesImpact,
} from '@/components/golf/coachhelm/insights/EvidencePanel';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: 'Make rate from 6-10 feet',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: {
      sample_adequacy: 1,
      recency: 1,
      variance: 0.5,
    },
    ...overrides,
  };
}

describe('EvidencePanel', () => {
  it('renders nothing when evidence is undefined', () => {
    const { container } = render(<EvidencePanel evidence={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when evidence is null', () => {
    const { container } = render(<EvidencePanel evidence={null} />);
    expect(container.firstChild).toBeNull();
  });

  // W15: when v2 generators inject `evidence.standing` (W14) and the
  // metric_id resolves to a canonical v3 metric, EvidencePanel renders
  // the v3 StandingBars (bar rows) instead of the plain value-pair text.
  it('renders v3 StandingBars when evidence.standing is present (W15)', () => {
    const evidence = makeEvidence();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (evidence as any).standing = {
      metric_id: 'putts_made_10_15ft_pct',
      player_value: 38,
      team_avg: 41,
      team_n: 6,
      team_pct: 22,
      pga_value: 36,
      pga_delta: 2,
      computed_at: '2026-05-25T00:00:00.000Z',
    };
    const { container } = render(<EvidencePanel evidence={evidence} compact />);
    // StandingBars renders the metric's canonical display_label from metric-config
    expect(screen.getByText('Putts Made 10-15 ft')).toBeTruthy();
    // StandingBars renders label/value as separate cells in labeled bar rows
    // (not the old inline "You 38%" text) — assert against the figure's
    // derived aria-label, which carries every value in one accessible string.
    const figure = container.querySelector('[data-slot="standing-bars"]');
    expect(figure).toBeTruthy();
    const ariaLabel = figure!.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toMatch(/You: 38%/);
    expect(ariaLabel).toMatch(/PGA Tour: 36%/);
  });

  // Defense: an unknown / non-canonical metric_id in evidence.standing
  // falls through to the plain value-pair text rather than rendering
  // a broken v3 bar with missing direction/unit.
  it('falls through to the plain value pair when standing.metric_id is unknown', () => {
    const evidence = makeEvidence();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (evidence as any).standing = {
      metric_id: 'made_up_metric',
      player_value: 1,
      team_avg: 2,
      team_n: 6,
      team_pct: 50,
      pga_value: 3,
      pga_delta: -2,
      computed_at: '2026-05-25T00:00:00.000Z',
    };
    render(<EvidencePanel evidence={evidence} compact />);
    // Canonical v3 metric display labels aren't present
    expect(screen.queryByText('Putts Made 10-15 ft')).toBeNull();
    // The plain value-pair renders in its place
    expect(screen.getByTestId('evidence-value-pair')).toBeTruthy();
  });

  // TODO(plan-03 + user-wip): see src/test/SKIPPED.md.
  it.skip('compact mode renders the four key facts in a single row', () => {
    render(<EvidencePanel evidence={makeEvidence()} compact />);

    // Your number vs comparison pill
    const yourValue = screen.getByTestId('evidence-your-value');
    expect(yourValue.textContent).toContain('38%');
    expect(yourValue.textContent).toContain('52%');
    expect(yourValue.textContent).toContain('D2 average');

    // Sample + window
    expect(screen.getByTestId('evidence-sample').textContent).toContain('47 putts');
    expect(screen.getByTestId('evidence-sample').textContent).toContain('30 days');

    // Strokes impact
    expect(screen.getByTestId('evidence-impact').textContent).toContain('2.1');
    expect(screen.getByTestId('evidence-impact').textContent).toContain('strokes');

    // Confidence
    expect(screen.getByTestId('evidence-confidence').textContent).toContain('78%');
  });

  it('expanded mode renders all seven rows', () => {
    render(<EvidencePanel evidence={makeEvidence()} compact={false} />);

    expect(screen.getByTestId('evidence-row-your')).toHaveTextContent('Your number');
    expect(screen.getByTestId('evidence-row-comparison')).toHaveTextContent('Comparison');
    expect(screen.getByTestId('evidence-row-sample')).toHaveTextContent('Sample');
    expect(screen.getByTestId('evidence-row-window')).toHaveTextContent('Window');
    expect(screen.getByTestId('evidence-row-impact')).toHaveTextContent('Strokes impact');
    expect(screen.getByTestId('evidence-row-method')).toHaveTextContent('Method');
    expect(screen.getByTestId('evidence-row-confidence')).toHaveTextContent('Confidence');

    // Metric label header
    expect(screen.getByText('Make rate from 6-10 feet')).toBeInTheDocument();

    // Progress bar should be accessible
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '78');
  });

  describe('confidenceColor thresholds', () => {
    it('returns green (primary) for confidence >= 0.7', () => {
      const result = confidenceColor(0.7);
      expect(result.bar).toContain('primary');
      expect(result.text).toContain('primary');
    });

    it('returns amber for confidence 0.4 <= c < 0.7', () => {
      const low = confidenceColor(0.4);
      const mid = confidenceColor(0.6);
      expect(low.bar).toContain('amber');
      expect(mid.bar).toContain('amber');
    });

    it('returns gray for confidence < 0.4', () => {
      const result = confidenceColor(0.3);
      expect(result.bar).toContain('warm');
      expect(result.text).toContain('warm');
    });
  });

  describe('formatValue unit handling', () => {
    it('formats percent (0..1 fraction scaled to %)', () => {
      expect(formatValue(0.38, 'percent')).toBe('38%');
    });

    it('formats percent values already scaled >1 without double-scaling', () => {
      expect(formatValue(38, 'percent')).toBe('38%');
    });

    it('formats strokes with sign and one decimal', () => {
      expect(formatValue(2.1, 'strokes')).toBe('+2.1');
      expect(formatValue(-1.3, 'strokes')).toBe('-1.3');
    });

    it('formats yards rounded to nearest integer', () => {
      expect(formatValue(24.4, 'yards')).toBe('24 yd');
    });

    it('formats feet rounded to nearest integer', () => {
      expect(formatValue(8.6, 'feet')).toBe('9 ft');
    });

    it('formats count as rounded integer', () => {
      expect(formatValue(47, 'count')).toBe('47');
    });

    it('prefers your_value_display when provided', () => {
      expect(formatValue(0.38, 'percent', '38.2%')).toBe('38.2%');
    });
  });

  // FID-5: render-time sanity ceiling on strokes_impact.
  describe('sanitizeStrokesImpact (FID-5)', () => {
    it('passes plausible magnitudes through unchanged', () => {
      expect(sanitizeStrokesImpact(2.1)).toBe(2.1);
      expect(sanitizeStrokesImpact(-1.3)).toBe(-1.3);
      expect(sanitizeStrokesImpact(0)).toBe(0);
    });

    it('clamps impossible magnitudes to the ±8 ceiling', () => {
      expect(sanitizeStrokesImpact(42.53)).toBe(8);
      expect(sanitizeStrokesImpact(-99)).toBe(-8);
    });

    it('coerces non-finite values to 0', () => {
      expect(sanitizeStrokesImpact(Number.NaN)).toBe(0);
      expect(sanitizeStrokesImpact(null)).toBe(0);
      expect(sanitizeStrokesImpact(undefined)).toBe(0);
    });

    it('never shows the raw 40+ figure in the rendered panel', () => {
      render(<EvidencePanel evidence={makeEvidence({ strokes_impact: 42.53 })} compact={false} />);
      const impactRow = screen.getByTestId('evidence-row-impact');
      expect(impactRow.textContent).toContain('8.0');
      expect(impactRow.textContent).not.toContain('42.5');
    });

    it('suppresses the compact impact pill when impact rounds to 0.0', () => {
      render(<EvidencePanel evidence={makeEvidence({ strokes_impact: 0.03 })} compact />);
      expect(screen.queryByTestId('evidence-impact')).toBeNull();
    });
  });

  // ui-tone-4: percent display must stay domain-aware (whole-number vs
  // fraction) now that the value pair is plain text rather than a positioned
  // axis — there's no "collapse to the edge" failure mode left to guard, but
  // the underlying formatting bug (double-scaling / mismatched reads) is
  // still worth pinning.
  describe('EvidenceValuePair percent formatting (ui-tone-4)', () => {
    it('formats whole-number percents without double-scaling', () => {
      render(
        <EvidencePanel
          evidence={makeEvidence({
            unit: 'percent',
            your_value: 38,
            your_value_display: undefined,
            comparison_value: 52,
          })}
          compact
        />,
      );
      const pair = screen.getByTestId('evidence-value-pair');
      expect(pair.textContent).toContain('38%');
      expect(pair.textContent).toContain('52%');
    });

    it('formats a mixed fraction/whole-number pair independently, without a fabricated shared scale', () => {
      // FID-5: your_value as whole-percent (65) vs comparison as fraction
      // (0.62) is a representation mismatch. Each value is formatted on its
      // own terms (no shared axis to mislead), so both read correctly.
      render(
        <EvidencePanel
          evidence={makeEvidence({
            unit: 'percent',
            your_value: 65,
            your_value_display: undefined,
            comparison_value: 0.62,
          })}
          compact
        />,
      );
      const pair = screen.getByTestId('evidence-value-pair');
      expect(pair.textContent).toContain('65%');
      expect(pair.textContent).toContain('62%');
    });
  });

  // Regression: `synthesizeTeamSignals` (team-synthesis.ts) mints an
  // evidence blob with only `{ metric, metric_label, strokes_impact,
  // players_affected }` — none of the fields below. The Triage Desk's
  // SignalInsightPanel/SignalDossier used to cast this straight to
  // `InsightEvidence`, and this component printed "undefined You ·
  // undefined", "undefined putts · undefined days" and "NaN% confidence"
  // (2026-09 facelift capture). This shape should never reach EvidencePanel
  // once `resolveSignalEvidence` (buildTriageViewModel.ts) is used at the
  // call site, but the component guards it independently too, since it has
  // callers this file doesn't own.
  describe('malformed / team-synthesis-shaped evidence (regression)', () => {
    it('never renders the literal string "undefined" or "NaN"', () => {
      const teamSynthesisEvidence = {
        metric: 'putts_made_3_5ft_pct',
        metric_label: 'Putts Made 3-5 ft',
        strokes_impact: 12.17,
        players_affected: 6,
      } as unknown as InsightEvidence;

      const { container } = render(<EvidencePanel evidence={teamSynthesisEvidence} compact />);
      expect(container.textContent).not.toMatch(/undefined/i);
      expect(container.textContent).not.toMatch(/NaN/);
      // No value pair, no sample/window text, no confidence pill — every
      // guarded field is genuinely absent, so this renders nothing rather
      // than a half-populated row.
      expect(screen.queryByTestId('evidence-value-pair')).toBeNull();
      expect(screen.queryByTestId('evidence-sample')).toBeNull();
      expect(screen.queryByTestId('evidence-confidence')).toBeNull();
    });

    it('expanded mode shows "Not available" instead of "undefined" for missing fields', () => {
      const teamSynthesisEvidence = {
        metric: 'putts_made_3_5ft_pct',
        metric_label: 'Putts Made 3-5 ft',
        strokes_impact: 12.17,
        players_affected: 6,
      } as unknown as InsightEvidence;

      render(<EvidencePanel evidence={teamSynthesisEvidence} compact={false} />);
      expect(screen.getByTestId('evidence-row-your')).toHaveTextContent('Not available');
      expect(screen.getByTestId('evidence-row-comparison')).toHaveTextContent('Not available');
      expect(screen.getByTestId('evidence-row-confidence')).toHaveTextContent('Not available');
    });
  });

  describe('formatWindow', () => {
    it('renders days + date range when both ends parse', () => {
      const out = formatWindow('2026-03-23T00:00:00Z', '2026-04-22T00:00:00Z', 30);
      expect(out).toContain('30 days');
      expect(out).toContain('Mar 23');
      expect(out).toContain('Apr 22');
    });

    it('falls back to day count when dates are unparseable', () => {
      expect(formatWindow('not-a-date', 'also-not-a-date', 30)).toBe('30 days');
    });
  });
});
