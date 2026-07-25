'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayUnfinishedBanner — the in-progress resume strip
 * ----------------------------------------------------------------------------
 * The PLAYER-ONLY "In progress" section that sits directly above the library
 * when there are unfinished rounds. A re-skin of the legacy
 * UnfinishedRoundsSection + UnfinishedRoundModal, collapsed into one calm
 * Fairway Surface banner per round:
 *
 *   • a warning-tone StatusPill "In progress"
 *   • an HONEST hole-progress readout (current_hole / holes_played from real
 *     columns) — "Setup" when no hole has been started yet
 *   • the course name + city
 *   • a PRIMARY "Continue" CTA (→ /rounds/continue/[id]) and a QUIET "Discard"
 *
 * Discard reuses the EXISTING non-destructive server action
 * `deleteInProgressRound` UNCHANGED (no delete-then-reinsert; the action owns
 * the safe delete + emergency-save clear). A two-step confirm guards it.
 *
 * Coaches NEVER see this — the parent only renders it for `userRole === 'player'`
 * when `rounds.length > 0`.
 *
 * ADDITIVE + GATED — rendered only inside FairwayRoundsLibrary behind the
 * isRedesignEnabled() fork. Renders inside `.fairway-ds` on bg-canvas.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Button } from '@/components/fairway/controls/button';
import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';

export interface FairwayUnfinishedBannerProps {
  rounds: RoundLibraryRound[];
}

function relativeTime(round: RoundLibraryRound): string {
  const ts = round.updated_at ?? round.created_at;
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

/** The player-only "In progress" resume strip. */
export function FairwayUnfinishedBanner({ rounds }: FairwayUnfinishedBannerProps) {
  const router = useRouter();
  const [localRounds, setLocalRounds] = React.useState(rounds);

  // Keep local state in sync if the server passes a fresh list.
  React.useEffect(() => setLocalRounds(rounds), [rounds]);

  if (localRounds.length === 0) return null;

  return (
    <section aria-label="Rounds in progress" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
          In progress
        </h2>
        <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
          {localRounds.length}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {localRounds.map((round) => (
          <UnfinishedRow
            key={round.id}
            round={round}
            onDiscarded={() => {
              setLocalRounds((prev) => prev.filter((r) => r.id !== round.id));
              router.refresh();
            }}
          />
        ))}
      </div>
    </section>
  );
}

function UnfinishedRow({
  round,
  onDiscarded,
}: {
  round: RoundLibraryRound;
  onDiscarded: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const holesTarget = round.holes_played ?? 18;
  const currentHole = round.current_hole ?? 0;
  const isSetup = !currentHole;
  // A bare state code with no city ("Va") reads as a stray, unlabeled
  // fragment — only render a location when there's an actual city to anchor
  // it (course_state alone is dropped, not shown bare).
  const city = round.course_city
    ? [round.course_city, round.course_state].filter(Boolean).join(', ')
    : null;
  const timeAgo = relativeTime(round);

  const handleContinue = () => {
    router.push(`/golf/dashboard/rounds/continue/${round.id}`);
  };

  // Discard reuses the EXISTING non-destructive server action UNCHANGED.
  const handleConfirmDiscard = async () => {
    try {
      setDiscarding(true);
      setError(null);
      const result = await deleteInProgressRound(round.id);
      if (!result.success) throw new Error(result.error);
      clearEmergencySave(round.id);
      onDiscarded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard round');
      setDiscarding(false);
      setConfirming(false);
    }
  };

  return (
    <Surface
      padding="none"
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: status + progress readout + course */}
        <div className="flex min-w-0 items-center gap-4">
          <Inset
            padding="none"
            className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5"
          >
            {isSetup ? (
              <span className="font-fw-sans text-caption font-medium text-fw-warning-ink">Setup</span>
            ) : (
              <>
                <span className="font-fw-mono text-h3 font-medium leading-none tabular-nums text-fw-warning-ink">
                  {currentHole}
                </span>
                <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
                  / {holesTarget}
                </span>
              </>
            )}
          </Inset>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusPill tone="warning" size="sm">
                In progress
              </StatusPill>
              {timeAgo && (
                <span className="font-fw-sans text-eyebrow text-text-tertiary">{timeAgo}</span>
              )}
            </div>
            <p className="mt-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {round.course_name ?? 'Unknown course'}
            </p>
            {city && (
              <p className="truncate font-fw-sans text-caption text-text-tertiary">{city}</p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:flex-col-reverse sm:items-stretch sm:gap-2 md:flex-row">
          {confirming ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={discarding}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDiscard}
                busy={discarding}
              >
                {discarding ? 'Discarding' : 'Confirm discard'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleContinue}
                leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
              >
                Continue
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="px-4 pb-3 font-fw-sans text-caption text-fw-danger-ink" role="alert">
          {error}
        </p>
      )}
    </Surface>
  );
}
