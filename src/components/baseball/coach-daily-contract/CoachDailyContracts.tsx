'use client';

// =============================================================================
// src/components/baseball/daily-contract/CoachDailyContracts.tsx
//
// V5 Daily Contract — the COACH surface (the staff half of the loop).
//
// The player composes + commits + honors a daily contract privately. When a
// player SHARES a day, it surfaces here: a roster-wide "who committed / who
// honored / who's on a streak" read-out, with a per-player drill-in and a single
// prominent action — ACKNOWLEDGE (optionally with a short note), which writes a
// private coach→player recognition into the player's development timeline.
//
// This closes the source→signal→action→outcome loop for staff:
//   source  : the player's shared committed/completed day
//   signal  : it appears in this feed (sorted to surface today's engagement)
//   action  : the coach acknowledges (+ optional note)
//   outcome : ack chip on the row + a coach→player timeline note
//
// HONEST: shows only what the player chose to share. Never the private
// reflection. A roster member who shared nothing reads as "Nothing shared today"
// — not a fake empty contract. Cream/green GolfHelm primitives, no golf labels.
// =============================================================================

import { useState, useTransition, useCallback } from 'react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { InkNotice } from '@/components/baseball/living-annual';
import {
  IconTarget,
  IconCheck,
  IconFlame,
  IconCheckCircle2,
  IconClock,
  IconHeart,
  IconChevronDown,
  IconAlertCircle,
  IconUsers,
  IconShield,
} from '@/components/icons';
import type {
  CoachDailyContractsReadModel,
  CoachContractRosterItem,
} from '@/lib/baseball/read-models/coach-daily-contracts';
import { acknowledgeDailyContract } from '@/app/baseball/actions/daily-contract';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface CoachDailyContractsProps {
  model: CoachDailyContractsReadModel;
  /** Open a player's full profile (the drill-in's "view profile" affordance). */
  onOpenPlayer?: (playerId: string) => void;
}

