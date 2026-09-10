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
import { StandingBars } from '@/components/fairway/charts/StandingBars';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { EvidenceStanding } from '@/lib/coachhelm/v2/insights/standing-injection';
import { DiagnosisPanel } from './DiagnosisPanel';
import { formatValue } from './format-value';

/**
 * W15: When v2 generators have injected `evidence.standing` (W14), render
 * StandingBars — the only path with a real `team_n` to gate a "Team" row
 * honestly (see `EvidenceValuePair`'s docstring for why nothing else may
 * reach for `StandingBars`). It carries cohort percentile + team_n
 * cold-start gating + auto a11y label.
 *
 * Returns the v3 component when:
 *   - `evidence.standing` is present and well-formed
 *   - The standing's metric_id maps to a canonical v3 metric (via
 *     metric-config), so direction + unit + scale are known
 *
 * Otherwise returns null — caller falls through to the plain
 * `EvidenceValuePair` text (facelift; replaced the old hand-rolled
 * "BenchmarkScale" dot-on-a-rail).
 */
function tryRenderV3Standing(evidence: InsightEvidence): React.ReactElement | null {
  const standing = (evidence as InsightEvidence & { standing?: EvidenceStanding }).standing;
  if (!standing || !standing.metric_id) return null;
  const cfg = getMetricRenderConfig(standing.metric_id);
  if (!cfg) return null;
  return (
    <StandingBars
      frame="bare"
      metric_id={standing.metric_id}
      metric_label={cfg.display_label}
      player_value={standing.player_value}
      team_avg={standing.team_avg}
      team_n={standing.team_n}
      team_pct={standing.team_pct}
      pga_value={standing.pga_value}
      pga_omitted={standing.pga_omitted}
      is_womens={standing.is_womens}
      direction={cfg.direction}
      unit={cfg.unit}
      scale={cfg.default_scale}
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

// formatValue moved to ./format-value.ts to break an import cycle with
// DiagnosisPanel.tsx (see that module's docblock). Re-exported here so this
// file's own internal use below and its existing external
// importers/tests keep working unchanged.
export { formatValue } from './format-value';

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
 * `formatValue` assumes a real number. Two evidence shapes travel through
 * this component's `evidence` prop: a real `golf_coach_insights.evidence`
 * row (every field below present) and `synthesizeTeamSignals`'s roster
 * roll-up (`{ metric, metric_label, strokes_impact, players_affected }`
 * only — no `your_value`/`comparison_value` at all, see
 * `src/lib/coachhelm/v3/insights/team-synthesis.ts`). An unguarded
 * `formatValue(undefined, ...)` either prints the literal string
 * "undefined" (percent/count/yards/feet) or throws (`strokes`, which calls
 * `.toFixed` on it). This is the single guard every read site below goes
 * through: a non-finite number renders as `null` so the caller can decide
 * between a fallback and rendering nothing, never the raw value.
 */
function safeFormatValue(
  value: number,
  unit: InsightUnit,
  display?: string,
): string | null {
  if (!Number.isFinite(value)) return null;
  return formatValue(value, unit, display);
}

/**
 * Plain labeled value pair — replaces the removed hand-rolled "dot on a
 * rail" axis (side-stripe/slider family the design system bans; see
 * `docs/design/fairway-facelift/REVIEW.md`). `tryRenderV3Standing` above
 * already renders the real `StandingBars` component for any row carrying
 * `evidence.standing`, and that IS the only path with a `team_n` to gate a
 * "Team" marker honestly — `StandingBar`'s `shouldShowTeamMarker` treats an
 * absent `team_n` as cold-start (< 5) and hides the row, and `team_n` is
 * ONLY ever written as part of `.standing` (`standing-injection.ts`), never
 * alongside the legacy top-level `your_value`/`comparison_value` fields.
 * Reaching for `StandingBars` here for a `.standing`-less row would force a
 * choice between fabricating a `team_n` (never — synthesizes false
 * confidence) or silently dropping the comparison behind a "Team marker
 * appears once 5+ teammates…" caption that doesn't apply to this data at
 * all — both worse than the rail it would replace. So a `.standing`-less
 * row (every `comparison_source`, including `team_avg`) gets its own value
 * and its benchmark's value as two labeled tabular numbers; no axis, no
 * position math, no fabricated scale.
 */
function EvidenceValuePair({ evidence }: { evidence: InsightEvidence }) {
  const pairs: Array<{ key: string; value: string; label: string; emphasis: boolean }> = [];

  const yourDisplay = safeFormatValue(evidence.your_value, evidence.unit, evidence.your_value_display);
  if (yourDisplay !== null) {
    pairs.push({ key: 'you', value: yourDisplay, label: 'You', emphasis: true });
  }

  const comparisonDisplay = safeFormatValue(evidence.comparison_value, evidence.unit);
  if (comparisonDisplay !== null) {
    pairs.push({
      key: 'comparison',
      value: comparisonDisplay,
      label: SOURCE_LABELS[evidence.comparison_source] ?? evidence.comparison_label ?? 'Comparison',
      emphasis: false,
    });
  }

  const secondaryDisplay =
    typeof evidence.secondary_value === 'number' && evidence.secondary_value !== evidence.comparison_value
      ? safeFormatValue(evidence.secondary_value, evidence.unit)
      : null;
  if (secondaryDisplay !== null) {
    pairs.push({
      key: 'secondary',
      value: secondaryDisplay,
      label: evidence.secondary_label
        ?? (evidence.secondary_source ? SOURCE_LABELS[evidence.secondary_source] : 'Benchmark'),
      emphasis: false,
    });
  }

  // Nothing finite to show (the team-synthesis roll-up shape) — honest
  // emptiness, never a row of "undefined".
  if (pairs.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
      data-testid="evidence-value-pair"
    >
      {pairs.map((p) => (
        <span key={p.key} className="inline-flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-fw-mono text-body font-semibold tabular-nums',
              p.emphasis ? 'text-warm-900' : 'text-warm-700',
            )}
          >
            {p.value}
          </span>
          <span className="text-eyebrow uppercase text-warm-500">{p.label}</span>
        </span>
      ))}
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

  // Guarded: `confidence` is absent on the team-synthesis roll-up shape (see
  // `EvidenceValuePair`'s docstring) — an unguarded `Math.round(NaN * 100)`
  // rendered the literal "NaN% confidence". `null` here means "don't render
  // the pill" rather than a fabricated percentage.
  const confPct = Number.isFinite(evidence.confidence)
    ? Math.round(Math.max(0, Math.min(1, evidence.confidence)) * 100)
    : null;
  const colors = confidenceColor(Number.isFinite(evidence.confidence) ? evidence.confidence : 0);

  // FID-5: clamp the stroke magnitude at render so an impossible upstream
  // value (stale rows have carried 40+ strokes/round) never reaches the eye.
  const safeImpact = sanitizeStrokesImpact(evidence.strokes_impact);

  // W15: prefer StandingBars when v14 generators have populated
  // evidence.standing AND the metric_id resolves to a canonical v3 metric.
  // Falls through to the plain EvidenceValuePair for v2-only insights and
  // any row a `.standing` metric_id doesn't resolve for.
  const v3Standing = tryRenderV3Standing(evidence);

  if (compact) {
    // Guarded the same way as the value pair above: `sample_n`/`window_days`
    // are absent on the team-synthesis shape, and an unguarded template
    // literal printed "undefined putts · undefined days".
    const samplePart = Number.isFinite(evidence.sample_n) && typeof evidence.metric === 'string'
      ? formatSample(evidence.sample_n, evidence.metric)
      : null;
    const windowPart = Number.isFinite(evidence.window_days) ? `${evidence.window_days} days` : null;
    const sampleText = [samplePart, windowPart].filter((p): p is string => p !== null).join(' · ');

    return (
      <div
        data-testid={testId ?? 'evidence-panel-compact'}
        className={cn('mt-3 space-y-2.5')}
      >
        {v3Standing ?? <EvidenceValuePair evidence={evidence} />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-eyebrow text-warm-500 tabular-nums">
          {sampleText ? <span data-testid="evidence-sample">{sampleText}</span> : null}
          {Math.round(Math.abs(safeImpact) * 10) > 0 && (
            <>
              {sampleText ? <span aria-hidden="true">·</span> : null}
              <span className="text-warm-700 font-medium" data-testid="evidence-impact">
                ~{Math.abs(safeImpact).toFixed(1)} strokes/round
              </span>
            </>
          )}
          {confPct !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium', colors.bg, colors.text)}
                data-testid="evidence-confidence"
              >
                {confPct}% confidence
              </span>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // Expanded mode — 2-column key/value grid. Every value read is guarded the
  // same way as the compact branch above — the team-synthesis roll-up shape
  // has none of these fields, and this expanded grid is a shared primitive
  // with callers this component doesn't own (`insight-card/InsightCard.tsx`,
  // `player-hub/HubInsightSignalCard.tsx`), so a bad shape reaching here from
  // elsewhere must still degrade honestly rather than print "undefined" or
  // throw ('strokes' unit's unguarded `.toFixed`).
  const rows: Array<{ label: string; value: React.ReactNode; testId: string }> = [
    {
      label: 'Your number',
      value: (
        <span className="font-medium text-warm-900">
          {safeFormatValue(evidence.your_value, evidence.unit, evidence.your_value_display) ?? 'Not available'}
        </span>
      ),
      testId: 'evidence-row-your',
    },
    {
      label: 'Comparison',
      value: (
        <span>
          <span className="font-medium text-warm-900">
            {safeFormatValue(evidence.comparison_value, evidence.unit) ?? 'Not available'}
          </span>{' '}
          <span className="text-warm-500">
            ({SOURCE_LABELS[evidence.comparison_source] ?? evidence.comparison_label ?? 'Comparison'})
          </span>
        </span>
      ),
      testId: 'evidence-row-comparison',
    },
    {
      label: 'Sample',
      value: (
        <span>
          {Number.isFinite(evidence.sample_n) && typeof evidence.metric === 'string'
            ? formatSample(evidence.sample_n, evidence.metric)
            : 'Not available'}
        </span>
      ),
      testId: 'evidence-row-sample',
    },
    {
      label: 'Window',
      value: (
        <span>
          {Number.isFinite(evidence.window_days)
            ? formatWindow(evidence.window_start, evidence.window_end, evidence.window_days)
            : 'Not available'}
        </span>
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
          {METHOD_LABELS[evidence.strokes_impact_method] ?? evidence.strokes_impact_method ?? 'Not specified'}
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
      {/* Root-cause reasoning spine (P0-05) — the machine-readable diagnosis the
          engine writes on every v3 row but no surface rendered. Self-scoped
          (.fairway-ds) so it lights up in Fairway tokens; the legacy numeric
          grid below stays as the supporting evidence. */}
      {evidence.diagnosis ? (
        <div className="fairway-ds mb-4 border-b border-border-subtle pb-4">
          <DiagnosisPanel
            diagnosis={evidence.diagnosis}
            confidence={evidence.confidence}
            strokesImpact={Math.abs(safeImpact)}
          />
        </div>
      ) : null}
      {/* W15: StandingBars above the legacy key/value grid when present. */}
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
            {confPct !== null ? (
              <>
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
              </>
            ) : (
              <span className="text-warm-500">Not available</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
