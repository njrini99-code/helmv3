'use client';

// =============================================================================
// src/components/baseball/player-today/PlayerTimelineFairway.tsx
//
// "Living Annual" presentation for the player's own timeline. PRESENTATION
// ONLY — takes the exact same viewer-filtered events PlayerTimelineClient
// already assembles from `getPlayerTimeline` and re-skins them with the kit;
// no data path, action, read-model, or query is touched here.
//
// PARALLEL to `player-profile/ProfileTimeline.tsx`, NOT a replacement for it —
// that component is shared with the COACH player-profile surface and stays
// untouched (its own migration is a separate surface). This file is scoped
// exclusively to the player's own "My Timeline" (`viewerRole` is always
// 'player' here, so the copy doesn't need to branch on it).
//
// Honesty carried over verbatim:
//   - `hiddenCount` — events filtered out by visibility rules (staff_only,
//     or another player's player_only note) is never silently dropped; it
//     renders as a quiet count, both when there ARE events and when the
//     filtered result is empty.
//   - `error` — the read model's honest error string renders as-is, never
//     papered over with canned copy.
//   - Every source stamp is the real `SourceTrustBadge` built from the event's
//     resolved `sourceRef` + `confidence` — never a fabricated trust level.
// =============================================================================

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  IconActivity,
  IconNote,
  IconSparkles,
  IconUpload,
  IconCalendar,
  IconBolt,
  IconAward,
  IconUserPlus,
  IconClock,
  IconCheck,
} from '@/components/icons';
import { SourceTrustBadge, buildSourceTrust } from '@/components/baseball/source-trust';
import {
  Eyebrow,
  InkBadge,
  PaperCard,
  Trace,
  Reveal,
  EmptyIssue,
  EditorsLetter,
  StatReadout,
  pressableClass,
} from '@/components/baseball/living-annual';
import type { PlayerTimelineReadModel, TimelineEventView } from '@/lib/baseball/read-models/timeline';
import type { BaseballTimelineVisibility } from '@/lib/types';

export interface PlayerTimelineFairwayProps {
  events: TimelineEventView[];
  /** Count of events filtered out by visibility rules (defense-in-depth honesty). */
  hiddenCount?: number;
  /** Honest error string from the read model, if the fetch failed. */
  error?: PlayerTimelineReadModel['error'];
  /** Per-event acknowledgement state keyed by event id. */
  acknowledged?: Record<string, boolean>;
  /** Interactive toggle — omit to render acknowledgement read-only. */
  onToggleAck?: (eventId: string, next: boolean) => void;
  /** Event ids whose ack toggle is mid-flight. */
  pendingAckIds?: Set<string>;
  className?: string;
}

// ─── Event-kind → icon mapping (mirrors ProfileTimeline's, kept local — this
// file must not import from or edit the shared component). ──────────────────

function eventIcon(eventType: string) {
  switch (eventType) {
    case 'stat':
      return <IconActivity size={15} />;
    case 'stat_milestone':
      return <IconAward size={15} />;
    case 'practice':
      return <IconCalendar size={15} />;
    case 'lift':
      return <IconBolt size={15} />;
    case 'note':
      return <IconNote size={15} />;
    case 'import':
      return <IconUpload size={15} />;
    case 'ai':
      return <IconSparkles size={15} />;
    case 'roster':
      return <IconUserPlus size={15} />;
    default:
      return <IconClock size={15} />;
  }
}

// ─── Visibility stamp — quiet ink, never red/amber (kit law: urgency is
// colour, not chrome — even the staff-only defense-in-depth case). ──────────

const VISIBILITY_META: Record<BaseballTimelineVisibility, { label: string; tone: 'team' | 'neutral' }> = {
  team: { label: 'Team', tone: 'team' },
  player_only: { label: 'Player', tone: 'neutral' },
  staff_only: { label: 'Staff only', tone: 'neutral' },
};

// ─── Acknowledgement chip — InkBadge's visual language as an interactive
// toggle (InkBadge itself renders a non-interactive <span>). Press/hover
// physics come from the shared `pressableClass` — no bespoke hover CSS. ─────

