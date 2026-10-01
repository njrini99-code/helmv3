import type { ReactNode } from 'react';
import { HOLES_ADJ, hasPrevious, hasRange, isFiltered, type ChFilter } from '../../data/stats-filter';
import type { ChBests } from '../../data/stats-figures';
import type { ChProfileExtra } from '../../data/stats-player';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { DataTable, Empty, RoundLine, Tiles } from './detail';

/**
 * The Rounds tab's parity figures (PARITY.md SC12 to SC14): the score of every
 * round in the window on a line, the personal bests, and this window against
 * the one before it. A card on the desktop, a panel on the phone.
 */
function Card({ id, title, meta, phone, children }: { id: string; title: string; meta?: string; phone: boolean; children: ReactNode }) {
  return phone ? (
    <section className="ch-stm-panel" aria-labelledby={id}>
      <div className="ch-stm-panel__h">
        <h2 id={id}>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </section>
  ) : (
    <section className="ch-st-card" aria-labelledby={id}>
      <div className="ch-st-card__head">
        <div>
          <h2 id={id}>{title}</h2>
          {meta && <span>{meta}</span>}
        </div>
      </div>
      {children}
    </section>
  );
}

const hasBest = (b: ChBests) => b.score != null || b.toPar != null || b.gir != null || b.putts != null;

function BestTiles({ b, at, label }: { b: ChBests; at: (v: { course: string; date: string } | null) => string | null; label: string }) {
  return (
    <Tiles
      label={label}
      items={[
        { label: 'Best score', value: b.score ? String(b.score.value) : NO_DATA, sub: at(b.score) },
        { label: 'Best to par', value: b.toPar ? formatToPar(b.toPar.value, 0) : NO_DATA, sub: at(b.toPar) },
        { label: 'Best GIR', value: b.gir ? `${b.gir.value.toFixed(1)}%` : NO_DATA, sub: at(b.gir) },
        { label: 'Fewest putts', value: b.putts ? String(b.putts.value) : NO_DATA, sub: at(b.putts) },
      ]}
    />
  );
}

export function RoundsExtra({ x, filter, phone = false }: { x: ChProfileExtra; filter: ChFilter; phone?: boolean }) {
  const b = x.bests;
  const c = x.compare;
  const at = (v: { course: string; date: string } | null) => (v ? `${v.course} · ${v.date}` : null);
  // Only the newest-ten cut has an earlier window; a date range, picked rounds, the season and the qualifiers have none by design.
  const why = hasPrevious(filter)
    ? filter.holes !== '18'
      ? 'Needs 3 earlier rounds before the newest 10 that match these filters, counting a 9-hole round as half.'
      : isFiltered(filter)
        ? 'Needs 3 earlier 18-hole rounds: fewer than 13 match these filters.'
        : 'Needs 3 earlier 18-hole rounds: this window has fewer than 13 in the season.'
    : hasRange(filter)
      ? 'A date range has no earlier window to compare with.'
      : filter.pick?.mode === 'only'
        ? 'Picked rounds have no earlier window to compare with.'
        : filter.window === 'season'
          ? 'The season has no earlier window to compare with.'
          : 'Qualifier rounds have no earlier window to compare with.';
  const change = (last: number | null, previous: number | null, digits: number, lowerIsBetter: boolean) => {
    if (last == null || previous == null) return { v: NO_DATA };
    const d = last - previous;
    const flat = Math.abs(d) < (digits ? 0.05 : 0.5);
    return { v: formatSigned(d, digits), tone: flat ? undefined : (lowerIsBetter ? d < 0 : d > 0) ? ('gain' as const) : ('loss' as const) };
  };
  return (
    <>
      <Card id="rx-score" title="Score by round" meta={`Every ${HOLES_ADJ[filter.holes]} round in this window, oldest first${x.nineRounds ? ' · 9-hole scores doubled (per 18)' : ''}`} phone={phone}>
        {x.series.score.length >= 2 ? (
          <RoundLine points={x.series.score} digits={0} label="Score by round" />
        ) : (
          <Empty code="CH-5314">A line needs two rounds; this window has {x.series.score.length}.</Empty>
        )}
      </Card>
      {/* A 9-hole score and an 18-hole score are not the same best: each length is listed on its own. */}
      {(filter.holes === '18' || (filter.holes === 'all' && hasBest(b))) && (
        <Card id="rx-bests" title="Personal bests" meta="In this window, 18 holes" phone={phone}>
          <BestTiles b={b} at={at} label="Personal bests" />
        </Card>
      )}
      {x.bests9 && filter.holes !== '18' && (
        <Card id="rx-bests9" title={filter.holes === '9' ? 'Personal bests' : 'Personal bests, 9 holes'} meta="In this window, 9 holes" phone={phone}>
          <BestTiles b={x.bests9} at={at} label="Personal bests, 9 holes" />
        </Card>
      )}
      <Card id="rx-compare" title="This window against the one before" meta="Latest 10 rounds and the 10 before them" phone={phone}>
        {c ? (
          <DataTable
            label="This window against the one before"
            cols={['Stat', `Latest ${c.lastRounds}`, `Before ${c.previousRounds}`, 'Change']}
            rows={c.rows.map((r) => ({
              key: r.label,
              head: r.label,
              cells: [
                r.last == null ? NO_DATA : `${r.last.toFixed(r.digits)}${r.unit}`,
                r.previous == null ? NO_DATA : `${r.previous.toFixed(r.digits)}${r.unit}`,
                change(r.last, r.previous, r.digits, r.lowerIsBetter),
              ],
            }))}
          />
        ) : (
          <Empty code="CH-5313">{why}</Empty>
        )}
      </Card>
    </>
  );
}
