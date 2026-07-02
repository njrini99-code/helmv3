'use client';

// =============================================================================
// src/components/baseball/passport/PlayerPassportFairway.tsx
//
// V5 Player Passport — the DEDICATED full passport surface, composed on the
// "Living Annual" kit (spec: docs/baseball/design-system-living-annual.md §9
// "The Passport that writes itself"; execution plan
// docs/baseball/ui-migration-execution-plan.md §3.3 `passport`).
//
// PRESENTATION ONLY. Takes the SAME `PassportReadModel` the page already
// assembles (`getPlayerPassport(teamId, { mode: 'full' })`) and re-skins it —
// no read-model, action, RLS, or query is touched here. `PlayerPassportCard`
// (the legacy component this replaces on THIS route) is left completely
// untouched: it is still the compact embed on Player Today
// (`PlayerTodayClient:93`) until that surface's own migration decouples it.
//
// HONESTY (binding, carried over verbatim):
//   - Every measurable is `source:'manual'` / `verified:false` at the read-
//     model layer today (player-profile columns predate per-value
//     verification) — a `<RuledStatLine verified>` only lights up when
//     `measurable.trust.verified === true`, never assumed.
//   - Measurables the player hasn't recorded render as GHOST `<RuledStatLine>`
//     rows (em-dash, 40% opacity) rather than being omitted — "the file fills
//     in" as data arrives, it never starts blank.
//   - `withheldFieldCount` / `developmentStory.hiddenCount` keep surfacing
//     "N hidden at your access level" so a filtered view never reads as a
//     complete one.
//   - The old `%`-bar `CompletenessMeter` is gone; each completeness signal is
//     its own ghost/filled `<RuledStatLine>` row — completeness is a spread of
//     gaps and fills, not a progress bar.
// =============================================================================

import {
  Masthead,
  Eyebrow,
  PaperCard,
  HairlineRule,
  InkBadge,
  EditorsLetter,
  RuledStatLine,
  SlashLine,
  Reveal,
  pressableClass,
  formatRate,
  formatRatio,
} from '@/components/baseball/living-annual';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import {
  IconLock,
  IconActivity,
  IconVideo,
  IconClock,
  IconExternalLink,
  IconCalendar,
} from '@/components/icons';
import type {
  PassportReadModel,
  PassportMeasurable,
  PassportStoryEvent,
  PassportMediaItem,
  PassportGameLogRow,
  PassportPerformance,
} from '@/lib/baseball/read-models/player-passport';
import type { PassportVisibilityState } from '@/lib/types/baseball-passport';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface PlayerPassportFairwayProps {
  model: PassportReadModel;
}

// -----------------------------------------------------------------------------
// Exposure badge (data-driven from model.visibilityState — the read model's
// own resolved exposure, same field the legacy card read)
// -----------------------------------------------------------------------------

const EXPOSURE_META: Record<
  PassportVisibilityState,
  { label: string; tone: 'neutral' | 'team'; variant: 'soft' | 'solid' }
> = {
  staff_only: { label: 'Internal · Staff only', tone: 'neutral', variant: 'soft' },
  player_visible: { label: 'Visible to you', tone: 'team', variant: 'soft' },
  public_profile: { label: 'Public profile', tone: 'team', variant: 'solid' },
  scout_packet: { label: 'Scout packet ready', tone: 'team', variant: 'solid' },
};

// -----------------------------------------------------------------------------
// Local sub-section header — Eyebrow + HairlineRule, the same pair every other
// migrated surface's aside/section header already composes (see
// CommandCenterFairway's "This week" / "Jump to" cards). Not a new kit atom —
// just a repeated local pairing of two existing ones.
// -----------------------------------------------------------------------------

function SubSectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Eyebrow ink="team">{title}</Eyebrow>
      {meta ? <Eyebrow ink="muted">{meta}</Eyebrow> : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Verified Measurables — the proof layer. "The file fills in": the five known
// measurable slots always render, filled ones ON THE RECORD, unfilled ones
// ghosted (em-dash, 40% opacity) rather than omitted. Mirrors MEASURABLE_DEFS
// in the read model (presentation-only catalog — labels/units for the ghost
// slots the player hasn't recorded yet; a value that exists always overrides
// this local catalog).
// -----------------------------------------------------------------------------

const KNOWN_MEASURABLE_SLOTS: ReadonlyArray<{ key: string; label: string; unit: string }> = [
  { key: 'sixty_time', label: '60-Yard', unit: 's' },
  { key: 'exit_velo', label: 'Exit Velocity', unit: 'mph' },
  { key: 'pitch_velo', label: 'Pitching Velocity', unit: 'mph' },
  { key: 'pop_time', label: 'Pop Time', unit: 's' },
  { key: 'arm_strength', label: 'Throwing Velocity', unit: 'mph' },
];

interface MeasurableRow {
  key: string;
  label: string;
  unit: string;
  ghost: boolean;
  value?: number;
  verified?: boolean;
  eventDate?: string | null;
}

function buildMeasurableRows(measurables: PassportMeasurable[]): MeasurableRow[] {
  const byKey = new Map(measurables.map((m) => [m.key, m]));
  const known = KNOWN_MEASURABLE_SLOTS.map((slot): MeasurableRow => {
    const m = byKey.get(slot.key);
    if (!m) return { key: slot.key, label: slot.label, unit: slot.unit, ghost: true };
    return {
      key: m.key,
      label: m.label,
      unit: m.unit,
      ghost: false,
      value: m.value,
      verified: m.trust.verified === true,
      eventDate: m.eventDate,
    };
  });
  // Any measurable the read model returns outside the known five slots stays
  // visible too — never silently dropped just because it isn't in this
  // presentation-only catalog.
  const extra = measurables
    .filter((m) => !KNOWN_MEASURABLE_SLOTS.some((slot) => slot.key === m.key))
    .map(
      (m): MeasurableRow => ({
        key: m.key,
        label: m.label,
        unit: m.unit,
        ghost: false,
        value: m.value,
        verified: m.trust.verified === true,
        eventDate: m.eventDate,
      }),
    );
  return [...known, ...extra];
}

function MeasurableRowLine({ row, index }: { row: MeasurableRow; index: number }) {
  const decimals = !row.ghost && row.value !== undefined && !Number.isInteger(row.value) ? 1 : 0;
  return (
    <Reveal staggerIndex={Math.min(index, 6)}>
      <div>
        <RuledStatLine
          label={row.label}
          value={row.ghost ? 0 : (row.value ?? 0)}
          unit={row.unit}
          decimals={decimals}
          verified={!row.ghost && row.verified === true}
          ghost={row.ghost}
          ink="team"
        />
        {!row.ghost ? (
          <p className="mt-1.5 flex items-center gap-1 text-eyebrow text-text-tertiary">
            <IconCalendar size={10} aria-hidden />
            {row.eventDate ? `Captured ${row.eventDate}` : 'No event on file'}
          </p>
        ) : null}
      </div>
    </Reveal>
  );
}

// -----------------------------------------------------------------------------
// Development Story — timeline rail. Reuses SourceTrustBadge (the shared
// foundation provenance chip, kept verbatim per every other migrated surface).
// -----------------------------------------------------------------------------

function StoryEventRow({ event, index }: { event: PassportStoryEvent; index: number }) {
  return (
    <Reveal staggerIndex={Math.min(index, 8)}>
      <li className="relative flex gap-3 pb-4 pl-1 last:pb-0">
        <span
          aria-hidden
          className="relative mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-grade-plus ring-4 ring-grade-plus/10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-annual text-body-sm font-medium text-text-primary">{event.title}</p>
            <span className="text-eyebrow tabular-nums text-text-tertiary">
              {new Date(event.occurredAt).toLocaleDateString()}
            </span>
          </div>
          {event.body ? (
            <p className="mt-0.5 font-annual text-body-sm text-text-secondary">{event.body}</p>
          ) : null}
          <div className="mt-1.5">
            <SourceTrustBadge trust={event.trust} size="sm" />
          </div>
        </div>
      </li>
    </Reveal>
  );
}

function DevelopmentStoryBlock({
  story,
}: {
  story: NonNullable<PassportReadModel['developmentStory']>;
}) {
  return (
    <PaperCard className="p-6 sm:p-8">
      <SubSectionHeader
        title="Development Story"
        meta={story.events.length > 0 ? `${story.events.length} moments` : undefined}
      />
      {story.events.length === 0 ? (
        <EditorsLetter
          ink="team"
          title="The story is just starting."
          body="Goals, coach notes, and progress milestones build this timeline as the season unfolds."
        />
      ) : (
        <ol className="relative ml-1 border-l border-[color:var(--hairline)] pl-4">
          {story.events.map((e, i) => (
            <StoryEventRow key={e.id} event={e} index={i} />
          ))}
        </ol>
      )}
      {story.hiddenCount > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-eyebrow text-text-tertiary">
          <IconClock size={11} aria-hidden />
          {story.hiddenCount} moment{story.hiddenCount === 1 ? '' : 's'} hidden at your access
          level.
        </p>
      ) : null}
    </PaperCard>
  );
}

