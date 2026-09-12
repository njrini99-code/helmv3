'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayUnfinishedBanner — the in-progress resume group
 * ----------------------------------------------------------------------------
 * The PLAYER-ONLY "In progress" section that sits directly above the library
 * when there are unfinished rounds. A re-skin of the legacy
 * UnfinishedRoundsSection + UnfinishedRoundModal as ONE matte InsetGroup of
 * seam rows (player-rounds.mobile.md #1 — it used to be one bordered card
 * per round with two buttons each: five rounds meant ten buttons above the
 * page's own content):
 *
 *   • an HONEST hole-progress tile (current_hole / holes_played from real
 *     columns) — "Setup" when no hole has been started yet
 *   • the course name, then city · "9d ago"
 *   • ONE visible action per row: a primary "Continue" (→ /rounds/continue/[id]);
 *     "Discard round" lives in the row's overflow Menu and still runs the
 *     two-step confirm in place (Cancel · Confirm discard)
 *
 * Discard reuses the EXISTING non-destructive server action
 * `deleteInProgressRound` UNCHANGED (no delete-then-reinsert; the action owns
 * the safe delete + emergency-save clear).
 *
 * Coaches NEVER see this — the parent only renders it for `userRole === 'player'`
 * when `rounds.length > 0`.
 *
 * ADDITIVE + GATED — rendered only inside FairwayRoundsLibrary behind the
 * isRedesignEnabled() fork. Renders inside `.fairway-ds` on bg-canvas.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Play } from 'lucide-react';
import { InsetGroup } from '@/components/fairway/surfaces/inset-group';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Menu } from '@/components/fairway/overlays/Menu';
import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';

export interface FairwayUnfinishedBannerProps {
  rounds: RoundLibraryRound[];
  playerId: string;
}

/**
 * "9d ago" from a MOUNTED clock. `now` is null on the server and on the first
 * client render, so both paint the same markup (no relative time) and the
 * label appears after hydration — never a server/client text mismatch
 * (AUDIT.md Mobile, hydration hazards).
 */
function relativeTime(round: RoundLibraryRound, now: number | null): string {
  const ts = round.updated_at ?? round.created_at;
  if (!ts || now == null) return '';
  const diff = now - new Date(ts).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

/** The player-only "In progress" resume group. */
export function FairwayUnfinishedBanner({ rounds, playerId }: FairwayUnfinishedBannerProps) {
  const router = useRouter();
  const [localRounds, setLocalRounds] = React.useState(rounds);
  const [now, setNow] = React.useState<number | null>(null);

  // Keep local state in sync if the server passes a fresh list.
  React.useEffect(() => setLocalRounds(rounds), [rounds]);
  React.useEffect(() => setNow(Date.now()), []);

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

      <InsetGroup variant="matte">
        {localRounds.map((round) => (
          <UnfinishedRow
            key={round.id}
            round={round}
            playerId={playerId}
            timeAgo={relativeTime(round, now)}
            onDiscarded={() => {
              setLocalRounds((prev) => prev.filter((r) => r.id !== round.id));
              router.refresh();
            }}
          />
        ))}
      </InsetGroup>
    </section>
  );
}

function UnfinishedRow({
  round,
  playerId,
  timeAgo,
  onDiscarded,
}: {
  round: RoundLibraryRound;
  playerId: string;
  timeAgo: string;
  onDiscarded: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const holesTarget = round.holes_played ?? 18;
  const currentHole = round.current_hole ?? 0;
  const isSetup = !currentHole;
  const courseName = round.course_name ?? 'Unknown course';
  // A bare state code with no city ("Va") reads as a stray, unlabeled
  // fragment — only render a location when there's an actual city to anchor
  // it (course_state alone is dropped, not shown bare).
  const city = round.course_city
    ? [round.course_city, round.course_state].filter(Boolean).join(', ')
    : null;
  const meta = [city, timeAgo].filter(Boolean).join(' · ');

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
      clearEmergencySave(round.id, playerId);
      onDiscarded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard round');
      setDiscarding(false);
      setConfirming(false);
    }
  };

  return (
    <InsetGroup.Row
      align="center"
      trailing={
        confirming ? (
          <span className="inline-flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={discarding}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDiscard} busy={discarding}>
              {discarding ? 'Discarding' : 'Confirm discard'}
            </Button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleContinue}
              leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
            >
              Continue
            </Button>
            <Menu
              align="end"
              trigger={
                <IconButton variant="ghost" size="sm" aria-label={`More actions for ${courseName}`}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </IconButton>
              }
            >
              <Menu.Item destructive onSelect={() => setConfirming(true)}>
                Discard round
              </Menu.Item>
            </Menu>
          </span>
        )
      }
    >
      <span className="flex min-w-0 items-center gap-3">
        {/* Honest hole progress — real columns, "Setup" before the first hole. */}
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-fw-sm bg-surface-sunken"
        >
          {isSetup ? (
            <span className="font-fw-sans text-caption font-medium text-fw-warning-ink">Setup</span>
          ) : (
            <>
              <span className="font-fw-mono text-body-sm font-medium leading-none tabular-nums text-fw-warning-ink">
                {currentHole}
              </span>
              <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">/{holesTarget}</span>
            </>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {courseName}
            <span className="sr-only">
              {isSetup ? ', not started' : `, hole ${currentHole} of ${holesTarget}`}
            </span>
          </span>
          {meta ? (
            <span className="block truncate font-fw-sans text-caption text-text-tertiary">{meta}</span>
          ) : null}
          {error ? (
            <span className="block font-fw-sans text-caption text-fw-danger-ink" role="alert">
              {error}
            </span>
          ) : null}
        </span>
      </span>
    </InsetGroup.Row>
  );
}
