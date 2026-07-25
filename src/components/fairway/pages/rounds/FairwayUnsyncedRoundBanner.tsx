'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayUnsyncedRoundBanner — the never-synced recovery strip
 * ----------------------------------------------------------------------------
 * Closes the discoverability gap behind the 2026-06-10 round-loss incident.
 *
 * The shot-tracking screens always write a SYNCHRONOUS localStorage
 * emergencySave under the `_new` key. When a player's server saves never landed
 * (hard-offline session) and they were then booted, that localStorage copy was
 * the ONLY surviving record — but nothing surfaced it. The server-driven
 * FairwayUnfinishedBanner only knows about rounds that reached the database, so
 * a never-synced round was invisible and felt lost.
 *
 * This banner reads that `_new` emergencySave on the /rounds page and offers an
 * honest "Resume" breadcrumb back to /new, where the existing recovery dialog
 * restores the holes into the tracking view so the player keeps playing.
 *
 * DEDUP / HONESTY:
 *   • Suppresses itself entirely when the player already has a SERVER in-progress
 *     round (`hasServerInProgress`) — FairwayUnfinishedBanner owns resume there,
 *     and the durable sendBeacon save now reliably feeds it.
 *   • Only renders when the save holds REAL recoverable data (a completed hole or
 *     in-progress shots) — never a fabricated entry.
 *   • Discard is two-step-confirmed; it clears only the `_new` localStorage key
 *     (the device's own copy), never a server round.
 *
 * ADDITIVE + GATED — rendered only inside FairwayRoundsLibrary (redesign fork),
 * player-only. Mirrors FairwayUnfinishedBanner's tokens/controls 1:1.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play, CloudOff } from 'lucide-react';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Button } from '@/components/fairway/controls/button';
import {
  loadEmergencySave,
  clearEmergencySave,
  type EmergencySaveData,
} from '@/lib/utils/emergency-save';

export interface FairwayUnsyncedRoundBannerProps {
  /**
   * True when the player already has a server-side in-progress round. The
   * server-driven FairwayUnfinishedBanner owns resume in that case, so this
   * localStorage breadcrumb suppresses itself to avoid a duplicate entry.
   */
  hasServerInProgress: boolean;
}

/** A `_new` emergencySave is worth surfacing only if it holds real progress. */
export function hasRecoverableData(d: EmergencySaveData | null): d is EmergencySaveData {
  if (!d) return false;
  const completed = d.completedHoleStats?.some((h) => h != null) ?? false;
  const inProgress = Object.values(d.inProgressShotsByHole || {}).some(
    (shots) => (shots?.length ?? 0) > 0
  );
  return completed || inProgress;
}

export function FairwayUnsyncedRoundBanner({ hasServerInProgress }: FairwayUnsyncedRoundBannerProps) {
  const router = useRouter();
  const [data, setData] = React.useState<EmergencySaveData | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    // The server banner owns resume when a DB round exists — don't double-surface.
    if (hasServerInProgress) return;
    const found = loadEmergencySave(null); // the `_new` (never-synced) key
    if (hasRecoverableData(found)) setData(found);
  }, [hasServerInProgress]);

  if (hasServerInProgress || dismissed || !data) return null;

  const completedCount = data.completedHoleStats?.filter((h) => h != null).length ?? 0;
  const courseName = data.setupData?.courseName?.trim() || 'Unsaved round';

  const handleDiscard = () => {
    clearEmergencySave(null);
    setDismissed(true);
  };

  return (
    <section aria-label="Unsynced round recovery" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
          Saved on this device
        </h2>
      </div>

      <Surface padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: status + readout */}
          <div className="flex min-w-0 items-center gap-4">
            <Inset
              padding="none"
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center"
            >
              <CloudOff className="h-5 w-5 text-fw-warning-ink" aria-hidden="true" />
            </Inset>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusPill tone="warning" size="sm">
                  Not yet synced
                </StatusPill>
              </div>
              <p className="mt-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                {courseName}
              </p>
              <p className="truncate font-fw-sans text-caption text-text-tertiary">
                {completedCount > 0
                  ? `${completedCount} ${completedCount === 1 ? 'hole' : 'holes'} saved on this device — resume to keep playing`
                  : 'In progress on this device — resume to keep playing'}
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-shrink-0 items-center gap-2 sm:flex-col-reverse sm:items-stretch sm:gap-2 md:flex-row">
            {confirming ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={handleDiscard}>
                  Confirm discard
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push('/golf/dashboard/rounds/new')}
                  leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                >
                  Resume
                </Button>
              </>
            )}
          </div>
        </div>
      </Surface>
    </section>
  );
}
