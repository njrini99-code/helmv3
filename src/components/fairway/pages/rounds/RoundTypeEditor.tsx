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
import {
  updateRoundType,
  EDITABLE_ROUND_TYPES,
  type EditableRoundType,
} from '@/app/golf/actions/round-type';

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
  className?: string;
}

export function RoundTypeEditor({
  roundId,
  currentType,
  currentQualifierId,
  currentQualifierRoundNumber,
  qualifierOptions = [],
  className,
}: RoundTypeEditorProps) {
  const router = useRouter();
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
  const unchanged =
    type === currentType &&
    (!needsQualifier || (qualifierId === (currentQualifierId ?? '') && roundNumber === (currentQualifierRoundNumber ?? 1)));

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateRoundType({
      roundId,
      roundType: type,
      qualifierId: needsQualifier ? qualifierId || null : null,
      qualifierRoundNumber: needsQualifier ? roundNumber : null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'That did not save.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        Change type
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
            // Honest dead-end rather than an empty dropdown: the server would
            // refuse this anyway ("not entered in that qualifier"), and saying
            // so here is the difference between a bug and an explanation.
            <p className="font-fw-sans text-caption text-text-secondary">
              This player isn&apos;t entered in any open qualifier, so this round can&apos;t be
              attached to one. A coach needs to add them to a qualifier first.
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

              {chosen && chosen.numRounds > 1 && (
                <>
                  <label className="font-fw-sans text-caption text-text-tertiary" htmlFor="rt-num">
                    Which round of it? (1–{chosen.numRounds})
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
                    {Array.from({ length: chosen.numRounds }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Round {n}
                      </option>
                    ))}
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
          disabled={busy || unchanged || (needsQualifier && !qualifierId)}
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
