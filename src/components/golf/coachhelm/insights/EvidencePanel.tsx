/**
 * EvidencePanel — presents the canonical `InsightEvidence` JSONB attached to
 * an insight. Ships in two densities:
 *
 *  - `compact` (default card view): a single row of pills with the four most
 *    load-bearing facts — your number, comparison, sample/window, strokes
 *    impact. Tiny, tabular-nums, sits directly under the insight title.
 *  - expanded (user tapped "show details"): a 2-column key/value grid that
 *    enumerates every evidence field plus a confidence progress bar.
 *
 * Renders nothing when `evidence` is null/undefined so legacy pre-phase
 * insight rows don't break the UI.
 *
 * Design contract:
 * docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 */
import { cn } from '@/lib/utils';
import type {
  InsightEvidence,
  InsightUnit,
} from '@/lib/coachhelm/v2/insights/types';
import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { EvidenceStanding } from '@/lib/coachhelm/v2/insights/standing-injection';

/**
 * W15: When v2 generators have injected `evidence.standing` (W14), render
 * the v3 StandingBar instead of the legacy BenchmarkScale. v3 carries
 * cohort percentile + team_n cold-start gating + auto a11y label.
 *
 * Returns the v3 component when:
 *   - `evidence.standing` is present and well-formed
 *   - The standing's metric_id maps to a canonical v3 metric (via
 *     metric-config), so direction + unit + scale are known
 *
 * Otherwise returns null — caller falls through to BenchmarkScale.
 */
function tryRenderV3Standing(evidence: InsightEvidence): React.ReactElement | null {
  const standing = (evidence as InsightEvidence & { standing?: EvidenceStanding }).standing;
  if (!standing || !standing.metric_id) return null;
  const cfg = getMetricRenderConfig(standing.metric_id);
  if (!cfg) return null;
  return (
    <StandingBar
      metric_id={standing.metric_id}
      metric_label={cfg.display_label}
      player_value={standing.player_value}
      team_avg={standing.team_avg}
      team_n={standing.team_n}
      team_pct={standing.team_pct}
      pga_value={standing.pga_value}
      direction={cfg.direction}
      unit={cfg.unit}
      scale={cfg.default_scale}
      size="card"
    />
  );
}

