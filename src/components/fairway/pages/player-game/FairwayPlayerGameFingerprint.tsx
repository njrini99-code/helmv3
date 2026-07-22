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
  fairwayToast,
  type InsightPriority,
  type SegmentTone,
} from '@/components/fairway';

import { IconLayers } from '@/components/icons';

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
import { DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';

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

/**
 * Format the aggregator's `generated_at` ISO timestamp deterministically —
 * an explicit `timeZone` (not the calling process's own ambient zone) so SSR
 * and the first client render always compute the identical string.
 *
 * ROOT CAUSE (prod React #418 on /players/[id]/game): this footnote used to
 * call `new Date(generatedAt).toLocaleString()` with no locale/timeZone
 * argument, which resolves to whatever default `Intl` locale AND timezone
 * the CALLING PROCESS happens to have — Vercel SSR (Node, typically UTC) vs.
 * the visitor's own browser (any locale, any zone). This component is the
 * default tab on the route (PlayerDeepDiveTabs renders it on the initial
 * server + first client render whenever `?tab` isn't `scouting`), so the two
 * environments produced two different strings for the SAME instant and
 * React's hydration diff failed on this exact text node. Anchoring to a
 * fixed, explicit zone (the same `DEFAULT_TIMEZONE` the calendar surfaces
 * already use) makes the output independent of which process computes it.
 */
export function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const handleAction = useCallback(
    (action: 'acknowledged' | 'dismissed' | 'create_focus_area', insightId: string) => {
      if (pendingIds.has(insightId)) return;
      const prev = sections;
      setPendingIds((current) => new Set(current).add(insightId));
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
            if (!res.success) {
              setSections(prev);
              fairwayToast.error(res.error ?? 'Could not acknowledge this insight.');
            } else {
              fairwayToast.success('Insight acknowledged.');
            }
          } else if (action === 'dismissed') {
            setSections((current) => removeInsight(current, insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) {
              setSections(prev);
              fairwayToast.error(res.error ?? 'Could not dismiss this insight.');
            } else {
              fairwayToast.success('Insight dismissed.');
            }
          } else if (action === 'create_focus_area') {
            if (!coachId) {
              fairwayToast.error('A coach profile is required to create a focus area.');
              return;
            }
            const target = findInsight(sections, insightId);
            if (!target) {
              fairwayToast.error('That insight is no longer available.');
              return;
            }
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) {
              fairwayToast.success('Focus area created.');
              router.push(
                `/golf/dashboard/intelligence?view=players&player=${target.player_id}&playersTab=areas`,
              );
            } else {
              fairwayToast.error(res.error ?? 'Could not create the focus area.');
            }
          }
        } catch {
          setSections(prev);
          fairwayToast.error('That action did not complete. Try again.');
        } finally {
          setPendingIds((current) => {
            const next = new Set(current);
            next.delete(insightId);
            return next;
          });
        }
      });
    },
    [coachId, pendingIds, router, sections],
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
    <div className="mx-auto w-full max-w-[1160px] overflow-x-clip">
      <div className="flex flex-col gap-7 md:gap-9">
        {/* ════════════════ 1 · MASTHEAD (the ONE masthead) ═════════════════ */}
        <ViewHeader
          eyebrow="Game Fingerprint"
          title={fullName}
          description={player.team_name ?? 'No team'}
          primaryAction={
            <Button asChild variant="secondary">
              <Link href={`/golf/dashboard/players/${player.id}/game/print`}>
                Print report
              </Link>
            </Button>
          }
          secondaryActions={
            // The Scouting Report is already the adjacent in-page tab. Keep
            // this action row to true sibling destinations so the header does
            // not repeat the same control twice.
            <>
              <Button asChild variant="ghost" size="sm" leftIcon={<IconLayers size={15} />}>
                <Link href={`/golf/dashboard/players/${player.id}/genome`}>Genome</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/golf/dashboard/roster/${player.id}`}>Player page</Link>
              </Button>
            </>
          }
        />

        {/* ════════════════ 2 · HERO — compact decision summary ════════════ */}
        <InstrumentCluster
          ariaLabel="Composite rating"
          balance="even"
          primary={
            <InstrumentPanel
              depth="raised"
              tone="accent"
              padding="md"
              eyebrow="Composite rating"
              as="section"
              className="flex h-full min-h-[190px] flex-col justify-between gap-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raise motion-reduce:transform-none"
            >
              <Readout
                size="lg"
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
              padding="md"
              header="Recent trend"
              className="flex h-full min-h-[190px] flex-col justify-center gap-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raise motion-reduce:transform-none"
            >
              <TrendPulse trend={trend} />
            </InstrumentPanel>,
          ]}
        />

        <nav aria-label="Jump to game area" className="min-w-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {orderedSections.map((section, index) => {
              const leadMetric = section.metrics[0];
              return (
                <a
                  key={section.key}
                  href={`#fingerprint-${section.key}`}
                  className="group min-w-0 rounded-fw-md border border-border-subtle bg-surface px-3 py-3 outline-none transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-soft focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transform-none"
                >
                  <span className="block font-fw-mono text-eyebrow text-text-tertiary tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="mt-1 block truncate font-fw-display text-label font-semibold text-text-primary">
                    {section.category}
                  </span>
                  <span className="mt-1 block truncate font-fw-mono text-caption text-text-secondary tabular-nums">
                    {leadMetric ? `${leadMetric.value} · ${leadMetric.label}` : section.sparse ? 'Calibrating' : 'Open area'}
                  </span>
                </a>
              );
            })}
          </div>
        </nav>

        {/* ════════════════ 3 · GAME AREAS — the six sections ═══════════════ */}
        {orderedSections.map((section, index) => (
          <FingerprintSection
            key={section.key}
            section={section}
            index={index}
            pendingIds={pendingIds}
            onAction={handleAction}
          />
        ))}

        {/* ════════════════ 4 · GENERATED-AT footnote ═══════════════════════ */}
        <p className="text-center font-fw-sans text-caption text-text-tertiary">
          Generated {formatGeneratedAt(generatedAt)}
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
  index,
  pendingIds,
  onAction,
}: {
  section: SectionData;
  index: number;
  pendingIds: ReadonlySet<string>;
  onAction: (
    action: 'acknowledged' | 'dismissed' | 'create_focus_area',
    insightId: string,
  ) => void;
}) {
  const hasMetrics = section.metrics.length > 0;
  const hasInsights = section.insights.length > 0;
  const leadInsights = section.insights.slice(0, 2);
  const additionalInsights = section.insights.slice(2);

  return (
    <section
      id={`fingerprint-${section.key}`}
      className="scroll-mt-28 overflow-hidden rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent-200 hover:shadow-raise motion-reduce:transform-none"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle bg-surface-tint px-4 py-4 sm:px-5 md:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-fw-mono text-eyebrow text-accent-700 tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <h2 className="font-fw-display text-h3 font-semibold text-text-primary">
            {section.category}
          </h2>
        </div>
        <span className="font-fw-sans text-caption text-text-tertiary">
          {section.sparse
            ? 'Calibrating'
            : `${section.metrics.length} metrics · ${section.insights.length} insights`}
        </span>
      </header>

      {section.sparse ? (
        <div className="p-4 sm:p-5 md:p-6">
          <EmptyState
            variant="subtle"
            title="Not enough data yet"
            description={`Needs ${SECTION_SAMPLE_FLOOR}+ rounds before this area calibrates.`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 md:p-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          {/* ── Metrics + chart rail ── */}
          <div className="flex min-w-0 flex-col gap-4">
            {hasMetrics ? (
              <InstrumentPanel depth="base" padding="md" header="Key numbers">
                <div className="grid grid-cols-2 gap-2.5">
                  {section.metrics.map((m) => (
                    <MetricRow key={m.label} metric={m} />
                  ))}
                </div>
              </InstrumentPanel>
            ) : null}

            <SectionChart section={section} />
          </div>

          {/* ── Evidence insights ── */}
          <div className="flex min-w-0 flex-col gap-3">
            {hasInsights ? (
              <>
                {leadInsights.map((insight, i) => (
                  <FingerprintInsightCard
                    key={insight.id}
                    insight={insight}
                    featured={i === 0}
                    pending={pendingIds.has(insight.id)}
                    onAction={onAction}
                  />
                ))}
                {additionalInsights.length > 0 ? (
                  <details className="group rounded-card border border-border-subtle bg-surface-sunken">
                    <summary className="cursor-pointer list-none rounded-card px-4 py-3 font-fw-sans text-label font-semibold text-text-secondary outline-none transition-colors hover:bg-surface-tint hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-3">
                        <span>View {additionalInsights.length} more insight{additionalInsights.length === 1 ? '' : 's'}</span>
                        <span aria-hidden className="text-accent-700 transition-transform group-open:rotate-45">+</span>
                      </span>
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-border-subtle p-3">
                      {additionalInsights.map((insight) => (
                        <FingerprintInsightCard
                          key={insight.id}
                          insight={insight}
                          pending={pendingIds.has(insight.id)}
                          onAction={onAction}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
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

function FingerprintInsightCard({
  insight,
  featured = false,
  pending,
  onAction,
}: {
  insight: SectionData['insights'][number];
  featured?: boolean;
  pending: boolean;
  onAction: (
    action: 'acknowledged' | 'dismissed' | 'create_focus_area',
    insightId: string,
  ) => void;
}) {
  return (
    <InsightCard
      id={`insight-${insight.id}`}
      priority={toInsightPriority(insight.priority)}
      variant={featured ? 'default' : 'compact'}
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
              disabled={pending}
              onClick={() => onAction('create_focus_area', insight.id)}
            >
              {pending ? 'Working…' : 'Make focus area'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => onAction('acknowledged', insight.id)}
            >
              Acknowledge
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
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
  );
}

/* ── One metric row — label, value, tone dot, optional comparison ── */
function MetricRow({ metric }: { metric: FingerprintMetric }) {
  return (
    <div className="min-w-0 rounded-fw-md bg-surface-sunken px-3 py-3">
      <span className="flex min-w-0 items-center gap-2 font-fw-sans text-caption text-text-secondary">
        <ToneDot tone={metric.tone} />
        <span className="truncate">{metric.label}</span>
      </span>
      <span className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-fw-mono text-body-lg font-semibold tabular-nums text-text-primary">
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
  const label = tone === 'good' ? 'Strength' : tone === 'bad' ? 'Needs attention' : 'Neutral';
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`}
    />
  );
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
    // `tee`'s pills are a fairway hit/miss split (no direction data exists
    // for tee shots); `approach`'s pills are the four-way miss direction —
    // the panel header stays honest to which one is actually rendering.
    const header = section.key === 'tee' ? 'Fairways' : 'Miss direction';
    return (
      <InstrumentPanel depth="base" padding="md" header={header}>
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
  // distributions (make-% by distance / par-type averages / short-game rates),
  // not good/bad calls.
  const parts = chart.bars.map((b) => ({
    label: b.label,
    value: b.value,
    tone: 'neutral' as SegmentTone,
  }));

  const overline =
    section.key === 'putting' ? 'Make %' : section.key === 'short_game' ? 'Around the green' : 'By type';
  const title =
    section.key === 'putting'
      ? 'Make % by distance'
      : section.key === 'short_game'
        ? 'Recovery rates'
        : 'Averages';

  return <SegmentBar overline={overline} title={title} parts={parts} />;
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
