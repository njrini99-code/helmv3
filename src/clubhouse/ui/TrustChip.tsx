import { Check } from 'lucide-react';
import { Icon } from './Icon';

/**
 * How settled a number is (plan 4.33, D-84 and A.7.11): Upcoming, Live, Suspended, Final or Official, with an optional
 * quieter source label beside it (Card, Coach, Estimate, Pasted). Trust and source are different questions, so the
 * source never changes the chip's tone.
 *
 *   live      - the live dot breathes on the live loop (`--ch-dur-live`), still under reduced motion and Animations off
 *   suspended - amber text on the warning tint
 *   final     - our cards are in; the field can still move
 *   official  - positive ink with a check: the host's published results
 *
 * Server-safe: no state, no effects.
 */
export type TrustState = 'upcoming' | 'live' | 'suspended' | 'final' | 'official';
export type TrustSource = 'card' | 'coach' | 'estimate' | 'pasted';

const LABEL: Record<TrustState, string> = { upcoming: 'Upcoming', live: 'Live', suspended: 'Suspended', final: 'Final', official: 'Official' };
const SOURCE: Record<TrustSource, string> = { card: 'Card', coach: 'Coach', estimate: 'Estimate', pasted: 'Pasted' };

export function TrustChip({
  state,
  at,
  source,
}: {
  state: TrustState;
  /** A time already formatted for the viewer, shown after the label: "as of 10:42". */
  at?: string | null;
  source?: TrustSource | null;
}) {
  return (
    <span className={`ch-trust ch-trust--${state}`} data-ch-trust={state}>
      {state === 'live' && <span className="ch-trust__dot" aria-hidden="true" />}
      {state === 'official' && <Icon icon={Check} size={12} className="ch-trust__ic" />}
      <span className="ch-trust__l">{LABEL[state]}</span>
      {at && <span className="ch-trust__at ch-num">{at}</span>}
      {source && <span className="ch-trust__src">· {SOURCE[source]}</span>}
    </span>
  );
}
