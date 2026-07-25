'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifyingWorkspace  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the COACH /golf/dashboard/coachhelm/qualifying/[id]
 * route — the W29 selection workspace ("who's going to the tournament"). The
 * /qualifiers/[id] page still owns scoring + the live leaderboard; this owns the
 * top-score auto-lock + coach-pick reasoning + the confirm flip.
 *
 * PRESENTATION REBUILD ONLY. Every mutation reuses the existing v3 actions
 * VERBATIM (same import path, same args):
 *   advanceSelectionState · confirmQualifierSelection ·
 *   setQualifierCoachPick · removeQualifierCoachPick
 * and the state-machine helper `nextState`. Data comes from
 * loadQualifyingWorkspace (server) as a QualifyingWorkspace, unchanged.
 *
 * The slot vocabulary matches the player-facing leaderboard cut lines:
 *   • top-score slots (total − coachPick) → "Locked" (accent, earned on merit)
 *   • coach's discretionary picks          → "Coach pick" (warning/amber)
 *
 * HONESTY: a candidate with no scoring round shows an em-dash rank/to-par and is
 * never auto-locked. Coach-pick controls only unlock at the `closed` state.
 *
 * Tokens / primitives ONLY. No glass / warm-* / blur.
 * ========================================================================== */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Flag } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  Button,
  StatusPill,
  EmptyState,
  TextArea,
  fairwayToast,
} from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway/controls';
import {
  advanceSelectionState,
  confirmQualifierSelection,
  setQualifierCoachPick,
  removeQualifierCoachPick,
} from '@/app/golf/actions/v3/qualifying';
// updateQualifierStatus is fully built (auth+coach-of-team check, DB write,
// revalidate) but had ZERO callers anywhere in the app — a qualifier could
// never reach status='completed' through any reachable flow. This is the
// first real caller.
import { updateQualifierStatus } from '@/app/golf/actions/golf';
import { nextState } from '@/lib/coachhelm/v3/qualifying/state-machine';
import type {
  QualifierSelectionState,
  QualifyingWorkspace,
  SelectionCandidate,
} from '@/lib/coachhelm/v3/qualifying/types';

export interface FairwayQualifyingWorkspaceProps {
  workspace: QualifyingWorkspace;
}

const STATE_META: Record<QualifierSelectionState, { tone: FwStatusTone; label: string; pulse: boolean }> = {
  open: { tone: 'neutral', label: 'Open · accepting entries', pulse: false },
  scoring: { tone: 'accent', label: 'Scoring · rounds in progress', pulse: true },
  closed: { tone: 'warning', label: 'Closed · ready to select', pulse: false },
  selected: { tone: 'success', label: 'Selected · roster committed', pulse: false },
};

function formatToPar(p: number | null): string {
  if (p === null) return '—';
  if (p === 0) return 'E';
  return p > 0 ? `+${p}` : String(p);
}

