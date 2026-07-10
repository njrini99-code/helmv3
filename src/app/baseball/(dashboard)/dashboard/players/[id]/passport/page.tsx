// =============================================================================
// src/app/baseball/(dashboard)/dashboard/players/[id]/passport/page.tsx
//
// V5 Player Passport — the DEDICATED full passport surface (COACH/STAFF view).
//
// Spec: docs/.../19_breakthrough_product_systems_v5/
//        v5_player_passport_and_recruiting_showcase_system.md
//   "internal player passport · player meeting · roster evaluation"
//
// LIVING-ANNUAL MIGRATION (design-system-living-annual.md §6 P0 #1 "The Player
// Passport Spread"; map: docs/baseball/ui-migration-map.md). PRESENTATION ONLY —
// the read models, capability gates, and every mutation surface below are
// reused verbatim; only the rendering is re-skinned onto the Living-Annual kit
// (`@/components/baseball/living-annual`), off the retired legacy passport
// card component (removed once every importer is migrated). This coach-side
// view is composed directly from kit atoms/molecules; it does NOT import
// P4.24's `PlayerPassportFairway.tsx` (a same-wave, unmerged sibling task) to
// stay collision-free.
//
// The staff full passport for ONE player: Identity + Verified Measurables +
// Development Story + Media + Baseball Performance + File Readiness, every
// section non-compact, with honest provenance per item. This is the surface a
// coach pulls up for a player meeting or roster evaluation — READ-ONLY framing
// (the only write surface on this page is the untouched
// <PassportVisibilityControls> block below, which staff use to set the
// player's exposure).
//
// ACCESS: the active baseball context establishes the staff viewer + team. The
// read model resolves viewerRole='staff' from the session and gates every
// section through RLS + the in-process viewer filter — a coach only ever sees a
// player on a team they staff. Team scoping comes from the active context (the
// same team the Media/video read model resolves), so the sections stay aligned.
// An honest authorized:false envelope renders the not-available state via
// <EditorsLetter> (never a yellow warning box).
// =============================================================================

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getPlayerPassport,
  getPassportSettingsForEditor,
} from '@/lib/baseball/read-models/player-passport';
import type {
  PassportMeasurable,
  PassportMediaItem,
  PassportPerformance,
  PassportReadModel,
} from '@/lib/baseball/read-models/player-passport';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { PassportVisibilityControls } from '@/components/baseball/passport';
import type { PassportVisibilityState } from '@/lib/types/baseball-passport';
import { Button } from '@/components/fairway';
import {
  SectionMasthead,
  Eyebrow,
  HairlineRule,
  PaperCard,
  InkBadge,
  RuledStatLine,
  EditorsLetter,
  EmptyIssue,
  SlashLine,
  Reveal,
  HoverReveal,
  pressableClass,
  formatRate,
  formatRatio,
  formatInnings,
} from '@/components/baseball/living-annual';
import {
  IconArrowLeft,
  IconShieldCheck,
  IconLock,
  IconAlertCircle,
  IconActivity,
  IconVideo,
  IconExternalLink,
} from '@/components/icons';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Player Passport · BaseballHelm',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

// -----------------------------------------------------------------------------
// Display-only lookups (mirror the read model's canonical measurable set +
// exposure vocabulary — labels/copy only, no query or business logic here).
// -----------------------------------------------------------------------------

/** Mirrors MEASURABLE_DEFS in read-models/player-passport.ts — display only, so
 *  a measurable the player hasn't recorded yet still prints as a ghost row
 *  ("the file fills in") instead of collapsing the whole section to an empty
 *  box. */
const CANONICAL_MEASURABLES: Array<{ key: string; label: string; unit: string; decimals: number }> = [
  { key: 'sixty_time', label: '60-Yard', unit: 's', decimals: 2 },
  { key: 'exit_velo', label: 'Exit Velocity', unit: 'mph', decimals: 1 },
  { key: 'pitch_velo', label: 'Pitching Velocity', unit: 'mph', decimals: 1 },
  { key: 'pop_time', label: 'Pop Time', unit: 's', decimals: 2 },
  { key: 'arm_strength', label: 'Throwing Velocity', unit: 'mph', decimals: 1 },
];

const EXPOSURE_LABEL: Record<PassportVisibilityState, string> = {
  staff_only: 'Internal · Staff only',
  player_visible: 'Visible to player',
  public_profile: 'Public profile enabled',
  scout_packet: 'Scout packet ready',
};

const EXPOSURE_TONE: Record<PassportVisibilityState, 'team' | 'neutral'> = {
  staff_only: 'neutral',
  player_visible: 'team',
  public_profile: 'team',
  scout_packet: 'team',
};

