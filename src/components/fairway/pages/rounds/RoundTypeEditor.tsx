'use client';

/**
 * Change a submitted round's type, from the round detail page.
 *
 * Requested by a coach 2026-08-19 after players mis-tapped at setup: "UNCW
 * boys accidentally clicked practice instead of qualifier and they just need
 * to go in and change their type of round." Before this there was no path at
 * all — `round_type` was written once at draft creation and never again, so a
 * mis-tap silently kept the round out of the qualifier's results forever.
 *
 * Deliberately NOT a bare `<select>` that fires on change. Two reasons:
 *
 *  1. Choosing "Qualifier" is not a one-field edit. A round only appears in a
 *     qualifier because of `qualifier_id`, which is a separate column — so
 *     picking that type has to also ask WHICH qualifier. A select that
 *     submitted immediately would have to either guess or silently write a
 *     qualifier-typed round with no linkage, which is the exact invisible
 *     failure this whole change exists to prevent.
 *  2. It rewrites what a round counts toward. An accidental brush of a
 *     dropdown should not move a score in or out of the standings.
 *
 * So: pick, then confirm. The server action re-validates everything anyway —
 * this component's job is to make the qualifier requirement legible, not to
 * be the enforcement.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button, Segmented } from '@/components/fairway';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/sonner';
// The ACTION comes from the 'use server' module; the vocabulary comes from the
// plain one. They are split because a 'use server' file may export only async
// functions — see lib/golf/round-type-options.ts.
import { updateRoundType } from '@/app/golf/actions/round-type';
import {
  EDITABLE_ROUND_TYPES,
  type EditableRoundType,
} from '@/lib/golf/round-type-options';

const TYPE_LABEL: Record<EditableRoundType, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  qualifier: 'Qualifier',
};

export interface QualifierOption {
  id: string;
  name: string;
  /** How many rounds this qualifier is configured for. */
  numRounds: number;
  /**
   * Round numbers in this qualifier that ANOTHER of this player's rounds
   * already holds. Excludes the round being edited, so a round already sitting
   * in slot 2 does not see its own slot as taken.
   *
   * This is the field whose absence was the bug. The picker used to offer
   * every number from 1 to `numRounds` and default to 1 — but a player fixing
   * a mis-tapped round has usually already recorded the qualifier's earlier
   * rounds, so slot 1 is exactly the one that is NOT free. The save then died
   * on the server's clash check ("Round 1 of that qualifier is already taken")
   * with no way to see which numbers were available, which is what "players
   * still cannot edit round type" turned out to mean on 2026-08-30.
   */
  takenRoundNumbers?: number[];
  /**
   * Whether this player already has a `golf_qualifier_entries` row for this
   * qualifier. `false` means the save will create one.
   *
   * Only a coach is ever offered a qualifier where this is false, because RLS
   * makes entry creation coach-only. Offering it to a player would rebuild the
   * dead end one step further along.
   */
  playerEntered?: boolean;
}

/**
 * Round numbers still free in a qualifier, in order.
 *
 * Exported for tests: the whole defect was an off-by-default here, and a rule
 * this cheap to get wrong deserves a test that does not need a DOM.
 */
export function freeRoundNumbers(option: QualifierOption | undefined): number[] {
  if (!option) return [];
  const taken = new Set(option.takenRoundNumbers ?? []);
  return Array.from({ length: Math.max(option.numRounds, 1) }, (_, i) => i + 1).filter(
    (n) => !taken.has(n),
  );
}

export interface RoundTypeEditorProps {
  roundId: string;
  currentType: string | null;
  currentQualifierId?: string | null;
  currentQualifierRoundNumber?: number | null;
  /**
   * Qualifiers this player is ENTERED in and which are not completed. The
   * server re-checks both, but offering a qualifier the player can't join
   * would be a dead end dressed as a choice.
   */
  qualifierOptions?: QualifierOption[];
  /**
   * Whether the person looking at this is a coach of the round's team. Decides
   * which dead end the empty state describes — telling a coach that "a coach
   * needs to add them" is a loop, and that loop is what the 2026-08-31 report
   * was actually describing.
   */
  viewerIsCoach?: boolean;
  className?: string;
}

