'use client';

// REDESIGN-SCRATCH (docs/redesign/rounds): Direction A, season scorecard.
//
// Unfinished rounds collapse into ONE line ("11 unfinished · newest 10d ago") with
// Continue and Discard on the newest; the rest sit behind a disclosure. It reuses the
// library's behaviour exactly: the continue route, the `deleteInProgressRound` server
// action, `clearEmergencySave`, the two-step Cancel / Confirm discard, the `role="alert"`
// error line and `router.refresh()`. The header owns the one primary action on the
// screen, so Continue is a secondary button here.
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Play, Send } from 'lucide-react';

import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Surface } from '@/components/fairway/surfaces/surface';
import { cleanCourseName } from '@/lib/golf/course-name';
import { clearEmergencySave } from '@/lib/utils/emergency-save';

import type { RoundLibraryRound } from '../FairwayRoundsLibrary';

// ── Helpers ─────────────────────────────────────────────────────────────────

function savedAt(round: RoundLibraryRound): number {
  const ts = round.updated_at ?? round.created_at;
  const t = ts ? new Date(ts).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/** "10d ago" / "3h ago" / "just now". Empty when the round has no timestamp. */
function ageLabel(round: RoundLibraryRound, now: number): string {
  const ts = round.updated_at ?? round.created_at;
  if (!ts) return '';
  const diff = now - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return '';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

function progressLabel(round: RoundLibraryRound): string {
  const target = round.holes_played ?? 18;
  const current = round.current_hole ?? 0;
  return current > 0 ? `Hole ${current} of ${target}` : 'Setup';
}

function courseOf(round: RoundLibraryRound): string {
  return cleanCourseName(round.course_name) || 'Unknown course';
}

// ── Discard (same flow as the library's banner) ─────────────────────────────

interface DiscardState {
  confirming: boolean;
  setConfirming: (value: boolean) => void;
  discarding: boolean;
  error: string | null;
  confirmDiscard: () => Promise<void>;
}

function useDiscard(round: RoundLibraryRound, playerId: string, onDiscarded: () => void): DiscardState {
  const [confirming, setConfirming] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirmDiscard = async () => {
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

  return { confirming, setConfirming, discarding, error, confirmDiscard };
}

function RoundActions({ round, discard }: { round: RoundLibraryRound; discard: DiscardState }) {
  const ready = Boolean(round.hasPendingSubmission);

  if (discard.confirming) {
    return (
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => discard.setConfirming(false)}
          disabled={discard.discarding}
        >
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={discard.confirmDiscard} busy={discard.discarding}>
          {discard.discarding ? 'Discarding' : 'Confirm discard'}
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <Button variant="ghost" size="sm" onClick={() => discard.setConfirming(true)}>
        Discard
      </Button>
      <Button asChild variant="secondary" size="sm">
        <Link href={`/golf/dashboard/rounds/continue/${round.id}`}>
          {ready ? (
            <Send className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{ready ? 'Finish submitting' : 'Continue'}</span>
        </Link>
      </Button>
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

interface RowProps {
  round: RoundLibraryRound;
  playerId: string;
  now: number | null;
  onDiscarded: (id: string) => void;
}

/** The newest unfinished round, with the count and how stale it is. */
function LeadRow({ round, playerId, now, onDiscarded, count }: RowProps & { count: number }) {
  const discard = useDiscard(round, playerId, () => onDiscarded(round.id));
  const ready = Boolean(round.hasPendingSubmission);
  const age = now === null ? '' : ageLabel(round, now);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 sm:p-4">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{count} unfinished</span>
            {age && ` · ${count === 1 ? 'saved' : 'newest'} ${age}`}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 font-fw-sans text-body-sm">
            <span className="truncate font-medium text-text-primary">{courseOf(round)}</span>
            {ready ? (
              <StatusPill tone="accent" size="sm" className="shrink-0">
                Ready to submit
              </StatusPill>
            ) : (
              <span className="shrink-0 text-text-tertiary">{progressLabel(round)}</span>
            )}
          </p>
        </div>
        <RoundActions round={round} discard={discard} />
      </div>
      {discard.error && (
        <p className="px-3 pb-3 font-fw-sans text-caption text-fw-danger-ink sm:px-4" role="alert">
          {discard.error}
        </p>
      )}
    </div>
  );
}

/** An older unfinished round inside the disclosure. */
function OlderRow({ round, playerId, now, onDiscarded }: RowProps) {
  const discard = useDiscard(round, playerId, () => onDiscarded(round.id));
  const ready = Boolean(round.hasPendingSubmission);
  const age = now === null ? '' : ageLabel(round, now);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {courseOf(round)}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 font-fw-sans text-caption text-text-tertiary">
            {age && <span className="shrink-0">Saved {age}</span>}
            {ready ? (
              <StatusPill tone="accent" size="sm" className="shrink-0">
                Ready to submit
              </StatusPill>
            ) : (
              <span className="truncate">{progressLabel(round)}</span>
            )}
          </p>
        </div>
        <RoundActions round={round} discard={discard} />
      </div>
      {discard.error && (
        <p className="px-3 pb-3 font-fw-sans text-caption text-fw-danger-ink sm:px-4" role="alert">
          {discard.error}
        </p>
      )}
    </div>
  );
}

// ── Entry ───────────────────────────────────────────────────────────────────

export interface AUnfinishedLineProps {
  rounds: RoundLibraryRound[];
  playerId: string;
}

export function AUnfinishedLine({ rounds, playerId }: AUnfinishedLineProps) {
  const router = useRouter();
  const panelId = React.useId();
  const [local, setLocal] = React.useState(rounds);
  const [open, setOpen] = React.useState(false);
  // "10d ago" depends on the clock, so it is computed after mount: the server render
  // and hydration would otherwise disagree.
  const [now, setNow] = React.useState<number | null>(null);

  // Keep local state in sync when the server passes a fresh list.
  React.useEffect(() => setLocal(rounds), [rounds]);
  React.useEffect(() => setNow(Date.now()), []);

  const sorted = React.useMemo(() => [...local].sort((a, b) => savedAt(b) - savedAt(a)), [local]);
  const lead = sorted[0];
  if (!lead) return null;
  const rest = sorted.slice(1);

  const handleDiscarded = (id: string) => {
    setLocal((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  };

  return (
    <Surface as="section" aria-label="Unfinished rounds" padding="none" className="overflow-hidden">
      <LeadRow
        key={lead.id}
        round={lead}
        playerId={playerId}
        now={now}
        onDiscarded={handleDiscarded}
        count={sorted.length}
      />

      {rest.length > 0 && (
        <>
          <div className="border-t border-border-subtle p-1.5">
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              className="justify-between rounded-fw-md px-3"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              rightIcon={
                open ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )
              }
            >
              {open ? 'Hide older' : `Show ${rest.length} older`}
            </Button>
          </div>
          {open && (
            <ul id={panelId} className="border-t border-border-subtle">
              {rest.map((r) => (
                <li key={r.id} className="border-b border-border-subtle last:border-b-0">
                  <OlderRow round={r} playerId={playerId} now={now} onDiscarded={handleDiscarded} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Surface>
  );
}
