'use client';

import { Medal } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { Opt, Opts } from './parts';

/** What the sheet says when the server gave no reason for having no round to choose. */
export const NO_QUALIFIER_ROUND = 'No unused qualifier round is available right now. Your scorecard remains saved.';

/**
 * CH-11518: a saved qualifier round that predates the durable round number is finished and about to be submitted, so
 * the player says which round of the qualifier it is (the legacy continue screen's "Choose qualifier round" dialog,
 * `showQualifierRoundNumberDialog`). The choices are the server page's own unused rounds; nothing is guessed from the
 * scorecard. Without this, such a round could be played to the end and never submitted.
 *
 * It is drawn in the exit sheet's pieces: the option rows, one per unused round (the chosen one is the primary),
 * then Back (to the finish sheet) and Submit round, which waits for a choice. CH-11519: when no round is left to
 * choose, the server's reason takes the rows' place and only Back remains; the scorecard stays saved.
 */
export function QualifierRoundSheet({
  open,
  options,
  unavailableReason,
  selected,
  canSubmit,
  onSelect,
  onBack,
  onSubmit,
}: {
  open: boolean;
  /** The unused round numbers the server offered. */
  options: number[];
  /** Why there is none to choose (`qualifierRoundNumberUnavailableReason`), or null for the default sentence. */
  unavailableReason: string | null;
  selected: number | null;
  /** A round is chosen and there is a finished round to submit. */
  canSubmit: boolean;
  onSelect: (round: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onBack}
      title="Which qualifier round is this?"
      description="This saved scorecard needs its qualifier round number before it can be submitted. Your shots and completed holes stay saved."
      icon={Medal}
      width={480}
      code="CH-11518"
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          {options.length > 0 && (
            <Button variant="primary" size="lg" disabled={!canSubmit} onClick={onSubmit}>
              Submit round
            </Button>
          )}
        </>
      }
    >
      {options.length > 0 ? (
        <Opts>
          {options.map((n) => (
            <Opt
              key={n}
              icon={Medal}
              tone={selected === n ? 'primary' : undefined}
              label={`Qualifier round ${n}`}
              hint={selected === n ? 'Chosen. Submit to post it as this round.' : 'Post it as this round.'}
              onClick={() => {
                haptic('select');
                onSelect(n);
              }}
            />
          ))}
        </Opts>
      ) : (
        <p className="ch-rt-note is-warn" role="status" data-ch-code="CH-11519">
          <span>{unavailableReason?.trim() || NO_QUALIFIER_ROUND}</span>
        </p>
      )}
    </Modal>
  );
}
