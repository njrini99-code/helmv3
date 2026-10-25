'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import type { ChReviewHole } from '../../data/round-review-shape';
import type { ChUsualWords } from '../../data/round-history-shape';
import { bigNumbers, bounceBack, closingThree, holesInPlayOrder, puttsPerGir, ROUND_MIN_GREENS, type ChPlayHole } from '../../data/stats-extra';
import { formatFixed, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { ZoneBlock } from '../../ui/Zone';

/**
 * P-7 4.5.3: "What the round says", four figures the round's holes say beyond its score, each with the player's usual
 * when there is one. No colour and no arrows: one round against twenty is noise most of the time (owner call 7). A figure
 * the round cannot support says why in words, never a dash read aloud.
 */

export interface ChSaysFigure {
  id: 'bounce' | 'ppg' | 'closing' | 'big';
  label: string;
  /** The round's value; null draws the no-data mark with `missing` read instead. */
  value: string | null;
  missing?: string;
  caption: string;
  about: string;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const withUsual = (lead: string, usual: string | null | undefined) => (usual ? `${lead} · ${lowerFirst(usual)}` : lead);

/** "Holes 16 to 18", or the holes named when the three wrap past the last hole ("Holes 17, 18 and 1"). */
export function holesWords(h: readonly [number, number, number]): string {
  return h[1] === h[0] + 1 && h[2] === h[1] + 1 ? `Holes ${h[0]} to ${h[2]}` : `Holes ${h[0]}, ${h[1]} and ${h[2]}`;
}

/** The four figures for a round, from its holes, its start hole and the player's usual (null when that read is missing). */
export function saysFigures(input: { holes: readonly ChReviewHole[]; startHole: number | null; usual: ChUsualWords | null; nine: boolean; who: string | null }): ChSaysFigure[] {
  const plays: ChPlayHole[] = input.holes.filter((h) => h.par != null).map((h) => ({ n: h.n, par: h.par as number, score: h.score, putts: h.putts, gir: h.gir, fairway: h.fairway }));
  const scored = plays.some((h) => h.score != null);
  const order = holesInPlayOrder(plays, input.startHole);
  const b = bounceBack(order);
  const p = puttsPerGir(plays);
  const c = closingThree(order);
  const u = input.usual;
  const your = input.who ? `${input.who}’s` : 'Your';
  const out: ChSaysFigure[] = [
    {
      id: 'bounce',
      label: 'Bounce-back',
      value: b.chances ? `${b.made} of ${b.chances}` : null,
      missing: 'No bogeys to bounce back from',
      caption: b.chances ? withUsual('Par or better after a bogey', u?.bounce) : 'No bogeys to bounce back from',
      about: 'A bounce-back is a par or better on the hole after a bogey or worse.',
    },
    {
      id: 'ppg',
      label: 'Putts per green hit',
      value: p.value == null ? null : formatFixed(p.value, 2),
      missing: `Needs ${ROUND_MIN_GREENS} greens hit`,
      caption: p.value == null ? `Needs ${ROUND_MIN_GREENS} greens hit` : (u?.ppg ?? 'Greens hit in regulation with putts recorded'),
      about: 'Putts on holes where the green was hit in regulation, divided by those holes. Tour players average about 1.75 (estimate).',
    },
  ];
  if (scored && c) {
    out.push({
      id: 'closing',
      label: 'Closing three',
      value: formatToPar(c.toPar),
      caption: withUsual(holesWords(c.holes), u?.closing),
      about: `${your} score to par on the last three holes played.`,
    });
  }
  if (scored) {
    out.push({
      id: 'big',
      label: 'Big numbers',
      value: String(bigNumbers(plays)),
      caption: withUsual('Double bogey or worse', input.nine ? null : u?.big),
      about: 'Holes scored double bogey or worse.',
    });
  }
  return out;
}

function SaysTile({ f }: { f: ChSaysFigure }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <figure className="ch-says__tile">
      <figcaption>
        <span className="ch-says__label">{f.label}</span>
        <span className="ch-says__value ch-num">{f.value ?? <NoData label={f.missing ?? 'None'} />}</span>
        <span className="ch-says__cap">{f.caption}</span>
      </figcaption>
      <button type="button" className="ch-says__info" aria-label={`About ${lowerFirst(f.label)}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Info size={16} aria-hidden="true" />
      </button>
      <p id={id} className="ch-says__about" hidden={!open}>
        {f.about}
      </p>
    </figure>
  );
}

export function RoundSays({ figures }: { figures: ChSaysFigure[] }) {
  if (!figures.length) return null;
  return (
    <ZoneBlock title="What the round says" id="ch-rv-says-h">
      <div className="ch-says">
        {figures.map((f) => (
          <SaysTile key={f.id} f={f} />
        ))}
      </div>
    </ZoneBlock>
  );
}