// -----------------------------------------------------------------------------
// Media — reference clips grid. Each tile is a bespoke tappable surface (not a
// <Button>), so it wears the Stage-0 `pressableClass` press/hover physics.
// -----------------------------------------------------------------------------

function MediaTile({ item }: { item: PassportMediaItem }) {
  const body = (
    <PaperCard>
      <div
        className="relative flex aspect-video items-center justify-center bg-[color:var(--paper-canvas)] bg-cover bg-center"
        style={item.thumbnailUrl ? { backgroundImage: `url(${JSON.stringify(item.thumbnailUrl)})` } : undefined}
      >
        {!item.thumbnailUrl ? <IconVideo size={22} className="text-text-tertiary" aria-hidden /> : null}
        {item.url ? (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--paper)]/90 text-grade-plus shadow-[inset_0_0_0_1px_var(--hairline)]">
            <IconExternalLink size={12} aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="line-clamp-2 font-annual text-body-sm font-medium text-text-primary">
          {item.title}
        </p>
        <SourceTrustBadge trust={item.trust} size="sm" />
      </div>
    </PaperCard>
  );
  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={pressableClass({ ink: 'team', className: 'block h-full rounded-card' })}
      >
        {body}
      </a>
    );
  }
  return body;
}

function MediaBlock({ media }: { media: NonNullable<PassportReadModel['media']> }) {
  const refs = media.items.filter((m) => m.isReference);
  return (
    <PaperCard className="p-6 sm:p-8">
      <SubSectionHeader title="Media" meta={refs.length > 0 ? `${refs.length} clips` : undefined} />
      {refs.length === 0 ? (
        <EditorsLetter
          ink="team"
          title="No video on file yet."
          body="Source-backed clips strengthen the proof packet the moment they're attached."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {refs.map((item, i) => (
            <Reveal key={item.id} staggerIndex={Math.min(i, 6)}>
              <MediaTile item={item} />
            </Reveal>
          ))}
        </div>
      )}
    </PaperCard>
  );
}

// -----------------------------------------------------------------------------
// Baseball Performance — season slash line + counting stats + game logs.
// -----------------------------------------------------------------------------

function GameLogRow({ row }: { row: PassportGameLogRow }) {
  return (
    <tr>
      <td className="px-3 py-2.5 font-annual text-body-sm text-text-primary">
        <span className="font-medium">
          {row.gameDate ? new Date(row.gameDate).toLocaleDateString() : '—'}
        </span>
        {row.gameType === 'scrimmage' ? (
          <InkBadge label="Scrimmage" tone="neutral" className="ml-2 align-middle" />
        ) : null}
      </td>
      <td className="px-3 py-2.5 font-annual text-body-sm text-text-secondary">{row.opponent ?? '—'}</td>
      <td className="px-3 py-2.5 text-right font-annual text-body-sm tabular-nums text-text-primary">
        {row.batting ? `${row.batting.h}-${row.batting.ab}` : '—'}
      </td>
      <td className="px-3 py-2.5 text-right font-annual text-body-sm tabular-nums text-text-primary">
        {row.batting ? row.batting.rbi : '—'}
      </td>
      <td className="px-3 py-2.5 text-right font-annual text-body-sm tabular-nums text-text-primary">
        {row.pitching ? `${row.pitching.ip} IP, ${row.pitching.k}K` : '—'}
      </td>
    </tr>
  );
}