export function FairwayQualifyingWorkspace({ workspace }: FairwayQualifyingWorkspaceProps) {
  const {
    qualifier_id,
    name,
    status,
    selection_state,
    selection_slots_total,
    selection_slots_coach_pick,
    candidates,
    coach_picks_complete,
  } = workspace;

  const topScoreSlots = selection_slots_total - selection_slots_coach_pick;
  const pickLabel = selection_slots_coach_pick === 1 ? 'pick' : 'picks';

  const ranked = useMemo(
    () =>
      [...candidates].sort((a, b) => {
        if (a.leaderboard_rank === null && b.leaderboard_rank === null) return 0;
        if (a.leaderboard_rank === null) return 1;
        if (b.leaderboard_rank === null) return -1;
        return a.leaderboard_rank - b.leaderboard_rank;
      }),
    [candidates],
  );

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Coach · Selection"
        title={name}
        description={`${selection_slots_total} spots · ${topScoreSlots} top score · ${selection_slots_coach_pick} coach ${pickLabel}.`}
        meta={
          <Link
            href={`/golf/dashboard/qualifiers/${qualifier_id}`}
            className="font-fw-sans text-body-sm text-text-secondary underline-offset-2 hover:text-accent-700 hover:underline"
          >
            ← Back to qualifier
          </Link>
        }
      />

      <div className="mt-8 flex flex-col gap-6">
        <StateBar
          qualifierId={qualifier_id}
          state={selection_state}
          canConfirm={coach_picks_complete}
        />

        <SlotLeaderboard ranked={ranked} topScoreSlots={topScoreSlots} />

        {selection_slots_coach_pick > 0 ? (
          <CoachPicks
            qualifierId={qualifier_id}
            candidates={ranked}
            slotsCoachPick={selection_slots_coach_pick}
            state={selection_state}
          />
        ) : null}

        {/* Roster committed — the qualifier's play lifecycle (status) is a
            SEPARATE state machine from selection_state above, and nothing
            anywhere ever advanced it to 'completed'. Give the coach a real
            control for it right where the roster decision just got made. */}
        {selection_state === 'selected' ? (
          <ConcludeQualifier qualifierId={qualifier_id} status={status} />
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * 4 · Conclude qualifier — the missing caller for updateQualifierStatus.
 * Only reachable once the roster is committed (selection_state === 'selected').
 * A best-effort auto-transition also runs from the round-submit path once
 * every entrant has posted every round (see advanceQualifierOnRoundSubmit in
 * golf.ts) — this button is the manual override for a coach who doesn't want
 * to wait for stragglers, or who never lets that auto-transition fire.
 * ────────────────────────────────────────────────────────────────────────── */
function ConcludeQualifier({ qualifierId, status }: { qualifierId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status === 'completed') {
    return (
      <Surface elevation="border" padding="md">
        <div className="flex items-center gap-3">
          <StatusPill tone="neutral" size="md">
            Completed
          </StatusPill>
          <p className="font-fw-sans text-body-sm text-text-secondary">
            This qualifier is closed out — it now shows under Concluded on the qualifiers list.
          </p>
        </div>
      </Surface>
    );
  }

  const handleConclude = () => {
    startTransition(async () => {
      const r = await updateQualifierStatus(qualifierId, 'completed');
      if (!r.success) {
        fairwayToast.danger("Couldn't conclude the qualifier", { description: r.error });
      } else {
        fairwayToast.success('Qualifier concluded');
        router.refresh();
      }
    });
  };

  return (
    <Surface elevation="border" padding="md">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-fw-sans text-body font-medium text-text-primary">
            Roster committed — ready to close this out?
          </p>
          <p className="font-fw-sans text-caption text-text-tertiary">
            Marks the qualifier Completed so it moves to Concluded for the whole team.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleConclude}
          busy={pending}
          className="shrink-0"
        >
          Conclude qualifier
        </Button>
      </div>
    </Surface>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * 1 · Selection state bar — current state + advance / confirm
 * ────────────────────────────────────────────────────────────────────────── */
function StateBar({
  qualifierId,
  state,
  canConfirm,
}: {
  qualifierId: string;
  state: QualifierSelectionState;
  canConfirm: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const next = nextState(state);
  const meta = STATE_META[state];

  const handleAdvance = () => {
    if (!next) return;
    startTransition(async () => {
      const r = await advanceSelectionState(qualifierId, next);
      if (!r.ok) fairwayToast.danger("Couldn't advance state", { description: r.error });
      else fairwayToast.success(`Advanced to ${next}`);
    });
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const r = await confirmQualifierSelection(qualifierId);
      if (!r.ok) fairwayToast.danger("Couldn't confirm selection", { description: r.error });
      else fairwayToast.success('Selection confirmed — roster committed');
    });
  };

  return (
    <Surface elevation="border" padding="md">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <StatusPill tone={meta.tone} pulse={meta.pulse} size="md" className="self-start">
          {meta.label}
        </StatusPill>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          {next && next !== 'selected' ? (
            <Button variant="secondary" size="sm" onClick={handleAdvance} busy={pending}>
              Advance to {next}
            </Button>
          ) : null}
          {state === 'closed' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              busy={pending}
              disabled={!canConfirm}
              title={!canConfirm ? 'Choose all coach picks (with reasoning) before confirming' : undefined}
            >
              Confirm selection
            </Button>
          ) : null}
        </div>
      </div>
      {state === 'closed' && !canConfirm ? (
        <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
          Choose every coach&rsquo;s-pick spot (with reasoning) to unlock confirmation.
        </p>
      ) : null}
    </Surface>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * 2 · Leaderboard with auto-lock indicators
 * ────────────────────────────────────────────────────────────────────────── */
function SlotLeaderboard({
  ranked,
  topScoreSlots,
}: {
  ranked: SelectionCandidate[];
  topScoreSlots: number;
}) {
  return (
    <Surface aria-label="Selection leaderboard">
      <Surface.Header
        title="Leaderboard"
        actions={
          <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Top {topScoreSlots} auto-lock
          </span>
        }
      />
      <Surface.Body>
        {ranked.length === 0 ? (
          <EmptyState
            variant="subtle"
            icon={Flag}
            title="No entries yet"
            description="Candidates appear here as players are entered and post rounds."
          />
        ) : (
          // The fixed rank/rounds/score/status columns (~244px + gaps) leave too
          // little room for the player name on a ~320px phone, so the row gets a
          // min-width and the list scrolls horizontally (matching the detail-page
          // tables) instead of squeezing/wrapping the name.
          <div className="-mx-1 overflow-x-auto px-1">
          <ul className="flex min-w-[460px] flex-col">
            {ranked.map((c) => {
              const locked = c.is_top_score_slot;
              const picked = c.selection?.selection_type === 'coach_pick';
              return (
                <li
                  key={c.player_id}
                  className={cn(
                    'flex items-center gap-4 border-b border-border-subtle py-3 last:border-b-0',
                    locked && 'bg-accent-50/50',
                  )}
                >
                  <span
                    className={cn(
                      'w-7 font-fw-mono text-body-sm tabular-nums',
                      locked ? 'font-medium text-accent-700' : 'text-text-tertiary',
                    )}
                  >
                    {c.leaderboard_rank ?? '—'}
                  </span>
                  <Link
                    href={`/golf/dashboard/stats?player=${c.player_id}`}
                    className="flex-1 truncate rounded-fw-sm font-fw-sans text-body font-medium text-text-primary underline-offset-2 outline-none hover:text-accent-700 hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {c.player_first_name} {c.player_last_name}
                  </Link>
                  <span className="w-12 text-right font-fw-mono text-body-sm tabular-nums text-text-tertiary">
                    {c.rounds_completed}r
                  </span>
                  <span className="w-14 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                    {formatToPar(c.total_to_par)}
                  </span>
                  <span className="w-28 text-right">
                    {locked ? (
                      <StatusPill tone="accent" size="sm" dot>
                        Locked
                      </StatusPill>
                    ) : picked ? (
                      <StatusPill tone="warning" size="sm" dot>
                        Coach pick
                      </StatusPill>
                    ) : (
                      <span className="font-fw-sans text-body-sm text-text-tertiary">—</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </Surface.Body>
    </Surface>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * 3 · Coach-pick panel — discretionary spots + reasoning
 * ────────────────────────────────────────────────────────────────────────── */
function CoachPicks({
  qualifierId,
  candidates,
  slotsCoachPick,
  state,
}: {
  qualifierId: string;
  candidates: SelectionCandidate[];
  slotsCoachPick: number;
  state: QualifierSelectionState;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingPlayer, setPendingPlayer] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const editable = state === 'closed' || state === 'selected';
  const eligible = candidates.filter((c) => !c.is_top_score_slot);
  const picksMade = eligible.filter((c) => c.selection?.selection_type === 'coach_pick');
  const remaining = slotsCoachPick - picksMade.length;

  const startEdit = (c: SelectionCandidate) =>
    setDrafts((d) => ({ ...d, [c.player_id]: c.selection?.coach_reasoning ?? '' }));
  const cancelEdit = (playerId: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[playerId];
      return next;
    });

  const handleSave = (playerId: string) => {
    const reasoning = (drafts[playerId] ?? '').trim();
    if (reasoning.length === 0) return;
    setPendingPlayer(playerId);
    startTransition(async () => {
      const r = await setQualifierCoachPick(qualifierId, playerId, reasoning);
      if (!r.ok) fairwayToast.danger("Couldn't save pick", { description: r.error });
      else {
        fairwayToast.success('Coach pick saved');
        cancelEdit(playerId);
      }
      setPendingPlayer(null);
    });
  };

  const handleRemove = (c: SelectionCandidate) => {
    const playerId = c.player_id;
    // Capture the prior reasoning BEFORE the mutation so an Undo can restore the
    // pick verbatim — Remove is a single-click destructive act, so we gate it
    // behind an undo affordance (Nielsen #3 user control + #5 error prevention).
    const priorReasoning = c.selection?.coach_reasoning ?? '';
    const playerName = `${c.player_first_name} ${c.player_last_name}`.trim();
    setPendingPlayer(playerId);
    startTransition(async () => {
      const r = await removeQualifierCoachPick(qualifierId, playerId);
      if (!r.ok) {
        fairwayToast.danger("Couldn't remove pick", { description: r.error });
      } else {
        fairwayToast.success('Coach pick removed', {
          description: priorReasoning
            ? `${playerName}'s reasoning was saved — undo to restore it.`
            : `${playerName} is no longer a coach pick.`,
          action: priorReasoning
            ? {
                label: 'Undo',
                onClick: () => {
                  startTransition(async () => {
                    const restore = await setQualifierCoachPick(
                      qualifierId,
                      playerId,
                      priorReasoning,
                    );
                    if (!restore.ok) {
                      fairwayToast.danger("Couldn't restore pick", { description: restore.error });
                    } else {
                      fairwayToast.success('Coach pick restored');
                    }
                  });
                },
              }
            : undefined,
        });
      }
      setPendingPlayer(null);
    });
  };

  return (
    <Surface aria-label="Coach picks">
      <Surface.Header
        title="Coach picks"
        actions={
          <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {picksMade.length} of {slotsCoachPick} chosen
            {remaining > 0 && editable ? ` · ${remaining} left` : ''}
          </span>
        }
      />
      <Surface.Body>
        {!editable ? (
          <p className="mb-1 font-fw-sans text-body-sm text-text-tertiary">
            Picks unlock when the qualifier reaches the{' '}
            <span className="font-medium text-text-secondary">closed</span> state.
          </p>
        ) : null}

        {eligible.length === 0 ? (
          <EmptyState
            variant="subtle"
            icon={Flag}
            title="Everyone's auto-locked"
            description="Every entry is auto-locked on merit — no discretionary picks needed."
          />
        ) : (
          // Same rationale as SlotLeaderboard above: the name column plus the
          // Edit/Remove (or Pick) button cluster don't fit a ~320px phone, and
          // this list has no scroll container of its own — so the tail of the
          // row (including the action buttons) was silently clipped by the
          // global mobile `overflow-x: clip` on html/body instead of merely
          // wrapping the page. Give it the same horizontal scroller.
          <div className="-mx-1 overflow-x-auto px-1">
          <ul className="flex min-w-[420px] flex-col">
            {eligible.map((c) => {
              const isPicked = c.selection?.selection_type === 'coach_pick';
              const isEditing = drafts[c.player_id] !== undefined;
              const isPending = pendingPlayer === c.player_id;
              const draftEmpty = (drafts[c.player_id] ?? '').trim().length === 0;
              return (
                <li key={c.player_id} className="border-b border-border-subtle py-3.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="w-7 font-fw-mono text-body-sm tabular-nums text-text-tertiary">
                      {c.leaderboard_rank ?? '—'}
                    </span>
                    <Link
                      href={`/golf/dashboard/stats?player=${c.player_id}`}
                      className="flex-1 truncate rounded-fw-sm font-fw-sans text-body font-medium text-text-primary underline-offset-2 outline-none hover:text-accent-700 hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {c.player_first_name} {c.player_last_name}
                    </Link>
                    <span className="w-14 text-right font-fw-mono text-body-sm tabular-nums text-text-secondary">
                      {formatToPar(c.total_to_par)}
                    </span>
                    {editable && !isEditing ? (
                      isPicked ? (
                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(c)}
                            busy={isPending}
                            className="text-fw-danger-ink hover:text-fw-danger-ink"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(c)}
                          disabled={remaining <= 0}
                        >
                          Pick
                        </Button>
                      )
                    ) : null}
                  </div>

                  {isPicked && !isEditing && c.selection?.coach_reasoning ? (
                    <p className="ml-11 mt-2 font-fw-sans text-body-sm italic text-text-secondary">
                      &ldquo;{c.selection.coach_reasoning}&rdquo;
                    </p>
                  ) : null}

                  {isEditing ? (
                    <div className="ml-11 mt-3 flex flex-col gap-2.5">
                      <TextArea
                        value={drafts[c.player_id] ?? ''}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [c.player_id]: e.target.value }))
                        }
                        rows={2}
                        placeholder="Why this player? (visible to coaching staff)"
                      />
                      <div className="flex gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSave(c.player_id)}
                          busy={isPending}
                          disabled={draftEmpty}
                        >
                          Save pick
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => cancelEdit(c.player_id)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </Surface.Body>
    </Surface>
  );
}

export default FairwayQualifyingWorkspace;