// -----------------------------------------------------------------------------
// Section components — pure presentation over the read model's shapes. Plain
// functions (not their own files, per this task's file scope), composed
// straight from the Living-Annual kit; safe to render inside the server
// component below since every kit atom owns its own 'use client' boundary.
// -----------------------------------------------------------------------------

function MeasurablesSection({ measurables }: { measurables: PassportMeasurable[] }) {
  const present = new Map(measurables.map((m) => [m.key, m]));
  return (
    <section>
      <Eyebrow ink="team" className="mb-3">
        Verified Measurables
      </Eyebrow>
      <HairlineRule ink="team" className="mb-5" />
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        {CANONICAL_MEASURABLES.map((def) => {
          const m = present.get(def.key);
          return (
            <RuledStatLine
              key={def.key}
              label={def.label}
              value={m ? m.value : 0}
              unit={def.unit}
              size="row"
              ink="team"
              ghost={!m}
              verified={m?.trust.verified === true}
              decimals={def.decimals}
            />
          );
        })}
      </div>
    </section>
  );
}

function PerformanceSection({ performance }: { performance: PassportPerformance }) {
  const { seasonSummary, gameLogs } = performance;
  const b = seasonSummary.batting;
  const p = seasonSummary.pitching;
  const battingLeader = b && b.avg != null ? 'avg' : undefined;

  return (
    <section>
      <Eyebrow ink="team" className="mb-3">
        Baseball Performance · {seasonSummary.seasonYear} · Official Only
      </Eyebrow>
      <HairlineRule ink="team" className="mb-5" />

      {seasonSummary.noData ? (
        <EmptyIssue variant="stats" />
      ) : (
        <div className="space-y-7">
          {b ? (
            <div>
              <Eyebrow ink="muted" className="mb-2.5">
                Batting · {b.g} G
              </Eyebrow>
              <SlashLine
                avg={b.avg ?? '—'}
                obp={b.obp ?? '—'}
                slg={b.slg ?? '—'}
                size="sm"
                leader={battingLeader}
              />
              <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
                <RuledStatLine label="OPS" value={b.ops != null ? formatRate(b.ops) : '—'} size="row" />
                <RuledStatLine label="H" value={b.h} size="row" />
                <RuledStatLine label="HR" value={b.hr} size="row" />
                <RuledStatLine label="RBI" value={b.rbi} size="row" />
                <RuledStatLine label="AB" value={b.ab} size="row" />
                <RuledStatLine label="BB" value={b.bb} size="row" />
                <RuledStatLine label="K" value={b.k} size="row" />
              </div>
            </div>
          ) : null}

          {p ? (
            <div>
              <Eyebrow ink="muted" className="mb-2.5">
                Pitching · {p.g} G
              </Eyebrow>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <RuledStatLine label="ERA" value={p.era != null ? formatRatio(p.era) : '—'} size="row" />
                <RuledStatLine label="WHIP" value={p.whip != null ? formatRatio(p.whip) : '—'} size="row" />
                <RuledStatLine label="IP" value={formatInnings(p.ip)} size="row" />
                <RuledStatLine label="K" value={p.k} size="row" />
              </div>
            </div>
          ) : null}

          {gameLogs.length > 0 ? (
            <div>
              <Eyebrow ink="muted" className="mb-2.5">
                Recent games
              </Eyebrow>
              <div className="divide-y divide-[color:var(--hairline)]">
                {gameLogs.slice(0, 10).map((row) => (
                  <div key={row.gameId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="font-annual text-body-sm text-text-primary">
                        {row.gameDate ? new Date(row.gameDate).toLocaleDateString() : '—'}
                        <span className="ml-1.5 text-text-tertiary">vs {row.opponent ?? '—'}</span>
                      </p>
                      {row.gameType === 'scrimmage' ? (
                        <InkBadge label="Scrimmage" tone="neutral" className="mt-1" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-4 text-eyebrow tabular-nums text-text-secondary">
                      {row.batting ? (
                        <span>
                          {row.batting.h}-{row.batting.ab}, {row.batting.rbi} RBI
                        </span>
                      ) : null}
                      {row.pitching ? (
                        <span>
                          {formatInnings(row.pitching.ip)} IP, {row.pitching.k} K
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-eyebrow text-text-tertiary">
                Official games only. Scrimmage lines are labeled and excluded from season totals.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function DevelopmentStorySection({
  story,
}: {
  story: NonNullable<PassportReadModel['developmentStory']>;
}) {
  return (
    <section>
      <Eyebrow ink="team" className="mb-3">
        Development Story{story.events.length > 0 ? ` · ${story.events.length} moments` : ''}
      </Eyebrow>
      <HairlineRule ink="team" className="mb-5" />

      {story.events.length === 0 ? (
        <EmptyIssue variant="dev-plan" />
      ) : (
        <div className="space-y-5">
          {story.events.map((event, i) => (
            <Reveal key={event.id} staggerIndex={Math.min(i, 6)}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-grade-plus" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="font-annual text-body-lg text-text-primary">{event.title}</p>
                    <Eyebrow ink="muted">{new Date(event.occurredAt).toLocaleDateString()}</Eyebrow>
                  </div>
                  {event.body ? <p className="mt-1 text-body-sm text-text-secondary">{event.body}</p> : null}
                  <InkBadge
                    label={event.trust.label}
                    tone={event.trust.verified ? 'team' : 'neutral'}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      {story.hiddenCount > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-eyebrow text-text-tertiary">
          <IconLock size={11} />
          {story.hiddenCount} moment{story.hiddenCount === 1 ? '' : 's'} hidden at your access level.
        </p>
      ) : null}
    </section>
  );
}

function MediaTile({ item }: { item: PassportMediaItem }) {
  const content = (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)]',
        item.url && pressableClass({ ink: 'team' }),
      )}
    >
      <div
        className="relative flex aspect-video items-center justify-center bg-[var(--paper-canvas)] bg-cover bg-center"
        style={item.thumbnailUrl ? { backgroundImage: `url(${JSON.stringify(item.thumbnailUrl)})` } : undefined}
      >
        {!item.thumbnailUrl ? <IconVideo size={22} className="text-text-tertiary" /> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 font-annual text-body-sm text-text-primary">{item.title}</p>
        <div className="mt-auto">
          <InkBadge label={item.trust.label} tone={item.trust.verified ? 'team' : 'neutral'} />
        </div>
      </div>
    </div>
  );

  if (item.url) {
    return (
      <HoverReveal
        position="overlay"
        className="h-full"
        reveal={
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--paper)]/90 text-grade-plus shadow-sm">
            <IconExternalLink size={12} />
          </span>
        }
      >
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block h-full">
          {content}
        </a>
      </HoverReveal>
    );
  }
  return content;
}

function MediaSection({ media }: { media: NonNullable<PassportReadModel['media']> }) {
  const refs = media.items.filter((m) => m.isReference);
  return (
    <section>
      <Eyebrow ink="team" className="mb-3">
        Media{refs.length > 0 ? ` · ${refs.length} clips` : ''}
      </Eyebrow>
      <HairlineRule ink="team" className="mb-5" />

      {refs.length === 0 ? (
        <EmptyIssue variant="generic" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {refs.map((item, i) => (
            <Reveal key={item.id} staggerIndex={Math.min(i, 6)}>
              <MediaTile item={item} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default async function CoachPlayerPassportPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const context = await getActiveBaseballContext();
  if (!context) {
    redirect('/baseball/dashboard/command-center');
  }
  // Coaches/staff only — players reach their own passport via /baseball/player/passport.
  if (context.activeRole !== 'coach') {
    redirect('/baseball/player/passport');
  }

  // FULL mode for the target player, scoped to the active team (which is also the
  // team the Media/video read model resolves — keeps every section aligned).
  const [passport, caps, settings] = await Promise.all([
    getPlayerPassport(context.activeTeamId, { playerId: id, mode: 'full' }),
    resolveBaseballCapabilities(context.activeTeamId),
    getPassportSettingsForEditor(context.activeTeamId, id),
  ]);
  // Scout-packet sharing is the OUTBOUND action; only export-capable staff see
  // the affordance. The passport must additionally be exposed to actually share,
  // which the manage surface enforces + explains inline.
  const canShare = caps.can_export_reports || caps.is_head_coach;
  const exposed =
    passport.visibilityState === 'public_profile' || passport.visibilityState === 'scout_packet';

  const fullName = passport.identity.find((f) => f.key === 'name')?.value ?? 'Player Passport';
  const identityFields = passport.identity.filter((f) => f.key !== 'name');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <Button asChild variant="ghost" size="sm" leftIcon={<IconArrowLeft size={16} />} className="mb-6">
        <Link href={`/baseball/dashboard/players/${id}`}>Back to profile</Link>
      </Button>

      <SectionMasthead
        eyebrow="Player Passport · Roster Evaluation"
        title={fullName}
        ink="team"
        actions={
          canShare ? (
            <Button asChild variant="primary" size="md" leftIcon={<IconShieldCheck size={15} />}>
              <Link href={`/baseball/dashboard/players/${id}/scout-packet`}>
                {exposed ? 'Scout packet' : 'Share as packet'}
              </Link>
            </Button>
          ) : undefined
        }
      >
        <p className="max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
          The source-backed proof packet for player meetings and roster evaluation — measurables,
          development story, video, and performance with full provenance.
        </p>
      </SectionMasthead>

      <div className="mt-8">
        {!passport.authorized ? (
          <EditorsLetter
            ink="team"
            title="Passport not available"
            body="This player's passport isn't shared at your access level."
          />
        ) : (
          <Reveal>
            <PaperCard registrationTick className="p-6 sm:p-8">
              {/* Headline + exposure state */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {passport.headline ? (
                    <p className="max-w-prose font-annual text-body-lg text-text-secondary">{passport.headline}</p>
                  ) : null}
                </div>
                <InkBadge
                  label={EXPOSURE_LABEL[passport.visibilityState]}
                  tone={EXPOSURE_TONE[passport.visibilityState]}
                  variant="solid"
                />
              </div>

              {/* Non-fatal error — a quiet note, never a yellow warning box */}
              {passport.error ? (
                <div className="mt-4 flex items-start gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-3.5 py-2.5">
                  <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-text-tertiary" />
                  <p className="text-body-sm text-text-secondary">{passport.error}</p>
                </div>
              ) : null}

              {/* Identity fields */}
              {identityFields.length > 0 ? (
                <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                  {identityFields.map((f) => (
                    <div key={f.key} className="min-w-0">
                      <Eyebrow ink="muted">{f.label}</Eyebrow>
                      <p className="mt-1 truncate font-annual text-body-lg text-text-primary">{f.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Measurables — the proof layer */}
              <div className="mt-8">
                <MeasurablesSection measurables={passport.measurables} />
              </div>

              {/* ---- FULL-mode deep sections (V5 §Passport Sections) ---- */}
              {passport.performance ? (
                <div className="mt-8">
                  <PerformanceSection performance={passport.performance} />
                </div>
              ) : null}
              {passport.developmentStory ? (
                <div className="mt-8">
                  <DevelopmentStorySection story={passport.developmentStory} />
                </div>
              ) : null}
              {passport.media ? (
                <div className="mt-8">
                  <MediaSection media={passport.media} />
                </div>
              ) : null}

              {/* Recent activity (counts only, source-labeled) */}
              <div className="mt-8 flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-grade-plus/10 text-grade-plus">
                  <IconActivity size={16} />
                </span>
                <div className="min-w-0 text-body-sm">
                  <p className="font-medium text-text-primary">
                    {passport.recentActivity.capturedSessions} captured session
                    {passport.recentActivity.capturedSessions === 1 ? '' : 's'}
                  </p>
                  <p className="text-text-secondary">
                    {passport.recentActivity.lastSessionDate
                      ? `Most recent ${passport.recentActivity.lastSessionDate}${
                          passport.recentActivity.lastSessionSource
                            ? ` · ${passport.recentActivity.lastSessionSource.label}`
                            : ''
                        }`
                      : 'No captured stat sessions yet.'}
                  </p>
                </div>
              </div>

              {/* File Readiness — completeness engine. Per the spec, the percent
                  bar dies here: the numeral IS the readout, and every missing
                  section reads as an honest "not yet" row, not a progress bar. */}
              <div className="mt-8">
                <Eyebrow ink="team" className="mb-3">
                  File Readiness
                </Eyebrow>
                <HairlineRule ink="team" className="mb-5" />
                <RuledStatLine
                  label="Complete"
                  value={passport.completeness.percent}
                  unit="%"
                  size="row"
                  ink="team"
                  emphasis={passport.completeness.percent >= 100}
                />
                <div className="mt-5 divide-y divide-[color:var(--hairline)]">
                  {passport.completeness.signals.map((s) => (
                    <div key={s.section} className="flex items-start gap-2.5 py-2.5">
                      <InkBadge
                        label={s.complete ? 'On the record' : 'Not yet'}
                        tone={s.complete ? 'team' : 'neutral'}
                      />
                      <div className="min-w-0">
                        <p className="font-annual text-body-sm font-medium text-text-primary">{s.label}</p>
                        <p className="text-eyebrow text-text-tertiary">{s.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Withheld-fields honesty line */}
              {passport.withheldFieldCount > 0 ? (
                <p className="mt-6 flex items-center gap-1.5 text-eyebrow text-text-tertiary">
                  <IconLock size={11} />
                  {passport.withheldFieldCount} field
                  {passport.withheldFieldCount === 1 ? '' : 's'} hidden at your access level.
                </p>
              ) : null}
            </PaperCard>
          </Reveal>
        )}
      </div>

      {/* Staff Visibility Controls — staff edit the TARGET player's exposure +
          per-field visibility. The action authorizes via can_manage_roster and
          RLS independently. canEdit reflects the resolved gate. Untouched write
          surface — every mutation preserved verbatim. */}
      {settings.playerId && settings.canEdit ? (
        <div className="mt-8">
          <PassportVisibilityControls
            playerId={id}
            publicProfilePlayerId={id}
            initialState={settings.visibilityState}
            initialHeadline={settings.headline}
            initialFieldVisibility={settings.fieldVisibility}
            canEdit={settings.canEdit}
          />
        </div>
      ) : null}
    </div>
  );
}
