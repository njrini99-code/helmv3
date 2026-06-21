'use client';

/**
 * ============================================================================
 * Fairway · player-game · FairwayPlayerGameFingerprint — coach scouting report
 * ----------------------------------------------------------------------------
 * The flag-on redesign of /golf/dashboard/players/[playerId]/game (coach-only).
 * It re-skins the SAME `PlayerFingerprint` the legacy page already resolves on
 * the server via getPlayerFingerprint — the score hero, the six game-area
 * sections (tee → approach → short game → putting → scoring → pressure), the
 * per-section metrics + evidence insights + small charts, and the recent-trend
 * line. This component performs NO fetching.
 *
 * PRESERVED LOGIC (imported UNCHANGED, never rewritten):
 *   • insights.ts#acknowledgeInsight, dismissInsight — wired through the
 *     InsightCard action row exactly as the legacy PlayerGameFingerprint client
 *     called them (same args, same optimistic state, same revert-on-failure).
 *   • development.ts#createFocusAreaFromInsight — same payload + same
 *     router.push('/golf/dashboard/development') on success.
 *   • The section order (FINGERPRINT_SECTION_ORDER) — same coach muscle-memory.
 *
 * ── HONESTY (the load-bearing rule — CRITICAL FOR STATS) ────────────────────
 *   • A section the aggregator marks `sparse` (< 5 qualifying samples) renders
 *     an honest "Not enough data yet" slot — NEVER fabricated metrics. The slot
 *     is preserved so the layout doesn't shift.
 *   • The composite rating renders only when the aggregator produced a real
 *     number; otherwise the hero Readout shows an honest awaiting state with a
 *     "N of 5" calibration — never a fabricated "0" or fake percentile.
 *   • Metrics, comparisons, evidence numbers, and drill durations are quoted
 *     verbatim from the aggregator output — no invented values.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * players/[playerId]/game/page.tsx. Renders inside the `.fairway-ds` scope on a
 * bg-canvas page. Built with Fairway tokens + primitives only (no bg-white /
 * serif / skeuomorphic gauges).
 * ========================================================================== */

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  ViewHeader,
  InstrumentCluster,
  InstrumentPanel,
  Readout,
  Surface,
  InsightCard,
  EmptyState,
  Chip,
  SegmentBar,
  Sparkline,
  Button,
  type InsightPriority,
  type SegmentTone,
} from '@/components/fairway';

import { IconSparkles, IconLayers } from '@/components/icons';

