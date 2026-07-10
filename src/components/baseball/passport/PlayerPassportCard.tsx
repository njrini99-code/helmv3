'use client';

// =============================================================================
// src/components/baseball/passport/PlayerPassportCard.tsx
//
// V5 Player Passport — the portable, source-backed development/identity snapshot.
//
// Spec: v5_player_passport_and_recruiting_showcase_system.md
//   "Recruiting platforms have profiles. BaseballHelm should have proof."
//
// This is the PROOF surface. It renders the viewer-filtered passport read-model:
//   - Identity (name / class / positions / bats-throws / measurables-eligible)
//   - Verified Measurables — EACH carries a <SourceTrustBadge> (the shared
//     foundation component) showing provenance + verification honestly. A
//     self-reported number reads as player-entered + unverified, never "verified".
//   - Recent activity counts (source-labeled) — proof of operational history.
//   - Profile Completeness Engine — section signals + honest "what's missing".
//   - Exposure state — staff-only / player-visible / public / scout-packet.
//
// HONESTY (binding):
//   - withheldFieldCount surfaces "N field(s) hidden at your access level" so the
//     viewer knows the passport is filtered, never silently truncated.
//   - measurables that don't exist are omitted, not shown as 0 / fake "—".
//   - completeness marks unverified measurables INCOMPLETE — proof > presence.
//
// Cream/green GolfHelm look — Card/EmptyState primitives + the SourceTrustBadge
// foundation. No golf labels. No new palette.
// =============================================================================

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconShieldCheck,
  IconCheckCircle2,
  IconAlertCircle,
  IconEye,
  IconLock,
  IconActivity,
  IconArrowRight,
  IconChartBar,
  IconVideo,
  IconClock,
  IconExternalLink,
  IconCalendar,
} from '@/components/icons';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import { InkNotice } from '@/components/baseball/living-annual';
import type {
  PassportReadModel,
  PassportMeasurable,
  PassportCompletenessSignal,
  PassportStoryEvent,
  PassportMediaItem,
  PassportPerformance,
  PassportGameLogRow,
} from '@/lib/baseball/read-models/player-passport';
import type { PassportVisibilityState } from '@/lib/types/baseball-passport';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface PlayerPassportCardProps {
  model: PassportReadModel;
  /** Compact embed (e.g. on Player Today) vs full (dedicated passport surface). */
  compact?: boolean;
  /**
   * When set on a COMPACT card, renders a "View full passport" affordance that
   * links into the dedicated full surface. Ignored on a full card.
   */
  fullHref?: string;
}

// -----------------------------------------------------------------------------
// Exposure pill
// -----------------------------------------------------------------------------

const EXPOSURE_META: Record<
  PassportVisibilityState,
  { label: string; icon: React.ReactNode; cls: string }
> = {
  staff_only: {
    label: 'Internal · Staff only',
    icon: <IconLock size={12} />,
    cls: 'bg-warm-100 text-warm-600',
  },
  player_visible: {
    label: 'Visible to you',
    icon: <IconEye size={12} />,
    cls: 'bg-primary-50 text-primary-700',
  },
  public_profile: {
    label: 'Public profile enabled',
    icon: <IconEye size={12} />,
    cls: 'bg-primary-50 text-primary-700',
  },
  scout_packet: {
    label: 'Scout packet ready',
    icon: <IconShieldCheck size={12} />,
    cls: 'bg-primary-50 text-primary-700',
  },
};