function PerformanceBlock({ performance }: { performance: PassportPerformance }) {
  const { seasonSummary, gameLogs } = performance;
  const b = seasonSummary.batting;
  const p = seasonSummary.pitching;

  return (
    <PaperCard className="p-6 sm:p-8">
      <SubSectionHeader
        title="Baseball Performance"
        meta={`${seasonSummary.seasonYear} · official only`}
      />
      {seasonSummary.noData ? (
        <EditorsLetter
          ink="team"
          live
          title="No box scores yet."
          body="Captured games populate the season summary and per-game lines here."
        />
      ) : (
        <div className="space-y-6">
          {b ? (
            <div>
              <Eyebrow ink="muted" className="mb-3">
                Batting · {b.g} G
              </Eyebrow>
              <SlashLine avg={b.avg ?? '—'} obp={b.obp ?? '—'} slg={b.slg ?? '—'} ink="team" />
              <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-4">
                <RuledStatLine label="OPS" value={b.ops === null ? '—' : formatRate(b.ops, 3)} size="row" ink="team" />
                <RuledStatLine label="H" value={b.h} size="row" ink="team" />
                <RuledStatLine label="HR" value={b.hr} size="row" ink="team" />
                <RuledStatLine label="RBI" value={b.rbi} size="row" ink="team" />
                <RuledStatLine label="AB" value={b.ab} size="row" ink="team" />
                <RuledStatLine label="BB" value={b.bb} size="row" ink="team" />
                <RuledStatLine label="K" value={b.k} size="row" ink="team" />
              </div>
            </div>
          ) : null}

          {p ? (
            <div>
              <Eyebrow ink="muted" className="mb-3">
                Pitching · {p.g} G
              </Eyebrow>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <RuledStatLine label="ERA" value={p.era === null ? '—' : formatRatio(p.era, 2)} size="row" ink="team" />
                <RuledStatLine label="WHIP" value={p.whip === null ? '—' : formatRatio(p.whip, 2)} size="row" ink="team" />
                <RuledStatLine label="IP" value={p.ip} decimals={1} size="row" ink="team" />
                <RuledStatLine label="K" value={p.k} size="row" ink="team" />
              </div>
            </div>
          ) : null}

          {gameLogs.length > 0 ? (
            <div className="overflow-x-auto rounded-card border border-[color:var(--hairline)]">
              <table className="w-full min-w-[28rem] border-collapse">
                <thead>
                  <tr className="border-b-[1.5px] border-grade-plus/60 text-left">
                    <th className="px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                      Date
                    </th>
                    <th className="px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                      Opponent
                    </th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                      H-AB
                    </th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                      RBI
                    </th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                      Pitching
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--hairline)]">
                  {gameLogs.slice(0, 15).map((row) => (
                    <GameLogRow key={row.gameId} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="text-eyebrow text-text-tertiary">
            Official games only. Scrimmage lines are labeled and excluded from season totals.
          </p>
        </div>
      )}
    </PaperCard>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function PlayerPassportFairway({ model }: PlayerPassportFairwayProps) {
  if (!model.authorized) {
    return (
      <EditorsLetter
        ink="team"
        title="Passport not available"
        body="This player's passport isn't shared at your access level."
      />
    );
  }

  const nameField = model.identity.find((f) => f.key === 'name');
  const fullName = (nameField?.value ?? '').trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const surname = nameParts.length > 0 ? nameParts[nameParts.length - 1]! : 'Player Passport';
  const given = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

  const positionsField = model.identity.find((f) => f.key === 'positions')?.value;
  const classField = model.identity.find((f) => f.key === 'grad_year')?.value;
  const hometownField = model.identity.find((f) => f.key === 'hometown')?.value;
  const stateField = hometownField?.includes(',') ? hometownField.split(',').pop()?.trim() : undefined;
  const datelineItems = [positionsField, classField, stateField].filter(Boolean) as string[];

  // The remaining identity facts not already folded into the masthead dateline.
  const restIdentity = model.identity.filter(
    (f) => !['name', 'positions', 'grad_year', 'hometown'].includes(f.key),
  );

  const exposure = EXPOSURE_META[model.visibilityState];
  const measurableRows = buildMeasurableRows(model.measurables);

  return (
    <div className="space-y-8">
      {/* ── The cover: masthead, exposure state, identity ─────────────────── */}
      <PaperCard registrationTick className="p-6 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Masthead
            given={given}
            surname={surname}
            dateline={datelineItems.length > 0 ? <Eyebrow items={datelineItems} ink="team" /> : undefined}
            ink="team"
            registrationTick
            accentRule
            scrollShrink
          />
          <InkBadge label={exposure.label} tone={exposure.tone} variant={exposure.variant} />
        </div>

        {model.headline ? (
          <p className="mt-4 max-w-prose font-annual text-body-lg italic leading-relaxed text-text-secondary">
            {model.headline}
          </p>
        ) : null}

        {model.error ? (
          <EditorsLetter className="mt-6" ink="team" title="Signals are catching up." body={model.error} />
        ) : null}

        {restIdentity.length > 0 ? (
          <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            {restIdentity.map((f) => (
              <div key={f.key}>
                <Eyebrow ink="muted">{f.label}</Eyebrow>
                <p className="mt-1 font-annual text-body-sm text-text-primary">{f.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <HairlineRule ink="hairline" className="my-8" />

        {/* ── Verified Measurables — the proof layer; the file fills in ──── */}
        <SubSectionHeader title="Verified Measurables" />
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
          {measurableRows.map((row, i) => (
            <MeasurableRowLine key={row.key} row={row} index={i} />
          ))}
        </div>
      </PaperCard>

      {/* ── Full-mode deep sections ─────────────────────────────────────── */}
      {model.performance ? <PerformanceBlock performance={model.performance} /> : null}
      {model.developmentStory ? <DevelopmentStoryBlock story={model.developmentStory} /> : null}
      {model.media ? <MediaBlock media={model.media} /> : null}

      {/* ── Recent activity + completeness — the footer of the folio ─────── */}
      <PaperCard className="p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus">
            <IconActivity size={16} aria-hidden />
          </span>
          <div className="min-w-0 font-annual text-body-sm">
            <p className="font-medium text-text-primary">
              {model.recentActivity.capturedSessions} captured session
              {model.recentActivity.capturedSessions === 1 ? '' : 's'}
            </p>
            <p className="text-text-tertiary">
              {model.recentActivity.lastSessionDate
                ? `Most recent ${model.recentActivity.lastSessionDate}${
                    model.recentActivity.lastSessionSource
                      ? ` · ${model.recentActivity.lastSessionSource.label}`
                      : ''
                  }`
                : 'No captured stat sessions yet.'}
            </p>
            {model.recentActivity.lastSessionTrust ? (
              <div className="mt-1.5">
                <SourceTrustBadge trust={model.recentActivity.lastSessionTrust} size="sm" />
              </div>
            ) : null}
          </div>
        </div>

        <HairlineRule ink="hairline" className="my-6" />

        <SubSectionHeader title="On the Record" meta={`${model.completeness.percent}%`} />
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
          {model.completeness.signals.map((s, i) => (
            <Reveal key={s.section} staggerIndex={Math.min(i, 8)}>
              <div>
                <RuledStatLine
                  label={s.label}
                  value={s.complete ? 'Complete' : 0}
                  ghost={!s.complete}
                  size="row"
                  ink="team"
                />
                <p className="mt-1.5 text-eyebrow text-text-tertiary">{s.note}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {model.withheldFieldCount > 0 ? (
          <p className="mt-5 flex items-center gap-1.5 text-eyebrow text-text-tertiary">
            <IconLock size={11} aria-hidden />
            {model.withheldFieldCount} field{model.withheldFieldCount === 1 ? '' : 's'} hidden at
            your access level.
          </p>
        ) : null}
      </PaperCard>
    </div>
  );
}