function playerName(item: CoachContractRosterItem): string {
  return `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || 'Player';
}

// -----------------------------------------------------------------------------
// Summary stat
// -----------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  /** 'warning' tints a non-zero count pursuit clay (e.g. missed days draw the eye). */
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="flex flex-col">
      <span
        className={`text-xl font-bold tabular-nums leading-none ${
          tone === 'warning' ? 'text-pursuit' : 'text-warm-900'
        }`}
      >
        {value}
      </span>
      <span className="mt-1 text-eyebrow uppercase tracking-wide text-warm-400">
        {label}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// One roster row
// -----------------------------------------------------------------------------

function RosterRow({
  item,
  expanded,
  pending,
  onToggleExpand,
  onAck,
  onOpenPlayer,
}: {
  item: CoachContractRosterItem;
  expanded: boolean;
  pending: boolean;
  onToggleExpand: () => void;
  onAck: (contractId: string, note: string, recognizeToTeam: boolean) => void;
  onOpenPlayer?: (playerId: string) => void;
}) {
  const [note, setNote] = useState('');
  // Gap 2: "recognize to team" is OFF by default and only legal on a team-shared
  // day. We reset it implicitly because the toggle is only RENDERED for that case.
  const [recognizeToTeam, setRecognizeToTeam] = useState(false);
  const day = item.today;
  const acked = !!day?.coachAcknowledgedAt;
  const completed = day?.status === 'completed';
  const missed = day?.status === 'missed';
  // The player chose to share team-wide → a coach MAY recognize publicly to the
  // team. A staff_only share offers no such affordance (absent, not disabled).
  const teamShared = day?.visibility === 'team';

  return (
    <div className="rounded-xl border border-warm-200 bg-cream-50 transition-colors">
      {/* Header row — name, share status, streak, expand */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-bold text-primary-700">
          {item.jerseyNumber != null ? item.jerseyNumber : <IconTarget size={15} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-warm-900">
              {playerName(item)}
            </p>
            {item.sharedStreak > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-primary-50 px-1.5 py-0.5 text-eyebrow font-semibold text-primary-700">
                <IconFlame size={10} />
                {item.sharedStreak}
              </span>
            )}
            {/* The player's chosen share level — closes the source→signal loop so
                the coach SEES why the team-recognition toggle is/isn't offered. */}
            {day && (
              <span
                className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-eyebrow font-semibold ${
                  teamShared
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-warm-100 text-warm-500'
                }`}
              >
                {teamShared ? <IconUsers size={10} /> : <IconShield size={10} />}
                {teamShared ? 'Team' : 'Coaches'}
              </span>
            )}
          </div>
          {day ? (
            <p
              className={`mt-0.5 flex items-center gap-1.5 text-eyebrow ${
                missed ? 'text-pursuit' : 'text-warm-500'
              }`}
            >
              {completed ? (
                <IconCheckCircle2 size={12} className="text-primary-600" />
              ) : missed ? (
                <IconAlertCircle size={12} className="text-pursuit" />
              ) : (
                <IconClock size={12} className="text-warm-400" />
              )}
              {completed ? 'Completed' : missed ? 'Missed' : 'In progress'} ·{' '}
              {day.honoredCount}/{day.totalCount} honored
            </p>
          ) : (
            <p className="mt-0.5 text-eyebrow text-warm-400">Nothing shared today</p>
          )}
        </div>

        {acked && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-eyebrow font-semibold text-primary-700">
            <IconHeart size={10} />
            Acked
          </span>
        )}

        {day && (
          // Compact expand control — disclosure chevron, not a CTA.
          // eslint-disable-next-line helm/no-raw-button
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="shrink-0 rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300"
          >
            <IconChevronDown
              size={16}
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Drill-in */}
      {expanded && day && (
        <div className="space-y-3 border-t border-warm-200 px-3.5 py-3">
          <div className="space-y-1.5">
            {day.items.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                    it.done
                      ? 'bg-primary-500 text-white'
                      : it.skipped
                        ? 'bg-warm-100 text-warm-400'
                        : 'bg-warm-100 text-warm-400'
                  }`}
                >
                  {it.done ? <IconCheck size={12} /> : <IconClock size={11} />}
                </span>
                <span
                  className={`truncate text-sm ${
                    it.skipped ? 'text-warm-400 line-through' : 'text-warm-700'
                  }`}
                >
                  {it.label}
                </span>
                <span className="ml-auto shrink-0 text-eyebrow uppercase tracking-wide text-warm-400">
                  {it.category}
                </span>
              </div>
            ))}
          </div>

          {/* Ack affordance — the one prominent action */}
          {!acked ? (
            <div className="space-y-2 rounded-lg border border-warm-200 bg-warm-50 p-2.5">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="Optional note back to the player…"
                aria-label="Acknowledgement note"
                className="w-full resize-none text-sm"
              />

              {/* Gap 2: "Recognize to team" — present ONLY on a team-shared day, so
                  a coach is never tempted by a control that would silently do
                  nothing. Default OFF; widening to the team feed is a deliberate
                  choice on a day the player already shared team-wide. */}
              {teamShared && (
                // Compact toggle pill — same segmented idiom as the player share
                // control, not a standard CTA button.
                // eslint-disable-next-line helm/no-raw-button
                <button
                  type="button"
                  role="switch"
                  aria-checked={recognizeToTeam}
                  disabled={pending}
                  onClick={() => setRecognizeToTeam((v) => !v)}
                  className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors active:scale-[0.99] disabled:opacity-60 ${
                    recognizeToTeam
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-warm-200 bg-cream-50 hover:border-primary-300'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      recognizeToTeam
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-warm-300 bg-cream-50 text-transparent'
                    }`}
                  >
                    <IconCheck size={12} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-sm font-semibold text-warm-800">
                      <IconUsers size={13} className="text-primary-600" />
                      Post recognition to the team feed
                    </span>
                    <span className="mt-0.5 block text-eyebrow leading-snug text-warm-500">
                      The whole team will see your shout-out.
                    </span>
                  </span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => onAck(day.id, note, teamShared && recognizeToTeam)}
                  leftIcon={<IconHeart size={14} />}
                >
                  {pending ? 'Sending…' : 'Acknowledge'}
                </Button>
                {onOpenPlayer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenPlayer(item.playerId)}
                  >
                    Profile
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-eyebrow font-medium text-primary-700">
                <IconCheckCircle2 size={13} />
                Acknowledged — the player was notified.
              </span>
              {onOpenPlayer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenPlayer(item.playerId)}
                >
                  Profile
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function CoachDailyContracts({ model, onOpenPlayer }: CoachDailyContractsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(model.error);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Local mirror of ack timestamps so an ack reflects instantly.
  const [ackedAt, setAckedAt] = useState<Record<string, string>>({});

  const roster = model.roster.map((r) => {
    const localAck = r.today ? ackedAt[r.today.id] : undefined;
    return r.today && localAck
      ? { ...r, today: { ...r.today, coachAcknowledgedAt: localAck } }
      : r;
  });

  const handleAck = useCallback(
    (contractId: string, note: string, recognizeToTeam: boolean) => {
      setError(null);
      startTransition(async () => {
        try {
          const res = await acknowledgeDailyContract({
            contractId,
            note,
            recognizeToTeam,
          });
          if (!res.success) {
            setError(res.error ?? 'Could not acknowledge. Please try again.');
            return;
          }
          setAckedAt((prev) => ({ ...prev, [contractId]: new Date().toISOString() }));
        } catch {
          setError('Could not acknowledge. Please try again.');
        }
      });
    },
    [],
  );

  // ---- Unauthorized: render nothing (a non-staff viewer never sees this). ----
  if (!model.authorized) return null;

  const sharedItems = roster.filter((r) => r.shared);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <IconTarget size={16} />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-warm-900">
            Daily Contracts
          </h2>
          <p className="text-eyebrow text-warm-400">
            Shared commitments from your roster today
          </p>
        </div>
      </div>

      <Card variant="raised" padding="md">
        {/* Summary band — 3-col on mobile (shared/completed/missed), all 5 on sm+ */}
        <div className="mb-4 grid grid-cols-3 gap-3 border-b border-warm-200 pb-4 sm:grid-cols-5">
          <SummaryStat label="Shared" value={model.summary.sharedToday} />
          <SummaryStat label="Completed" value={model.summary.completedToday} />
          <SummaryStat
            label="Missed"
            value={model.summary.missedToday}
            tone={model.summary.missedToday > 0 ? 'warning' : 'default'}
          />
          {/* Awaiting + Roster shown on sm+ only to avoid cramped 5-col layout on 375px */}
          <SummaryStat label="Awaiting" value={model.summary.awaitingAck} />
          <SummaryStat label="Roster" value={model.summary.rosterSize} />
        </div>

        {error && <InkNotice className="mb-3">{error}</InkNotice>}

        {sharedItems.length === 0 ? (
          <EmptyState
            variant="minimal"
            icon={<IconTarget size={36} />}
            title="No shared contracts yet"
            description="When a player shares their daily contract with coaches, their committed intentions and progress show up here for you to recognize."
          />
        ) : (
          <div className="space-y-2">
            {sharedItems.map((item) => (
              <RosterRow
                key={item.playerId}
                item={item}
                expanded={!!item.today && expandedId === item.today.id}
                pending={isPending}
                onToggleExpand={() =>
                  item.today &&
                  setExpandedId((prev) =>
                    prev === item.today!.id ? null : item.today!.id,
                  )
                }
                onAck={handleAck}
                onOpenPlayer={onOpenPlayer}
              />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