export interface EvidencePanelProps {
  /** The full InsightEvidence JSON blob from golf_coach_insights.evidence. */
  evidence: InsightEvidence | null | undefined;
  /** When true render the single-row summary; when false render the full grid. */
  compact?: boolean;
  /** Optional test-id hook so integrators can target the wrapper in e2e specs. */
  'data-testid'?: string;
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Formats an evidence value given its unit. Prefers the pre-formatted
 * `your_value_display` string when present (generators render it once with
 * the right rounding/sign rules, so UI code shouldn't second-guess them).
 */
export function formatValue(
  value: number,
  unit: InsightUnit,
  display?: string,
): string {
  if (display && display.trim().length > 0) return display;
  switch (unit) {
    case 'percent': {
      // your_value for `percent` is a 0..1 fraction; scale for display.
      const pct = Math.abs(value) <= 1 ? value * 100 : value;
      return `${Math.round(pct)}%`;
    }
    case 'strokes': {
      const sign = value > 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}`;
    }
    case 'yards':
      return `${Math.round(value)} yd`;
    case 'feet':
      return `${Math.round(value)} ft`;
    case 'count':
      return `${Math.round(value)}`;
    default:
      return String(value);
  }
}

/**
 * "30 days (Mar 23 - Apr 22)". Falls back to plain day-count if the dates
 * don't parse — generators should send ISO but we stay defensive.
 */
export function formatWindow(
  start: string,
  end: string,
  days: number,
): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${days} days`;
  }
  const fmt = (d: Date) => `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${days} days (${fmt(startDate)} – ${fmt(endDate)})`;
}

/** green ≥ 0.7, amber 0.4..0.7, gray < 0.4 */
export function confidenceColor(c: number): {
  bar: string;
  text: string;
  bg: string;
} {
  if (c >= 0.7) return { bar: 'bg-primary-500', text: 'text-primary-700', bg: 'bg-primary-100' };
  if (c >= 0.4) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-100' };
  return { bar: 'bg-warm-400', text: 'text-warm-600', bg: 'bg-warm-100' };
}

/**
 * FID-5: a render-time sanity ceiling on `strokes_impact`. The engine should
 * cap counterfactuals upstream, but undeployed/stale rows have shipped values
 * up to ~42 strokes/round (an impossible single-leak leverage). Clamp the
 * magnitude defensively so a card never displays "~42.5 strokes/round".
 * 8 strokes/round is already an extreme leak; anything past it is bad data.
 */
const STROKES_IMPACT_CEILING = 8;
export function sanitizeStrokesImpact(raw: number | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return sign * Math.min(Math.abs(n), STROKES_IMPACT_CEILING);
}

/**
 * ui-tone-4: percent evidence arrives in two representations — a 0..1 fraction
 * (0.65) OR a whole-number percent (65). The original axis hard-clamped the
 * percent domain to [0, 1], which collapsed every whole-number-percent row's
 * ticks onto the right edge (38 and 52 both → 100%). This returns the correct
 * clamp BOUNDS for the percent domain the row actually uses: [0, 1] when all
 * values look like fractions, else [0, 100]. Non-percent units don't clamp.
 *
 * FID-5: it also surfaces whether the supplied values share a representation.
 * A mixed pair (one fraction-looking ≤1, one whole-looking >1) can't be drawn
 * on one honest axis — the caller skips the percent clamp and lets the natural
 * padded extents drive positioning rather than fabricating a shared scale.
 */
function percentAxisBounds(
  values: number[],
  unit: InsightUnit,
): { min: number; max: number } | null {
  if (unit !== 'percent') return null;
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const anyWhole = finite.some((v) => Math.abs(v) > 1);
  const anyFractionOnly = finite.some((v) => Math.abs(v) > 0 && Math.abs(v) < 1);
  // FID-5: mixed representation (e.g. 65 vs 0.62) — refuse to clamp; a shared
  // percent axis would mislead. Natural extents stay in charge.
  if (anyWhole && anyFractionOnly) return null;
  return anyWhole ? { min: 0, max: 100 } : { min: 0, max: 1 };
}

const METHOD_LABELS: Record<InsightEvidence['strokes_impact_method'], string> = {
  sg_baseline: 'Strokes-gained baseline',
  historical_correlation: 'Historical correlation',
  peer_delta: 'Peer delta',
  rough_estimate: 'Rough estimate',
};

const SOURCE_LABELS: Record<InsightEvidence['comparison_source'], string> = {
  d1_avg: 'D1 average',
  d2_avg: 'D2 average',
  d3_avg: 'D3 average',
  naia_avg: 'NAIA average',
  juco_avg: 'JUCO average',
  your_baseline: 'Your baseline',
  team_avg: 'Team average',
  pga_baseline: 'PGA baseline',
  absolute_target: 'Target',
};

/**
 * "47 putts" / "24 rounds" — unit-aware sample wording. Count is the default
 * because most generators report counts; putts/rounds/shots get pulled from
 * the metric label when we can parse it, otherwise we fall back to "obs".
 */
function formatSample(sample: number, metric: string): string {
  const noun = sample === 1 ? 'observation' : 'observations';
  // Quick pattern: look for the last underscore-free word in metric to derive
  // a noun (e.g. putt_make_rate_6_10ft -> "putts").
  if (/putt/i.test(metric)) return `${sample} putt${sample === 1 ? '' : 's'}`;
  if (/approach/i.test(metric)) return `${sample} approach${sample === 1 ? '' : 'es'}`;
  if (/tee|drive/i.test(metric)) return `${sample} tee shot${sample === 1 ? '' : 's'}`;
  if (/round/i.test(metric)) return `${sample} round${sample === 1 ? '' : 's'}`;
  if (/scramble|scrambl/i.test(metric)) return `${sample} attempt${sample === 1 ? '' : 's'}`;
  return `${sample} ${noun}`;
}

/**
 * Horizontal scale that places the player's value, the primary baseline
 * (team avg), and the optional secondary baseline (PGA) as ticks on the
 * same axis. Lets the coach see at a glance both "where am I" and "where
 * is the team" relative to "tour-grade." Falls back to the legacy "X vs Y"
 * pill when the metric only carries a single anchor.
 */
function BenchmarkScale({ evidence }: { evidence: InsightEvidence }) {
  const ticks: Array<{
    value: number;
    label: string;
    role: 'you' | 'primary' | 'secondary';
  }> = [
    {
      value: evidence.your_value,
      label: 'You',
      role: 'you',
    },
    {
      value: evidence.comparison_value,
      label: SOURCE_LABELS[evidence.comparison_source] ?? evidence.comparison_label,
      role: 'primary',
    },
  ];
  if (
    typeof evidence.secondary_value === 'number' &&
    evidence.secondary_value !== evidence.comparison_value
  ) {
    ticks.push({
      value: evidence.secondary_value,
      label: evidence.secondary_label
        ?? (evidence.secondary_source ? SOURCE_LABELS[evidence.secondary_source] : 'Benchmark'),
      role: 'secondary',
    });
  }

  // Pad the axis 25% beyond the extremes so the ticks aren't pinned to
  // the edges. ui-tone-4: for percent metrics clamp to a DOMAIN-AWARE range
  // ([0,1] for fractions, [0,100] for whole-number percents) so a row of
  // 38%/52% no longer collapses both ticks onto the right edge.
  const tickValues = ticks.map((t) => t.value);
  const rawMin = Math.min(...tickValues);
  const rawMax = Math.max(...tickValues);
  const span = Math.max(rawMax - rawMin, 0.0001);
  const pad = span * 0.25;
  let axisMin = rawMin - pad;
  let axisMax = rawMax + pad;
  const pctBounds = percentAxisBounds(tickValues, evidence.unit);
  if (pctBounds) {
    axisMin = Math.max(pctBounds.min, axisMin);
    axisMax = Math.min(pctBounds.max, axisMax);
  }
  const axisSpan = Math.max(axisMax - axisMin, 0.0001);

  const positions = ticks.map((t) => ({
    ...t,
    pct: ((t.value - axisMin) / axisSpan) * 100,
  }));

  const youColor = 'bg-primary-600 text-white ring-2 ring-primary-200';
  const primaryColor = 'bg-warm-700 text-white ring-1 ring-warm-200/45';
  const secondaryColor = 'bg-violet-600 text-white ring-2 ring-violet-200';

  return (
    <div className="space-y-2" data-testid="evidence-benchmark-scale">
      <div className="relative h-7">
        {/* Axis */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-gradient-to-r from-warm-200/80 via-warm-200 to-warm-200/80" />
        {positions.map((p, i) => (
          <span
            key={`${p.role}-${i}`}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
              'w-3 h-3 rounded-full',
              'shadow-[0_1px_3px_rgba(16,24,40,0.18)]',
              p.role === 'you' && youColor,
              p.role === 'primary' && primaryColor,
              p.role === 'secondary' && secondaryColor,
            )}
            style={{ left: `${Math.max(0, Math.min(100, p.pct))}%` }}
            aria-label={`${p.label}: ${formatValue(p.value, evidence.unit, p.role === 'you' ? evidence.your_value_display : undefined)}`}
            title={`${p.label}: ${formatValue(p.value, evidence.unit, p.role === 'you' ? evidence.your_value_display : undefined)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-eyebrow tabular-nums">
        {positions.map((p, i) => (
          <span
            key={`legend-${p.role}-${i}`}
            className="inline-flex items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                'w-2 h-2 rounded-full',
                p.role === 'you' && 'bg-primary-600',
                p.role === 'primary' && 'bg-warm-700',
                p.role === 'secondary' && 'bg-violet-600',
              )}
            />
            <span className="text-warm-700 font-medium">
              {formatValue(p.value, evidence.unit, p.role === 'you' ? evidence.your_value_display : undefined)}
            </span>
            <span className="text-warm-500">{p.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function EvidencePanel({
  evidence,
  compact = true,
  'data-testid': testId,
}: EvidencePanelProps) {
  // Defensive: an insight minted before this phase will have no evidence
  // JSON. Render nothing rather than a half-populated panel.
  if (!evidence) return null;

  const confPct = Math.round(Math.max(0, Math.min(1, evidence.confidence)) * 100);
  const colors = confidenceColor(evidence.confidence);

  // FID-5: clamp the stroke magnitude at render so an impossible upstream
  // value (stale rows have carried 40+ strokes/round) never reaches the eye.
  const safeImpact = sanitizeStrokesImpact(evidence.strokes_impact);

  // W15: prefer v3 StandingBar when v14 generators have populated
  // evidence.standing AND the metric_id resolves to a canonical v3 metric.
  // Falls through to the legacy BenchmarkScale for v2-only insights.
  const v3Standing = tryRenderV3Standing(evidence);

  if (compact) {
    return (
      <div
        data-testid={testId ?? 'evidence-panel-compact'}
        className={cn('mt-3 space-y-2.5')}
      >
        {v3Standing ?? <BenchmarkScale evidence={evidence} />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-eyebrow text-warm-500 tabular-nums">
          <span data-testid="evidence-sample">
            {formatSample(evidence.sample_n, evidence.metric)} · {evidence.window_days} days
          </span>
          {Math.round(Math.abs(safeImpact) * 10) > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-warm-700 font-medium" data-testid="evidence-impact">
                ~{Math.abs(safeImpact).toFixed(1)} strokes/round
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span
            className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium', colors.bg, colors.text)}
            data-testid="evidence-confidence"
          >
            {confPct}% confidence
          </span>
        </div>
      </div>
    );
  }

  // Expanded mode — 2-column key/value grid.
  const rows: Array<{ label: string; value: React.ReactNode; testId: string }> = [
    {
      label: 'Your number',
      value: (
        <span className="font-medium text-warm-900">
          {formatValue(evidence.your_value, evidence.unit, evidence.your_value_display)}
        </span>
      ),
      testId: 'evidence-row-your',
    },
    {
      label: 'Comparison',
      value: (
        <span>
          <span className="font-medium text-warm-900">
            {formatValue(evidence.comparison_value, evidence.unit)}
          </span>{' '}
          <span className="text-warm-500">
            ({SOURCE_LABELS[evidence.comparison_source] ?? evidence.comparison_label})
          </span>
        </span>
      ),
      testId: 'evidence-row-comparison',
    },
    {
      label: 'Sample',
      value: <span>{formatSample(evidence.sample_n, evidence.metric)}</span>,
      testId: 'evidence-row-sample',
    },
    {
      label: 'Window',
      value: (
        <span>{formatWindow(evidence.window_start, evidence.window_end, evidence.window_days)}</span>
      ),
      testId: 'evidence-row-window',
    },
    {
      label: 'Strokes impact',
      value: (
        <span>
          ~{Math.abs(safeImpact).toFixed(1)}{' '}
          <span className="text-warm-500">strokes/round</span>
        </span>
      ),
      testId: 'evidence-row-impact',
    },
    {
      label: 'Method',
      value: (
        <span className="text-warm-700">
          {METHOD_LABELS[evidence.strokes_impact_method] ?? evidence.strokes_impact_method}
        </span>
      ),
      testId: 'evidence-row-method',
    },
  ];

  return (
    <div
      data-testid={testId ?? 'evidence-panel-expanded'}
      className={cn(
        'mt-3 bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-4',
      )}
    >
      {/* W15: v3 StandingBar above the legacy key/value grid when present. */}
      {v3Standing && <div className="mb-3">{v3Standing}</div>}
      <div className="mb-2 text-eyebrow font-medium uppercase tracking-wide text-warm-500">
        {evidence.metric_label}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-warm-800">
        {rows.map((r) => (
          <div key={r.testId} className="contents" data-testid={r.testId}>
            <dt className="text-warm-500">{r.label}</dt>
            <dd className="tabular-nums">{r.value}</dd>
          </div>
        ))}
        <div className="contents" data-testid="evidence-row-confidence">
          <dt className="text-warm-500">Confidence</dt>
          <dd className="flex items-center gap-2 tabular-nums">
            <span className={cn('font-medium', colors.text)}>{confPct}%</span>
            <div
              role="progressbar"
              aria-valuenow={confPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="relative flex-1 h-1.5 rounded-full bg-warm-100 overflow-hidden max-w-[160px]"
            >
              <div
                className={cn('absolute inset-y-0 left-0', colors.bar)}
                style={{ width: `${confPct}%` }}
              />
            </div>
          </dd>
        </div>
      </dl>
    </div>
  );
}
