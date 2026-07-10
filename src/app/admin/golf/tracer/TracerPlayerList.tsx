'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Sheet, StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { LocalTime } from '../../_components/LocalTime';
import { PanelNoData } from '../../_components/PanelStates';
import { TracerRoundDiagnostic } from './TracerRoundDiagnostic';
import { ROUND_STATUS_TONE } from './tracer-shared';
import type { TracerPlayerSummary, TracerRoundDetail } from '@/app/golf/actions/admin-tracer-data';

function playerName(p: { first_name: string | null; last_name: string | null }): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown player';
}

/**
 * The player list was a dead end — the page's own banner admitted the
 * drill-down/fix flow "is not wired here yet." Clicking a row now opens a
 * Sheet listing that player's rounds (already fetched server-side as part
 * of `bridgeGetTracerData`, no extra round-trip); expanding a round lazily
 * loads `TracerRoundDiagnostic` (holes/shots/errors + fix actions).
 */
export function TracerPlayerList({
  players,
  roundDetails,
  truncated,
}: {
  players: readonly TracerPlayerSummary[];
  roundDetails: Record<string, TracerRoundDetail[]>;
  truncated: boolean;
}) {
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);

  if (players.length === 0) {
    return <PanelNoData label="No player round activity yet" description="Player rows appear once a round is logged." />;
  }

  const openPlayer = players.find((p) => p.player_id === openPlayerId) ?? null;
  // This list's own render cap — independent of `truncated` (which only
  // reflects the SERVER's bounded-query row ceiling). A team with >100
  // players but an uncapped server query would otherwise lose every row
  // past #100 with zero indication in the footer below.
  const visiblePlayers = players.slice(0, 100);
  const clientCapped = players.length > visiblePlayers.length;

  return (
    <>
      <p className="mt-1 text-xs text-warm-500">Click a player to inspect their rounds and run data-quality fixes.</p>
      <ul className="mt-2 divide-y divide-warm-200/60">
        {visiblePlayers.map((p, i) => (
          <li key={p.player_id}>
            {/* Fairway <Button variant="ghost">, not a raw <button> (helm/no-raw-button)
                — display overridden to block + all row content wrapped in ONE owned
                span so Button's internal `<span>{children}</span>` stays a transparent
                pass-through, same technique as FairwayDayStrip's GOTCHA (a). */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpenPlayerId(p.player_id)}
              className={cn(
                'block h-auto w-full rounded-lg border-0 px-2 py-2 text-left text-sm font-normal leading-5',
                i === 0 ? 'bg-accent-50/60' : undefined,
              )}
            >
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  {i === 0 && <span aria-hidden className="mb-1 block h-[2px] w-7 rounded-full bg-accent-500" />}
                  <span className="block truncate text-warm-900">{playerName(p)}</span>
                </span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {p.completed_rounds}/{p.total_rounds} completed
                </span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  {p.in_progress_rounds} in-progress · {p.draft_rounds} draft
                </span>
                <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                  {p.last_activity ? <LocalTime iso={p.last_activity} variant="datetime" /> : 'never'}
                </span>
                <ChevronRight size={14} className="shrink-0 text-warm-300" aria-hidden />
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {truncated || clientCapped ? (
        <p className="mt-2 text-xs text-warm-500">
          {truncated
            ? 'Showing latest data — the bounded query hit its row cap.'
            : `Showing the first ${visiblePlayers.length} of ${players.length} players.`}
        </p>
      ) : null}

      <Sheet
        open={openPlayerId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenPlayerId(null);
        }}
        side="right"
        title={openPlayer ? playerName(openPlayer) : 'Player rounds'}
        description="Select a round to inspect its data-quality checks and run a fix."
      >
        <Sheet.Body>
          {openPlayer ? (
            <PlayerRoundsList playerId={openPlayer.player_id} rounds={roundDetails[openPlayer.player_id] ?? []} />
          ) : null}
        </Sheet.Body>
      </Sheet>
    </>
  );
}

function PlayerRoundsList({ playerId, rounds }: { playerId: string; rounds: TracerRoundDetail[] }) {
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const sorted = [...rounds].sort((a, b) => (b.round_date ?? '').localeCompare(a.round_date ?? ''));

  if (sorted.length === 0) {
    return <PanelNoData label="No rounds recorded" description="This player has no rounds captured in the bounded query yet." />;
  }

  return (
    <ul className="space-y-2">
      {sorted.map((round) => {
        const isExpanded = expandedRoundId === round.round_id;
        return (
          <li key={round.round_id} className="rounded-xl bg-surface-sunken">
            {/* Fairway <Button variant="ghost">, not a raw <button> (helm/no-raw-button)
                — see the identical comment on the player row above for why the row
                content is wrapped in one owned span. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExpandedRoundId(isExpanded ? null : round.round_id)}
              aria-expanded={isExpanded}
              className="block h-auto w-full rounded-xl border-0 px-3 py-2.5 text-left text-sm font-normal leading-5"
            >
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* basis-full below `sm` — same identity-gets-its-own-line
                    treatment as the player row above and TracerIncidentRow's
                    title: at the Sheet's ~342px phone width the status pill +
                    issue count + date already eat the row, so without this a
                    long course name was squeezed to a near-illegible sliver
                    instead of wrapping the meta below it (mobile audit). */}
                <span className="min-w-0 flex-1 basis-full truncate font-medium text-warm-900 sm:basis-auto">
                  {round.course_name || 'Unknown course'}
                </span>
                <StatusPill tone={ROUND_STATUS_TONE[round.status] ?? 'neutral'} dot size="sm">
                  {round.status}
                </StatusPill>
                {round.errors.length > 0 ? (
                  <span className="font-fw-mono text-xs tabular-nums text-fw-danger">
                    {round.errors.length} issue{round.errors.length === 1 ? '' : 's'}
                  </span>
                ) : null}
                <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                  {round.round_date ? <LocalTime iso={round.round_date} variant="datetime" /> : 'no date'}
                </span>
                <ChevronDown
                  size={14}
                  className={cn('ml-auto shrink-0 text-warm-400 transition-transform', isExpanded && 'rotate-180')}
                  aria-hidden
                />
              </span>
            </Button>
            {isExpanded ? (
              <div className="border-t border-warm-200/60 p-3">
                <TracerRoundDiagnostic roundId={round.round_id} playerId={playerId} roundStatus={round.status} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
