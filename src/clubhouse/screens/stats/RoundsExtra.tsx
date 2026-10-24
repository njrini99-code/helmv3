import type { ReactNode } from 'react';
import { HOLES_ADJ, hasPrevious, hasRange, isFiltered, type ChFilter } from '../../data/stats-filter';
import type { ChBests } from '../../data/stats-figures';
import type { ChProfileExtra } from '../../data/stats-player';
import { formatFixed, formatPct, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { halvesTone } from '../../lib/stats-signal';
import { DataTable, Empty, RoundLine, Rule, Tiles } from './detail';
import { BestCardShare } from './BestCard';
import { bestCardFields } from './best-card-fields';
import type { ChViewer } from '../../data/stats-player';
import { Zone, ZoneBig as Big, ZoneBlock as Vis } from '../../ui/Zone';

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
        { label: 'Best GIR', value: formatPct(b.gir?.value), sub: at(b.gir) },
        { label: 'Fewest putts', value: b.putts ? String(b.putts.value) : NO_DATA, sub: at(b.putts) },
      ]}
    />
  );
}

export function RoundsExtra({
  x,
  filter,
  phone = false,
  zones = false,
  share,
}: {
  x: ChProfileExtra;
  filter: ChFilter;
  phone?: boolean;
  /** Desktop: the same figures as zones (the Overview's style) instead of cards. */
  zones?: boolean;
  /** Who the personal-best card is for (P005-C2); omitted, the bests have no Share. */
  share?: { viewer: ChViewer; name: string; coach: string | null | undefined };
}) {
  const b = x.bests;
  const card = share ? bestCardFields({ ...share, bests: b }) : null;
  const c = x.compare;
  // The compare is the newest-N cut against the N before it (Last 5, 10 or 20), so its words follow N.
  const compareNote = `Latest ${filter.last} rounds and the ${filter.last} before them`;
  const at = (v: { course: string; date: string } | null) => (v ? `${v.course} · ${v.date}` : null);
  // Only the newest-N cut has an earlier window; a date range, picked rounds, the season and the qualifiers have none by design.
  const why = hasPrevious(filter)
    ? filter.holes !== '18'
      ? `Needs 3 earlier rounds before the newest ${filter.last} that match these filters, counting a 9-hole round as half.`
      : isFiltered(filter)
        ? `Needs 3 earlier 18-hole rounds: fewer than ${filter.last + 3} match these filters.`
        : `Comparing starts at ${filter.last + 3} rounds: the newest ${filter.last} against at least 3 before them.`
    : hasRange(filter)
      ? 'A date range has no earlier window to compare with.'
      : filter.pick?.mode === 'only'
        ? 'Picked rounds have no earlier window to compare with.'
        : filter.window === 'season'
          ? 'The season has no earlier window to compare with.'
          : 'Qualifier rounds have no earlier window to compare with.';
  // A change is toned only when it clears its standard error and still prints at its digits (A1, the one change rule).
  const change = (last: number | null, previous: number | null, digits: number, lowerIsBetter: boolean, se: number | null) => {
    if (last == null || previous == null) return { v: NO_DATA };
    const d = last - previous;
    const tone = halvesTone({ delta: d, se }, lowerIsBetter, digits);
    return { v: formatSigned(d, digits), tone: tone === 'is-gain' ? ('gain' as const) : tone === 'is-loss' ? ('loss' as const) : undefined };
  };
  if (zones && !phone) {
    const scoreChange = c?.rows.find((r) => r.label === 'Scoring avg');
    const sc = scoreChange ? change(scoreChange.last, scoreChange.previous, scoreChange.digits, scoreChange.lowerIsBetter, scoreChange.se) : null;
    const best = filter.holes === '9' ? x.bests9?.score : b.score;
    return (
      <>
        <Zone
          n={1}
          title="Score by round"
          def={
            <>
              Every round in this window, oldest first. <b>Lower is better.</b> The dotted line is the average, and your best rounds are beside it.
            </>
          }
          read={
            best ? (
              <>
                <Big value={String(best.value)} tone="good" />
                <div className="ch-znlines">
                  <span>
                    <b>Best round</b>
                  </span>
                  <span>{at(best)}</span>
                </div>
              </>
            ) : undefined
          }
        >
          <Vis id="rx-score" title="Score by round" note={`Every ${HOLES_ADJ[filter.holes]} round in this window, oldest first${x.nineRounds ? ' · 9-hole scores doubled (per 18)' : ''}`}>
            {x.series.score.length >= 2 ? <RoundLine points={x.series.score} digits={0} label="Score by round" lowerIsBetter /> : <Empty code="CH-5314">A line needs two rounds; this window has {x.series.score.length}.</Empty>}
          </Vis>
          {(filter.holes === '18' || (filter.holes === 'all' && hasBest(b))) && (
            <Vis id="rx-bests" title="Personal bests" note="In this window, 18 holes">
              <BestTiles b={b} at={at} label="Personal bests" />
              {card && (
                <div className="ch-bestcard__act">
                  <BestCardShare card={card} />
                </div>
              )}
            </Vis>
          )}
          {x.bests9 && filter.holes !== '18' && (
            <Vis id="rx-bests9" title={filter.holes === '9' ? 'Personal bests' : 'Personal bests, 9 holes'} note="In this window, 9 holes">
              <BestTiles b={x.bests9} at={at} label="Personal bests, 9 holes" />
            </Vis>
          )}
        </Zone>
        <Zone
          n={2}
          alt
          title="Against the one before"
          def={<>The latest {filter.last} rounds beside the {filter.last} before them. Green is better than before, gold is worse.</>}
          read={
            sc && sc.v !== NO_DATA ? (
              <>
                <Big value={sc.v} tone={sc.tone === 'gain' ? 'good' : sc.tone === 'loss' ? 'bad' : undefined} />
                <div className="ch-znlines">
                  <span>
                    <b>Scoring average</b> against the {filter.last} before
                  </span>
                </div>
              </>
            ) : undefined
          }
        >
          <Vis id="rx-compare" title="This window against the one before" note={compareNote}>
            {c ? (
              <>
                <DataTable
                  label="This window against the one before"
                  cols={['Stat', `Latest ${c.lastRounds}`, `Before ${c.previousRounds}`, 'Change']}
                  rows={c.rows.map((r) => ({
                    key: r.label,
                    head: r.label,
                    cells: [
                      r.last == null ? NO_DATA : `${formatFixed(r.last, r.digits)}${r.unit}`,
                      r.previous == null ? NO_DATA : `${formatFixed(r.previous, r.digits)}${r.unit}`,
                      change(r.last, r.previous, r.digits, r.lowerIsBetter, r.se),
                    ],
                  }))}
                />
                {(c.lastHoleRounds < c.lastRounds || c.previousHoleRounds < c.previousRounds) && (
                  <Rule>
                    Greens, fairways and putts: hole stats from {c.lastHoleRounds} of {c.lastRounds} latest rounds and {c.previousHoleRounds} of {c.previousRounds} before them.
                  </Rule>
                )}
              </>
            ) : (
              <Empty code="CH-5313">{why}</Empty>
            )}
          </Vis>
        </Zone>
      </>
    );
  }
  return (
    <>
      {/* P005-D1: the phone's Scoring trend already draws these rounds one panel up, so the phone shows one chart. */}
      {!phone && (
        <Card id="rx-score" title="Score by round" meta={`Every ${HOLES_ADJ[filter.holes]} round in this window, oldest first${x.nineRounds ? ' · 9-hole scores doubled (per 18)' : ''}`} phone={phone}>
          {x.series.score.length >= 2 ? (
            <RoundLine points={x.series.score} digits={0} label="Score by round" lowerIsBetter />
          ) : (
            <Empty code="CH-5314">A line needs two rounds; this window has {x.series.score.length}.</Empty>
          )}
        </Card>
      )}
      {/* A 9-hole score and an 18-hole score are not the same best: each length is listed on its own. */}
      {(filter.holes === '18' || (filter.holes === 'all' && hasBest(b))) && (
        <Card id="rx-bests" title="Personal bests" meta="In this window, 18 holes" phone={phone}>
          <BestTiles b={b} at={at} label="Personal bests" />
          {card && (
            <div className="ch-bestcard__act">
              <BestCardShare card={card} />
            </div>
          )}
        </Card>
      )}
      {x.bests9 && filter.holes !== '18' && (
        <Card id="rx-bests9" title={filter.holes === '9' ? 'Personal bests' : 'Personal bests, 9 holes'} meta="In this window, 9 holes" phone={phone}>
          <BestTiles b={x.bests9} at={at} label="Personal bests, 9 holes" />
        </Card>
      )}
      <Card id="rx-compare" title="This window against the one before" meta={compareNote} phone={phone}>
        {c ? (
          <>
            <DataTable
              label="This window against the one before"
              cols={['Stat', `Latest ${c.lastRounds}`, `Before ${c.previousRounds}`, 'Change']}
              rows={c.rows.map((r) => ({
                key: r.label,
                head: r.label,
                cells: [
                  r.last == null ? NO_DATA : `${formatFixed(r.last, r.digits)}${r.unit}`,
                  r.previous == null ? NO_DATA : `${formatFixed(r.previous, r.digits)}${r.unit}`,
                  change(r.last, r.previous, r.digits, r.lowerIsBetter, r.se),
                ],
              }))}
            />
            {/* Greens, fairways and putts read the rounds with their holes scored; a round posted as a total only is a score and nothing else (Q-123). */}
            {(c.lastHoleRounds < c.lastRounds || c.previousHoleRounds < c.previousRounds) && (
              <Rule>
                Greens, fairways and putts: hole stats from {c.lastHoleRounds} of {c.lastRounds} latest rounds and {c.previousHoleRounds} of {c.previousRounds} before them.
              </Rule>
            )}
          </>
        ) : (
          <Empty code="CH-5313">{why}</Empty>
        )}
      </Card>
    </>
  );
}