function ExposurePill({ state }: { state: PassportVisibilityState }) {
  const meta = EXPOSURE_META[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-eyebrow font-semibold ${meta.cls}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Measurable tile (the proof: value + SourceTrustBadge)
// -----------------------------------------------------------------------------

function MeasurableTile({ measurable }: { measurable: PassportMeasurable }) {
  return (
    <div className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3.5">
      <p className="text-eyebrow uppercase tracking-wide text-warm-400">{measurable.label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-2xl font-semibold tabular-nums text-warm-900">
        {measurable.value}
        <span className="text-sm font-medium text-warm-400">{measurable.unit}</span>
      </p>
      <div className="mt-2 space-y-1.5">
        {/* The shared foundation badge — provenance + verification, honestly. */}
        <SourceTrustBadge trust={measurable.trust} size="sm" />
        {/* V5: each measurable carries an event/date — shown honestly, never faked. */}
        <p className="flex items-center gap-1 text-eyebrow text-warm-400">
          <IconCalendar size={10} />
          {measurable.eventDate ? `Captured ${measurable.eventDate}` : 'No event on file'}
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section header (full mode)
// -----------------------------------------------------------------------------

function SectionTitle({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-warm-800">{title}</h3>
      </div>
      {meta && <span className="text-eyebrow text-warm-400">{meta}</span>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Development Story (full mode) — V5 §Development Story
// -----------------------------------------------------------------------------

function StoryEventRow({ event }: { event: PassportStoryEvent }) {
  return (
    <li className="relative flex gap-3 pb-4 pl-1 last:pb-0">
      {/* timeline rail dot */}
      <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-primary-400 ring-4 ring-primary-50" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-warm-900">{event.title}</p>
          <span className="text-eyebrow text-warm-400">
            {new Date(event.occurredAt).toLocaleDateString()}
          </span>
        </div>
        {event.body && <p className="mt-0.5 text-sm text-warm-600">{event.body}</p>}
        <div className="mt-1.5">
          <SourceTrustBadge trust={event.trust} size="sm" />
        </div>
      </div>
    </li>
  );
}

function DevelopmentStorySection({
  story,
}: {
  story: NonNullable<PassportReadModel['developmentStory']>;
}) {
  return (
    <section className="mt-7">
      <SectionTitle
        icon={<IconClock size={14} />}
        title="Development Story"
        meta={story.events.length > 0 ? `${story.events.length} moments` : undefined}
      />
      {story.events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
          No development moments yet. Goals, coach notes, and progress milestones build the
          development timeline as the season unfolds.
        </p>
      ) : (
        <ol className="relative ml-1 border-l border-warm-100 pl-4">
          {story.events.map((e) => (
            <StoryEventRow key={e.id} event={e} />
          ))}
        </ol>
      )}
      {story.hiddenCount > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-eyebrow text-warm-400">
          <IconLock size={11} />
          {story.hiddenCount} moment{story.hiddenCount === 1 ? '' : 's'} hidden at your access
          level.
        </p>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Media (full mode) — V5 §Media
// -----------------------------------------------------------------------------

function MediaTile({ item }: { item: PassportMediaItem }) {
  const inner = (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-warm-200 bg-cream-50 transition-all hover:border-primary-200 hover:shadow-card-hover">
      <div
        className="relative flex aspect-video items-center justify-center bg-warm-100 bg-cover bg-center"
        style={
          item.thumbnailUrl
            ? { backgroundImage: `url(${JSON.stringify(item.thumbnailUrl)})` }
            : undefined
        }
      >
        {!item.thumbnailUrl && <IconVideo size={22} className="text-warm-300" />}
        {item.url && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cream-50/90 text-primary-600 shadow-sm">
            <IconExternalLink size={12} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-medium text-warm-900">{item.title}</p>
        <div className="mt-auto">
          <SourceTrustBadge trust={item.trust} size="sm" />
        </div>
      </div>
    </div>
  );
  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block h-full">
        {inner}
      </a>
    );
  }
  return inner;
}

function MediaSection({ media }: { media: NonNullable<PassportReadModel['media']> }) {
  const refs = media.items.filter((m) => m.isReference);
  return (
    <section className="mt-7">
      <SectionTitle
        icon={<IconVideo size={14} />}
        title="Media"
        meta={refs.length > 0 ? `${refs.length} clips` : undefined}
      />
      {refs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
          No video on file yet. Source-backed clips strengthen the proof packet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {refs.map((item) => (
            <MediaTile key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Baseball Performance (full mode) — V5 §Baseball Performance
// -----------------------------------------------------------------------------

function fmtRate(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(3).replace(/^0\./, '.');
}

function SeasonStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cream-50 px-3 py-2 text-center">
      <p className="text-eyebrow uppercase tracking-wide text-warm-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-warm-900">{value}</p>
    </div>
  );
}

function GameLogRow({ row }: { row: PassportGameLogRow }) {
  return (
    <tr className="border-t border-warm-100">
      <td className="px-3 py-2 text-sm text-warm-700">
        <span className="font-medium text-warm-900">
          {row.gameDate ? new Date(row.gameDate).toLocaleDateString() : '—'}
        </span>
        {row.gameType === 'scrimmage' && (
          <span className="ml-1.5 rounded bg-warm-100 px-1.5 py-0.5 text-eyebrow font-medium text-warm-500">
            Scrimmage
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-warm-600">{row.opponent ?? '—'}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-warm-700">
        {row.batting ? `${row.batting.h}-${row.batting.ab}` : '—'}
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-warm-700">
        {row.batting ? row.batting.rbi : '—'}
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-warm-700">
        {row.pitching ? `${row.pitching.ip} IP, ${row.pitching.k}K` : '—'}
      </td>
    </tr>
  );
}

function PerformanceSection({ performance }: { performance: PassportPerformance }) {
  const { seasonSummary, gameLogs } = performance;
  const b = seasonSummary.batting;
  const p = seasonSummary.pitching;
  return (
    <section className="mt-7">
      <SectionTitle
        icon={<IconChartBar size={14} />}
        title="Baseball Performance"
        meta={`${seasonSummary.seasonYear} · official only`}
      />
      {seasonSummary.noData ? (
        <p className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
          No box-score game logs yet. Captured games will populate season totals and per-game
          lines here.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Season summary tiles */}
          {b && (
            <div>
              <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                Batting · {b.g} G
              </p>
              <div className="grid grid-cols-4 gap-2">
                <SeasonStat label="AVG" value={fmtRate(b.avg)} />
                <SeasonStat label="OBP" value={fmtRate(b.obp)} />
                <SeasonStat label="SLG" value={fmtRate(b.slg)} />
                <SeasonStat label="OPS" value={fmtRate(b.ops)} />
                <SeasonStat label="H" value={String(b.h)} />
                <SeasonStat label="HR" value={String(b.hr)} />
                <SeasonStat label="RBI" value={String(b.rbi)} />
                <SeasonStat label="AB" value={String(b.ab)} />
                <SeasonStat label="BB" value={String(b.bb)} />
                <SeasonStat label="K" value={String(b.k)} />
              </div>
            </div>
          )}
          {p && (
            <div>
              <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                Pitching · {p.g} G
              </p>
              <div className="grid grid-cols-4 gap-2">
                <SeasonStat label="ERA" value={p.era != null ? p.era.toFixed(2) : '—'} />
                <SeasonStat label="WHIP" value={p.whip != null ? p.whip.toFixed(2) : '—'} />
                <SeasonStat label="IP" value={p.ip.toFixed(1)} />
                <SeasonStat label="K" value={String(p.k)} />
              </div>
            </div>
          )}

          {/* Per-game logs */}
          {gameLogs.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-warm-200">
              <table className="w-full min-w-[28rem] border-collapse">
                <thead>
                  <tr className="bg-warm-50 text-left">
                    <th className="px-3 py-2 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                      Date
                    </th>
                    <th className="px-3 py-2 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                      Opponent
                    </th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                      H-AB
                    </th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                      RBI
                    </th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                      Pitching
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gameLogs.slice(0, 15).map((row) => (
                    <GameLogRow key={row.gameId} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-eyebrow text-warm-400">
            Official games only. Scrimmage lines are labeled and excluded from season totals.
          </p>
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Completeness engine
// -----------------------------------------------------------------------------

function CompletenessSignalRow({ signal }: { signal: PassportCompletenessSignal }) {
  return (
    <li className="flex items-start gap-2.5 px-1 py-2">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          signal.complete ? 'bg-primary-100 text-primary-600' : 'bg-pursuit/10 text-pursuit'
        }`}
      >
        {signal.complete ? <IconCheckCircle2 size={13} /> : <IconAlertCircle size={13} />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-warm-800">{signal.label}</p>
        <p className="text-eyebrow text-warm-500">{signal.note}</p>
      </div>
    </li>
  );
}

function CompletenessMeter({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-warm-100">
        <div
          className="h-full rounded-full bg-primary-500 transition-all duration-500"
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-warm-700">{percent}%</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function PlayerPassportCard({
  model,
  compact = false,
  fullHref,
}: PlayerPassportCardProps) {
  const reduceMotion = useReducedMotion();

  if (!model.authorized) {
    return (
      <Card variant="overlay" hover={false}>
        <EmptyState
          variant="minimal"
          icon={<IconShieldCheck size={36} />}
          title="Passport not available"
          description="This player's passport isn't shared at your access level."
        />
      </Card>
    );
  }

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
      };

  const fullName =
    model.identity.find((f) => f.key === 'name')?.value ?? 'Player Passport';

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div {...fade}>
        <Card variant="raised" padding={compact ? 'md' : 'lg'}>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <IconShieldCheck size={16} />
                </span>
                <div>
                  <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
                    Player Passport
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-warm-900">
                    {fullName}
                  </h2>
                </div>
              </div>
              {model.headline && (
                <p className="mt-1.5 text-sm text-warm-500">{model.headline}</p>
              )}
            </div>
            <ExposurePill state={model.visibilityState} />
          </div>

          {/* Non-fatal error */}
          {model.error && (
            <InkNotice ink="pursuit" className="mt-4">
              {model.error}
            </InkNotice>
          )}

          {/* Identity grid */}
          {model.identity.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {model.identity
                .filter((f) => f.key !== 'name')
                .map((f) => (
                  <div key={f.key}>
                    <p className="text-eyebrow uppercase tracking-wide text-warm-400">
                      {f.label}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-warm-900">{f.value}</p>
                  </div>
                ))}
            </div>
          )}

          {/* Measurables — the proof layer */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-warm-700">Verified Measurables</h3>
            {model.measurables.length === 0 ? (
              <p className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
                No measurables on file yet. Add 60-yard, exit velocity, or throwing velocity to
                start building proof.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {model.measurables.map((mr) => (
                  <MeasurableTile key={mr.key} measurable={mr} />
                ))}
              </div>
            )}
          </div>

          {/* ---- FULL-mode deep sections (V5 §Passport Sections) ---- */}
          {!compact && model.performance && (
            <PerformanceSection performance={model.performance} />
          )}
          {!compact && model.developmentStory && (
            <DevelopmentStorySection story={model.developmentStory} />
          )}
          {!compact && model.media && <MediaSection media={model.media} />}

          {/* Recent activity (counts only, source-labeled) */}
          {!compact && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-warm-200 bg-warm-50 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <IconActivity size={16} />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-warm-800">
                  {model.recentActivity.capturedSessions} captured session
                  {model.recentActivity.capturedSessions === 1 ? '' : 's'}
                </p>
                <p className="text-warm-500">
                  {model.recentActivity.lastSessionDate
                    ? `Most recent ${model.recentActivity.lastSessionDate}${
                        model.recentActivity.lastSessionSource
                          ? ` · ${model.recentActivity.lastSessionSource.label}`
                          : ''
                      }`
                    : 'No captured stat sessions yet.'}
                </p>
              </div>
            </div>
          )}

          {/* Completeness engine */}
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-warm-700">Profile Completeness</h3>
            </div>
            <CompletenessMeter percent={model.completeness.percent} />
            <ul className="mt-3 divide-y divide-warm-100">
              {model.completeness.signals.map((s) => (
                <CompletenessSignalRow key={s.section} signal={s} />
              ))}
            </ul>
          </div>

          {/* Withheld-fields honesty line */}
          {model.withheldFieldCount > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-eyebrow text-warm-400">
              <IconLock size={11} />
              {model.withheldFieldCount} field
              {model.withheldFieldCount === 1 ? '' : 's'} hidden at your access level.
            </p>
          )}

          {/* Compact embed → full passport surface. The compact card is the
              Today snapshot; the dedicated route holds the full proof packet. */}
          {compact && fullHref && (
            <Link
              href={fullHref}
              className="mt-5 flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50"
            >
              <span>View full passport — story, video & performance</span>
              <IconArrowRight size={16} />
            </Link>
          )}
        </Card>
      </m.div>
    </LazyMotion>
  );
}
