'use client';

import { Modal } from '../../ui/Modal';
import { ScoreMark } from '../../ui/ScoreMark';
import { formatToPar, NO_DATA, tourDay } from './format';
import type { ChTourEvidenceRef, ChTourExclusion, ChTourHoleScore } from './types';

/** A scorecard to show under the figure's rounds: one player's card for one round. */
export interface DeskCard {
  player: string;
  roundNumber: number;
  courseLine: string;
  holes: ChTourHoleScore[];
  /** Where the card started (a shotgun or the 10th tee): "Started on 10". */
  startHole: number;
  /** Scorecard only, or with shot data. */
  shotData: boolean | null;
}

/** What opens the drawer: the figure (what it is, its formula, the rounds it used) and, for a score, its card. */
export interface DeskEvidence {
  ref: ChTourEvidenceRef;
  card: DeskCard | null;
}

const REASON: Record<ChTourExclusion, string> = {
  'nine-holes': 'nine holes',
  individual: 'individual entry',
  wd: 'withdrew',
  dq: 'disqualified',
  'no-shot-data': 'no shot data',
  'totals-only': 'totals only',
  'coach-excluded': 'you left it out',
};

const sum = (xs: ReadonlyArray<number | null>) => (xs.length && xs.every((x): x is number => x != null) ? xs.reduce((a, b) => a + b, 0) : null);

/**
 * The evidence drawer (board `Evidence`; 5.13): what a figure is made of. It names the figure, says its formula in words,
 * lists the rounds the figure used and the ones it left out with the reason, and, for a score, shows the scorecard.
 * Nothing here is computed: the caller hands it the reference. Radius 20 sheet; on the phone it rises from the bottom.
 */
export function EvidenceDrawer({ evidence, onClose }: { evidence: DeskEvidence | null; onClose: () => void }) {
  const ref = evidence?.ref;
  const used = ref ? ref.rounds.filter((r) => r.included).length : 0;
  return (
    <Modal open={!!evidence} onClose={onClose} title={ref?.title ?? 'Evidence'} description={ref?.formula} width={520}>
      {ref && (
        <div className="ch-tour-desk-ev">
          <dl className="ch-tour-desk-ev__fig">
            <div>
              <dt>Value</dt>
              <dd className="ch-num">{ref.figure}</dd>
            </div>
            <div>
              <dt>Out of</dt>
              <dd>{ref.denominator}</dd>
            </div>
            <div>
              <dt>Used</dt>
              <dd className="ch-num">
                {used} of {ref.rounds.length}
              </dd>
            </div>
          </dl>
          <ul className="ch-tour-desk-ev__list" aria-label="Rounds behind this figure">
            {ref.rounds.map((r) => (
              <li key={r.key} className={r.included ? 'is-used' : 'is-left'}>
                <span className="ch-tour-desk-ev__d">{tourDay(r.date)}</span>
                <span className="ch-tour-desk-ev__t">
                  {r.label}
                  <em>{r.included ? 'Counted' : r.reason ? `Left out: ${REASON[r.reason]}` : 'Not counted'}</em>
                </span>
                <span className="ch-tour-desk-ev__v ch-num">{r.value}</span>
              </li>
            ))}
          </ul>
          {evidence.card && <Card card={evidence.card} />}
        </div>
      )}
    </Modal>
  );
}

/** The card: Out and In as the board draws them, each hole as a score mark under its number and par. */
function Card({ card }: { card: DeskCard }) {
  const halves = card.holes.length > 9 ? [card.holes.slice(0, 9), card.holes.slice(9)] : [card.holes];
  const total = sum(card.holes.map((h) => h.strokes));
  const par = card.holes.reduce((a, h) => a + h.par, 0);
  return (
    <section className="ch-tour-desk-ev__card" aria-label={`${card.player}, round ${card.roundNumber}, scorecard`}>
      <h3>
        {card.player} · round {card.roundNumber}
        <span>{card.courseLine}</span>
      </h3>
      {halves.map((half, k) => (
        <div key={k} className="ch-tour-desk-ev__nine" role="table" aria-label={halves.length > 1 ? (k ? 'In' : 'Out') : 'Holes'}>
          <div role="row">
            <span role="columnheader">{halves.length > 1 ? (k ? 'In' : 'Out') : 'Hole'}</span>
            {half.map((h) => (
              <span key={h.n} role="columnheader">
                {h.n}
              </span>
            ))}
            <span role="columnheader">Tot</span>
          </div>
          <div role="row">
            <span role="rowheader">Par</span>
            {half.map((h) => (
              <span key={h.n} role="cell" className="ch-num">
                {h.par}
              </span>
            ))}
            <span role="cell" className="ch-num">
              {half.reduce((a, h) => a + h.par, 0)}
            </span>
          </div>
          <div role="row">
            <span role="rowheader">Score</span>
            {half.map((h) => (
              <span key={h.n} role="cell" className={h.disputed ? 'is-disputed' : undefined}>
                <ScoreMark score={h.strokes} par={h.par} size="sm" />
                {h.disputed && <span className="ch-sr-only"> disputed</span>}
              </span>
            ))}
            <span role="cell" className="ch-num ch-tour-desk-ev__tot">
              {sum(half.map((h) => h.strokes)) ?? NO_DATA}
            </span>
          </div>
        </div>
      ))}
      <p>
        {total != null ? `${total} (${formatToPar(total - par)})` : NO_DATA}
        {card.startHole > 1 ? ` · started on ${card.startHole}` : ''}
        {card.shotData == null ? '' : card.shotData ? ' · shot data' : ' · scorecard only'}
      </p>
    </section>
  );
}