function AckChip({
  acknowledged,
  onToggle,
  pending = false,
}: {
  acknowledged: boolean;
  onToggle?: (next: boolean) => void;
  pending?: boolean;
}) {
  if (!onToggle) {
    return acknowledged ? <InkBadge label="Acknowledged" tone="team" variant="solid" /> : null;
  }

  return (
    // A chip-sized toggle (text-microbadge / px-1.5 py-0.5) matching the
    // InkBadge/SourceTrustBadge siblings in the same row — the <Button>
    // primitive's fixed sm/md/lg sizing + haptics would not produce a chip.
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={() => onToggle(!acknowledged)}
      disabled={pending}
      aria-pressed={acknowledged}
      className={cn(
        pressableClass({ ink: 'team' }),
        'inline-flex items-center gap-1 rounded-fw-sm border px-1.5 py-0.5 font-annual text-microbadge uppercase leading-none tracking-[0.12em] disabled:cursor-wait disabled:opacity-60',
        acknowledged
          ? 'border-transparent text-grade-plus'
          : 'border-[color:var(--hairline)] text-text-tertiary hover:text-grade-plus',
      )}
      style={
        acknowledged
          ? { backgroundColor: 'color-mix(in oklch, var(--grade-plus) 16%, transparent)' }
          : undefined
      }
    >
      <IconCheck size={11} aria-hidden />
      {acknowledged ? 'Acknowledged' : 'Acknowledge'}
    </button>
  );
}

// ─── Date formatting (local copy — small + pure, same reason as eventIcon). ──

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlayerTimelineFairway({
  events,
  hiddenCount = 0,
  error = null,
  acknowledged,
  onToggleAck,
  pendingAckIds,
  className,
}: PlayerTimelineFairwayProps) {
  // Group events by calendar day for a clean editorial rhythm (same grouping
  // ProfileTimeline uses).
  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineEventView[]>();
    for (const ev of events) {
      const day = ev.occurredAt.slice(0, 10); // YYYY-MM-DD
      const bucket = groups.get(day);
      if (bucket) bucket.push(ev);
      else groups.set(day, [ev]);
    }
    return Array.from(groups.entries());
  }, [events]);

  if (error) {
    return (
      <EditorsLetter
        ink="team"
        title="The story couldn't load."
        body={error}
        className={className}
      />
    );
  }

  const hiddenNote =
    hiddenCount > 0 ? (
      <div className="flex items-center gap-1.5 text-body-sm text-text-secondary">
        <StatReadout
          value={hiddenCount}
          className="text-body-sm font-semibold text-text-secondary"
          ariaLabel="hidden events"
        />
        <span>{hiddenCount === 1 ? 'event hidden' : 'events hidden'} by visibility rules.</span>
      </div>
    ) : undefined;

  if (events.length === 0) {
    return <EmptyIssue variant="generic" ink="team" action={hiddenNote} className={className} />;
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Hidden-events honesty note — shown alongside real content too, not
          just the empty state, so a partially-filtered timeline stays honest. */}
      {hiddenNote}

      {grouped.map(([day, dayEvents], groupIdx) => (
        <div key={day}>
          <Eyebrow ink="muted" className="mb-3">
            {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Eyebrow>

          <div className="relative">
            {/* The timeline rail — one signature Trace stroke per day, drawing
                on mount, instead of a static gray hairline. */}
            {dayEvents.length > 1 ? (
              <div aria-hidden className="pointer-events-none absolute bottom-2 left-[17px] top-2 w-[2px]">
                <svg viewBox="0 0 2 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                  <Trace d="M1,0 L1,100" ink="team" weight={1.5} />
                </svg>
              </div>
            ) : null}

            <ol className="space-y-3">
              {dayEvents.map((ev, idx) => {
                const trust = buildSourceTrust({
                  ref: ev.sourceRef,
                  confidence: ev.confidence,
                  captureMode: 'active_capture',
                  verified: false,
                });
                const visMeta = VISIBILITY_META[ev.visibility] ?? VISIBILITY_META.team;

                return (
                  <li key={ev.id}>
                    <Reveal
                      staggerIndex={Math.min(groupIdx * 4 + idx, 10)}
                      className="relative flex gap-4"
                    >
                      {/* Timeline node */}
                      <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary">
                        {eventIcon(ev.eventType)}
                      </div>

                      <PaperCard className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-annual text-body-lg font-semibold leading-snug text-text-primary">
                              {ev.title}
                            </h4>
                            {ev.body ? (
                              <p className="mt-1 text-body-sm leading-relaxed text-text-secondary">
                                {ev.body}
                              </p>
                            ) : null}
                          </div>
                          <time
                            dateTime={ev.occurredAt}
                            className="shrink-0 whitespace-nowrap text-eyebrow tabular-nums text-text-tertiary"
                          >
                            {formatTimelineDate(ev.occurredAt)}
                          </time>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <InkBadge label={visMeta.label} tone={visMeta.tone} />
                          <SourceTrustBadge trust={trust} size="sm" viewerRole="player" />
                          <AckChip
                            acknowledged={!!acknowledged?.[ev.id]}
                            onToggle={onToggleAck ? (next) => onToggleAck(ev.id, next) : undefined}
                            pending={pendingAckIds?.has(ev.id) ?? false}
                          />
                        </div>
                      </PaperCard>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ))}
    </div>
  );
}

export default PlayerTimelineFairway;
