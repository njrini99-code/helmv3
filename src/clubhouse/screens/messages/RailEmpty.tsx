import { type ChConvFilter, nothingHere } from './inbox/model';
import { Card } from '../../ui/Card';

/**
 * The conversation list with nothing to list (CH-7302, MSG-108): the card the artifact draws, a "Nothing here" header and
 * one line of why, in the Recent card's place. It names the filter and never says "caught up" (wave 5 #12). A search that
 * lists nothing is not told here, since message hits may still follow below; they say it (message-hits.tsx).
 * `card`: the phone's card. `flat`: the desktop rail's label over the same line.
 */
export function RailEmpty({ filter, q = '', layout }: { filter: ChConvFilter; q?: string; layout: 'card' | 'flat' }) {
  const line = <p className="ch-inb-note">{nothingHere(filter, q)}</p>;
  if (layout === 'card') {
    return (
      <Card kind="list" className="ch-msv-card" label="Nothing here" code="CH-7302">
        <h2 className="ch-msv-card__h">Nothing here</h2>
        {line}
      </Card>
    );
  }
  return (
    <section className="ch-ms-sec" aria-label="Nothing here" data-ch-code="CH-7302">
      <div className="ch-ms-sec__l">Nothing here</div>
      {line}
    </section>
  );
}