/** What actually changed, in the words a coach would use. */
function describeSaved(
  type: EditableRoundType,
  chosen: QualifierOption | undefined,
  roundNumber: number,
): string {
  if (type !== 'qualifier') {
    return `This round now counts as a ${type} round and no longer counts toward a qualifier.`;
  }
  if (!chosen) return 'This round now counts as a qualifier round.';
  const entered = chosen.playerEntered === false ? ' The player was added to it.' : '';
  return `Saved as round ${roundNumber} of ${chosen.name}. It now counts in the standings.${entered}`;
}

export function RoundTypeEditor({
  roundId,
  currentType,
  currentQualifierId,
  currentQualifierRoundNumber,
  qualifierOptions = [],
  viewerIsCoach = false,
  className,
}: RoundTypeEditorProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<EditableRoundType>(
    (EDITABLE_ROUND_TYPES as readonly string[]).includes(currentType ?? '')
      ? (currentType as EditableRoundType)
      : 'practice',
  );
  const [qualifierId, setQualifierId] = React.useState<string>(currentQualifierId ?? '');
  const [roundNumber, setRoundNumber] = React.useState<number>(currentQualifierRoundNumber ?? 1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const needsQualifier = type === 'qualifier';
  const chosen = qualifierOptions.find((q) => q.id === qualifierId);
  const free = freeRoundNumbers(chosen);
  // A qualifier with every slot already filled by this player's other rounds
  // is a dead end, and saying so here is the difference between an
  // explanation and a failed save.
  const noFreeSlots = Boolean(chosen) && free.length === 0;

  // Keep the chosen number on a FREE slot. Without this the picker defaults to
  // 1 — usually the one slot already taken — and every save fails on the
  // server's clash check. Runs when the qualifier changes, not on every
  // render, so a deliberate pick is never overridden.
  const lastQualifierRef = React.useRef<string>(qualifierId);
  React.useEffect(() => {
    if (lastQualifierRef.current === qualifierId) return;
    lastQualifierRef.current = qualifierId;
    const nextFree = freeRoundNumbers(qualifierOptions.find((q) => q.id === qualifierId));
    if (nextFree.length > 0 && !nextFree.includes(roundNumber)) {
      setRoundNumber(nextFree[0]!);
    }
  }, [qualifierId, qualifierOptions, roundNumber]);
  const unchanged =
    type === currentType &&
    (!needsQualifier || (qualifierId === (currentQualifierId ?? '') && roundNumber === (currentQualifierRoundNumber ?? 1)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await updateRoundType({
        roundId,
        roundType: type,
        qualifierId: needsQualifier ? qualifierId || null : null,
        qualifierRoundNumber: needsQualifier ? roundNumber : null,
      });
      if (!res.success) {
        setError(res.error ?? 'That did not save.');
        return;
      }
      // Closing the panel was the only thing that used to happen on success.
      // A control that changes what a round counts toward — and that a coach
      // has already been told twice is broken — has to say plainly that it
      // worked, and say what it did.
      addToast({
        type: 'success',
        title: 'Round type updated',
        description: describeSaved(type, chosen, roundNumber),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      // The action THROWS as well as returning failures. Its `demoSafe`
      // wrapper runs `assertGolfDemoWritable` OUTSIDE the implementation's own
      // try/catch, and a dropped connection throws too. Without this the
      // rejection escaped, `setBusy(false)` never ran, and the Save button
      // stayed disabled forever with no message — the failure mode that looks
      // most like the app hanging.
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      // In `finally` so it runs on the success path, the refusal path, and the
      // throw path alike.
      setBusy(false);
    }
  }

  if (!open) {
    return (
      // Was a small ghost button reading "Change type". Two coaches reported
      // the feature as missing rather than broken, so the control now names
      // the thing it edits and carries a visible boundary instead of reading
      // as body text.
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        Change round type
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'mt-3 flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4',
        className,
      )}
    >
      <Segmented
        options={EDITABLE_ROUND_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
        value={type}
        onValueChange={(v) => setType(v as EditableRoundType)}
        aria-label="Round type"
      />

      {needsQualifier && (
        <div className="flex flex-col gap-2">
          {qualifierOptions.length === 0 ? (
            // Honest dead-end rather than an empty dropdown. Which dead end
            // depends on who is reading: a coach sees this only when the TEAM
            // has no open qualifier at all, because every open team qualifier
            // is offered to them whether or not the player is entered yet.
            <p className="font-fw-sans text-caption text-text-secondary">
              {viewerIsCoach
                ? 'This team has no open qualifier to attach a round to. Create one (or reopen a completed one) and this round can be added to it.'
                : "You aren't in any open qualifier yet, so this round can't be attached to one. Ask your coach to add you to one."}
            </p>
          ) : (
            <>
              <label className="font-fw-sans text-caption text-text-tertiary" htmlFor="rt-qual">
                Which qualifier?
              </label>
              <NativeSelect
                id="rt-qual"
                value={qualifierId}
                onChange={(e) => setQualifierId(e.target.value)}
                className={cn(
                  'min-h-[40px] rounded-fw-md border border-border-subtle bg-canvas px-3',
                  'font-fw-sans text-body-sm text-text-primary',
                  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                )}
              >
                <option value="">Select…</option>
                {qualifierOptions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </NativeSelect>

              {chosen && chosen.playerEntered === false && (
                <p className="font-fw-sans text-caption text-text-secondary">
                  This player isn&apos;t in {chosen.name} yet — saving will add them to it, and
                  this round will count as the round number you pick below.
                </p>
              )}

              {noFreeSlots && (
                <p className="font-fw-sans text-caption text-text-secondary">
                  Every round of {chosen?.name} is already filled by another of this player&apos;s
                  rounds, so this one can&apos;t be added to it. Re-type the round that&apos;s in the
                  wrong slot first, or pick a different qualifier.
                </p>
              )}

              {/* Rendered whenever a qualifier is chosen and something is free —
                  including a single-round qualifier. It used to be hidden when
                  numRounds === 1, which silently pinned the number to 1 and gave
                  a player whose slot 1 was taken no control and no explanation. */}
              {chosen && !noFreeSlots && (
                <>
                  <label className="font-fw-sans text-caption text-text-tertiary" htmlFor="rt-num">
                    Which round of it? ({free.length} of {chosen.numRounds} still open)
                  </label>
                  <NativeSelect
                    id="rt-num"
                    value={roundNumber}
                    onChange={(e) => setRoundNumber(Number(e.target.value))}
                    className={cn(
                      'min-h-[40px] rounded-fw-md border border-border-subtle bg-canvas px-3',
                      'font-fw-sans text-body-sm text-text-primary',
                      'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                    )}
                  >
                    {Array.from({ length: chosen.numRounds }, (_, i) => i + 1).map((n) => {
                      const taken = !free.includes(n);
                      return (
                        // Taken slots stay VISIBLE but unselectable: a player
                        // looking for "round 3" needs to see that 1 and 2 exist
                        // and why they are not on offer. Removing them entirely
                        // would renumber the list and read as data loss.
                        <option key={n} value={n} disabled={taken}>
                          Round {n}
                          {taken ? ' — already recorded' : ''}
                        </option>
                      );
                    })}
                  </NativeSelect>
                </>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="font-fw-sans text-caption text-fw-warning-ink">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={save}
          // `noFreeSlots` joins the list because the save is guaranteed to
          // fail on the server's clash check — an enabled button that cannot
          // succeed is how this bug reached players in the first place.
          disabled={busy || unchanged || (needsQualifier && (!qualifierId || noFreeSlots))}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