import type {
  PlayerFingerprint,
  SectionData,
  FingerprintMetric,
} from '@/app/golf/actions/player-fingerprint';
import { FINGERPRINT_SECTION_ORDER } from '@/app/golf/actions/player-fingerprint-types';
// PRESERVED WRITE ACTIONS — imported UNCHANGED (the same actions the legacy
// PlayerGameFingerprint client called). We re-skin the trigger UI only; the
// server round-trip + payload are byte-for-byte the legacy behavior.
import { acknowledgeInsight, dismissInsight } from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { useGolfUser } from '@/contexts/golf-user-context';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayPlayerGameFingerprintProps {
  fingerprint: PlayerFingerprint;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** The 5-round floor the aggregator uses to mark a section sparse. */
const SECTION_SAMPLE_FLOOR = 5;

/** Map an evidence-insight priority string → the Fairway InsightCard priority.
 *  The Fairway scale has no `urgent`; the riskiest tier maps to `critical`. */
function toInsightPriority(priority: string): InsightPriority {
  switch (priority) {
    case 'urgent':
      return 'critical';
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

/** Signed, honest score-to-par chip ("E", "+3", "−2", or "—" when absent). */
function formatToPar(stp: number | null): string {
  if (stp == null) return '—';
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `−${Math.abs(stp)}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerGameFingerprint({
  fingerprint,
}: FairwayPlayerGameFingerprintProps) {
  const router = useRouter();
  const golfUser = useGolfUser();
  const coachId = golfUser.coachId ?? null;
  const [, startActionTransition] = useTransition();

  // Mirror insight lists per section into local state so actions (ack / dismiss
  // / focus area) can update the UI optimistically — IDENTICAL to legacy.
  const [sections, setSections] = useState(() => fingerprint.sections);

  const handleAction = useCallback(
    (action: 'acknowledged' | 'dismissed' | 'create_focus_area', insightId: string) => {
      const prev = sections;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setSections((current) =>
              mapInsights(current, insightId, (i) => ({
                ...i,
                acknowledged_at: new Date().toISOString(),
                status: 'acknowledged' as const,
              })),
            );
            const res = await acknowledgeInsight(insightId);
            if (!res.success) setSections(prev);
          } else if (action === 'dismissed') {
            setSections((current) => removeInsight(current, insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) setSections(prev);
          } else if (action === 'create_focus_area') {
            if (!coachId) return;
            const target = findInsight(sections, insightId);
            if (!target) return;
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) router.push('/golf/dashboard/development');
          }
        } catch {
          setSections(prev);
        }
      });
    },
    [coachId, router, sections],
  );

  const orderedSections = useMemo(
    () => FINGERPRINT_SECTION_ORDER.map((key) => sections[key]),
    [sections],
  );

  const { player, composite, trend, generated_at: generatedAt } = fingerprint;
  const fullName =
    `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const rating = composite.rating;
  const hasRating = rating != null;
  const sample = composite.rounds_in_calculation;

  // Composite trend → an honest delta direction. Lower scores are better in
  // golf, but the composite is already a 0-100 "higher is better" rating, so
  // an "up" trend is the good direction.
  const trendChip =
    composite.trend === 'up'
      ? { tone: 'success' as const, label: 'Trending up' }
      : composite.trend === 'down'
        ? { tone: 'danger' as const, label: 'Trending down' }
        : { tone: 'neutral' as const, label: 'Holding steady' };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <div className="flex flex-col gap-10">
        {/* ════════════════ 1 · MASTHEAD (the ONE masthead) ═════════════════ */}
        <ViewHeader
          eyebrow="Game Fingerprint"
          title={fullName}
          description={player.team_name ?? 'No team'}
          primaryAction={
            <Button asChild variant="primary">
              <Link href={`/golf/dashboard/players/${player.id}/game/print`}>
                Print report
              </Link>
            </Button>
          }
          secondaryActions={
            // Sibling cross-links (P107) — Game ↔ Insight ↔ Genome ↔ Profile.
            <>
              <Button asChild variant="ghost" size="sm" leftIcon={<IconSparkles size={15} />}>
                <Link href={`/golf/dashboard/players/${player.id}`}>AI Insight</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" leftIcon={<IconLayers size={15} />}>
                <Link href={`/golf/dashboard/coachhelm/genome/${player.id}`}>Genome</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/golf/dashboard/roster/${player.id}`}>Player page</Link>
              </Button>
            </>
          }
        />

        {/* ════════════════ 2 · HERO — composite rating (one focal read) ════ */}
        <InstrumentCluster
          ariaLabel="Composite rating"
          balance="focal"
          primary={
            <InstrumentPanel
              depth="raised"
              tone="accent"
              padding="lg"
              eyebrow="Composite rating"
              as="section"
              className="flex h-full flex-col gap-4"
            >
              <Readout
                size="hero"
                value={hasRating ? rating : undefined}
                format={{ maximumFractionDigits: 0 }}
                state={hasRating ? 'live' : 'awaiting'}
                samples={hasRating ? undefined : { have: sample, need: SECTION_SAMPLE_FLOOR }}
                awaitingLabel="Not enough rounds"
                label="Overall game"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={trendChip.tone} size="md">
                  {trendChip.label}
                </Chip>
                {sample > 0 ? (
                  <span className="font-fw-sans text-caption text-text-tertiary">
                    Based on {sample} {sample === 1 ? 'round' : 'rounds'}
                  </span>
                ) : null}
              </div>
            </InstrumentPanel>
          }
          secondary={[
            <InstrumentPanel
              key="trend"
              depth="base"
              header="Recent trend"
              className="flex h-full flex-col gap-4"
            >
              <TrendPulse trend={trend} />
            </InstrumentPanel>,
          ]}
        />

        {/* ════════════════ 3 · GAME AREAS — the six sections ═══════════════ */}
        {orderedSections.map((section) => (
          <FingerprintSection
            key={section.key}
            section={section}
            onAction={handleAction}
          />
        ))}

        {/* ════════════════ 4 · GENERATED-AT footnote ═══════════════════════ */}
        <p className="text-center font-fw-sans text-caption text-text-tertiary">
          Generated {new Date(generatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * TrendPulse — the recent rolling score-to-par. Honest: when there are < 2
 * scored rounds it renders a quiet "awaiting" line, never a fabricated line.
 * ══════════════════════════════════════════════════════════════════════════ */

function TrendPulse({ trend }: { trend: PlayerFingerprint['trend'] }) {
  const series = useMemo(
    () =>
      trend.rolling
        .map((p) => p.score_to_par)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
    [trend.rolling],
  );
  const latest = series.length > 0 ? series[series.length - 1] ?? null : null;

  if (series.length < 2) {
    return (
      <Readout
        size="md"
        state="awaiting"
        samples={{ have: series.length, need: 2 }}
        awaitingLabel="Awaiting rounds"
        label="Score to par"
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 overflow-x-auto">
        <Sparkline
          data={series}
          goodDirection="down"
          width={220}
          height={56}
          strokeWidth={2}
          label="Rolling score to par"
        />
      </div>
      <div className="shrink-0">
        <Readout size="md" display={formatToPar(latest)} state="live" label="Latest" />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * FingerprintSection — one game-area band: metrics rail + small chart + the
 * evidence-backed InsightCards. Honest "Not enough data" when sparse.
 * ══════════════════════════════════════════════════════════════════════════ */

function FingerprintSection({
  section,
  onAction,
}: {
  section: SectionData;
  onAction: (
    action: 'acknowledged' | 'dismissed' | 'create_focus_area',
    insightId: string,
  ) => void;
}) {
  const hasMetrics = section.metrics.length > 0;
  const hasInsights = section.insights.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="px-1 font-fw-display text-h3 font-medium text-text-primary">
        {section.category}
      </h2>

      {section.sparse ? (
        <Surface elevation="border" padding="none">
          <EmptyState
            variant="subtle"
            title="Not enough data yet"
            description={`Needs ${SECTION_SAMPLE_FLOOR}+ rounds before this area calibrates.`}
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* ── Metrics + chart rail ── */}
          <div className="flex flex-col gap-4">
            {hasMetrics ? (
              <InstrumentPanel depth="base" padding="md" header="Key numbers">
                <div className="flex flex-col gap-2.5">
                  {section.metrics.map((m) => (
                    <MetricRow key={m.label} metric={m} />
                  ))}
                </div>
              </InstrumentPanel>
            ) : null}

            <SectionChart section={section} />
          </div>

          {/* ── Evidence insights ── */}
          <div className="flex flex-col gap-3">
            {hasInsights ? (
              section.insights.slice(0, 5).map((insight, i) => (
                <InsightCard
                  key={insight.id}
                  id={`insight-${insight.id}`}
                  priority={toInsightPriority(insight.priority)}
                  variant={i === 0 ? 'default' : 'compact'}
                  title={insight.title}
                  evidence={<InsightEvidenceLine insight={insight} />}
                  actions={
                    insight.status === 'acknowledged' ? (
                      <Chip tone="success" size="sm">
                        Acknowledged
                      </Chip>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onAction('create_focus_area', insight.id)}
                        >
                          Make focus area
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onAction('acknowledged', insight.id)}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAction('dismissed', insight.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    )
                  }
                >
                  {insight.content ? insight.content : null}
                </InsightCard>
              ))
            ) : (
              <Surface elevation="border" padding="none">
                <EmptyState
                  variant="subtle"
                  title="No insights in this area"
                  description="CoachHelm hasn't flagged anything here yet."
                />
              </Surface>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── One metric row — label, value, tone dot, optional comparison ── */
function MetricRow({ metric }: { metric: FingerprintMetric }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex items-center gap-2 font-fw-sans text-body-sm text-text-secondary">
        <ToneDot tone={metric.tone} />
        {metric.label}
      </span>
      <span className="flex items-baseline gap-2 text-right">
        <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
          {metric.value}
        </span>
        {metric.comparison ? (
          <span className="font-fw-sans text-caption text-text-tertiary">
            {metric.comparison}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Quiet tone dot — green = strength, rose = weakness, neutral = neither. */
function ToneDot({ tone }: { tone: FingerprintMetric['tone'] }) {
  const cls =
    tone === 'good'
      ? 'bg-fw-success'
      : tone === 'bad'
        ? 'bg-fw-danger'
        : 'bg-border-strong';
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}

/* ── Evidence line — the "why" behind the card, quoted verbatim ── */
function InsightEvidenceLine({
  insight,
}: {
  insight: SectionData['insights'][number];
}) {
  const ev = insight.evidence;
  const parts: string[] = [];
  if (ev.metric_label) parts.push(ev.metric_label);
  const impact = Number(ev.strokes_impact ?? 0);
  if (Number.isFinite(impact) && impact !== 0) {
    parts.push(`impact ${Math.abs(impact).toFixed(1)} str`);
  }
  if (typeof ev.sample_n === 'number') parts.push(`n=${ev.sample_n}`);
  if (typeof ev.confidence === 'number') {
    parts.push(`conf ${Math.round(ev.confidence * 100)}%`);
  }
  const drills = insight.drills ?? [];
  const drillLine =
    drills.length > 0
      ? `Drills: ${drills
          .map((d) => `${d.title}${d.duration_min != null ? ` (${d.duration_min}m)` : ''}`)
          .join(', ')}`
      : null;

  if (parts.length === 0 && !drillLine) return null;

  return (
    <span className="flex flex-col gap-1">
      {parts.length > 0 ? (
        <span className="font-fw-mono tabular-nums">{parts.join(' · ')}</span>
      ) : null}
      {drillLine ? <span className="text-text-tertiary">{drillLine}</span> : null}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SectionChart — the small per-section chart, recomputed honestly from the
 * aggregator's chart_data. Bars → a chunky matte SegmentBar; pills → flat
 * matte chips. Null chart_data renders nothing (no fabricated chart).
 * ══════════════════════════════════════════════════════════════════════════ */

function SectionChart({ section }: { section: SectionData }) {
  const chart = section.chart_data;
  if (!chart) return null;

  if (chart.kind === 'pills') {
    if (chart.pills.length === 0) return null;
    return (
      <InstrumentPanel depth="base" padding="md" header="Miss direction">
        <div className="flex flex-wrap gap-2">
          {chart.pills.map((p) => (
            <span
              key={p.label}
              className="inline-flex items-center gap-2 rounded-fw-md bg-surface-sunken px-3 py-1.5"
            >
              <span className="font-fw-sans text-caption text-text-secondary">
                {p.label}
              </span>
              <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
                {p.value}
              </span>
            </span>
          ))}
        </div>
      </InstrumentPanel>
    );
  }

  // bars
  if (chart.bars.length === 0) return null;
  // Honest tone: keep bars neutral — the aggregator's bar charts are descriptive
  // distributions (make-% by distance / par-type averages), not good/bad calls.
  const parts = chart.bars.map((b) => ({
    label: b.label,
    value: b.value,
    tone: 'neutral' as SegmentTone,
  }));

  return (
    <SegmentBar
      overline={section.key === 'putting' ? 'Make %' : 'By type'}
      title={section.key === 'putting' ? 'Make % by distance' : 'Averages'}
      parts={parts}
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Immutable section-state helpers — IDENTICAL to the legacy client (verbatim
 * optimistic-update logic; presentation only differs).
 * ══════════════════════════════════════════════════════════════════════════ */

function mapInsights(
  sections: PlayerFingerprint['sections'],
  insightId: string,
  transform: (
    insight: PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number],
  ) => PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number],
): PlayerFingerprint['sections'] {
  const next = { ...sections };
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const section = next[key];
    const idx = section.insights.findIndex((i) => i.id === insightId);
    if (idx >= 0) {
      const nextInsights = [...section.insights];
      nextInsights[idx] = transform(nextInsights[idx]!);
      next[key] = { ...section, insights: nextInsights };
    }
  }
  return next;
}

function removeInsight(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): PlayerFingerprint['sections'] {
  const next = { ...sections };
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const section = next[key];
    if (section.insights.some((i) => i.id === insightId)) {
      next[key] = {
        ...section,
        insights: section.insights.filter((i) => i.id !== insightId),
      };
    }
  }
  return next;
}

function findInsight(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number] | null {
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const match = sections[key].insights.find((i) => i.id === insightId);
    if (match) return match;
  }
  return null;
}

export default FairwayPlayerGameFingerprint;
