'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import type { ChQDetailCore } from '../../data/qualifiers';
import { Icon } from '../../ui/Icon';
import { ScoreMark } from '../../ui/ScoreMark';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { formatFixed, formatToPar } from '../../lib/format';
import { dayLabel, endedLive, nextRoundNumber, plural, positionLabel, type ChQHole, type ChQRound } from './model';
import { rebuiltHref } from '../../shell/nav';
import { ToParPlate } from './parts';
import { Streamed } from './streamed';

/**
 * A player's rounds in this qualifier, beside the leaderboard (owner, 2026-10-16): the row opened on the board, else
 * your own, else (for a coach) the leader. One line a scheduled round: its course and day, total and to par, or "Not
 * played yet". A player only ever sees their own here, as with the scorecards.
 */
export function PlayerRounds({ data, openRow, ownOnly = false }: { data: ChQDetailCore; openRow: OpenRow; ownOnly?: boolean }) {
  const open = useSyncExternalStore(openRow.subscribe, openRow.get, openRow.get);
  const [shownFor, setShownFor] = useState<{ player: string; round: string | null } | null>(null);
  const b = data.board;
  if (!b) return null;
  const coach = data.role === 'coach';
  const mine = b.rows.find((r) => r.playerId === data.viewerPlayerId);
  const picked = b.rows.find((r) => r.playerId === open && (coach || r.playerId === data.viewerPlayerId));
  const row = ownOnly ? mine : (picked ?? mine ?? (coach ? b.rows[0] : undefined));
  if (!row) return null;
  const me = row.playerId === data.viewerPlayerId;
  const byNumber = new Map(row.rounds.map((rd) => [rd.number, rd]));
  // The open round belongs to the player shown: choosing another player closes it.
  const shown = shownFor?.player === row.playerId ? shownFor.round : null;
  const setShown = (round: string | null) => setShownFor({ player: row.playerId, round });
  const totals = row.rounds.map((rd) => rd.total).filter((t): t is number => t != null);
  // Your next round, while the qualifier is live and before its last day: the first one still to play.
  const live = data.status === 'in_progress' && !endedLive({ status: data.status, endDate: data.endDate, today: data.today, entrants: data.entrants, numRounds: data.numRounds, submitted: null });
  const playNext = me && live ? nextRoundNumber(row.rounds, data.numRounds) : null;
  const playHref = playNext != null ? playRoundHref(data.id) : null;
  const best = row.rounds.length > 1 && totals.length ? Math.min(...totals) : null;
  // One round is the best: of rounds tied on the best total, the first played (wave 7: two read "Best round").
  const bestNumber = best == null ? null : Math.min(...row.rounds.filter((rd) => rd.total === best).map((rd) => rd.number));
  return (
    // Shown off, not filed (owner, 2026-10-16: "they're showing off their rounds"): the team board's green, the total to
    // par large, one tile a round with its score, the best one marked, and the rounds still to play held open.
    <section className="ch-qf-prounds ch-scoreboard" aria-labelledby="ch-qf-prounds" aria-live="polite">
      <div className="ch-qf-prounds__head">
        <h2 id="ch-qf-prounds">{me ? 'Your rounds' : `${row.name}’s rounds`}</h2>
        {row.position != null && <span className="ch-qf-prounds__pos ch-num">{positionLabel(row)}</span>}
      </div>
      <div className="ch-qf-prounds__big">
        <b className={'ch-num' + (row.toPar != null && row.toPar < 0 ? ' is-under' : '')}>{formatToPar(row.toPar)}</b>
        <span className="ch-num">
          {[row.total != null ? `${row.total} strokes` : null, `${row.played} of ${plural(data.numRounds, 'round')}`].filter(Boolean).join(' · ')}
        </span>
      </div>
      <ol className="ch-qf-prounds__list">
        {Array.from({ length: data.numRounds }, (_, i) => i + 1).map((n) => {
          const rd = byNumber.get(n);
          if (!rd && n === playNext && playHref) {
            // Your next round in a live qualifier opens round setup on it (wave 7); the round's course streams in after the board.
            return (
              <li key={n}>
                <Link href={playHref} className="ch-qf-prounds__r is-todo is-play" data-ch-code="CH-09906">
                  {/* Named "Play round 3", then the course: the chip repeats the number, so it is not read. */}
                  <span className="ch-qf-prounds__n" aria-hidden="true">
                    R{n}
                  </span>
                  <span className="ch-qf-prounds__m">
                    <b>Play round {n}</b>
                    <Streamed fallback={null}>
                      {(sec) => {
                        const course = sec.roundCourses.find((c) => c.number === n)?.course ?? data.course;
                        return course ? <small>{course}</small> : null;
                      }}
                    </Streamed>
                  </span>
                  <Icon icon={ArrowRight} size={16} />
                </Link>
              </li>
            );
          }
          if (!rd) {
            return (
              <li key={n} className="ch-qf-prounds__r is-todo">
                <span className="ch-qf-prounds__n">R{n}</span>
                <span className="ch-qf-prounds__m">
                  <b>Still to play</b>
                </span>
              </li>
            );
          }
          const isBest = rd.number === bestNumber;
          const isOpen = shown === rd.id;
          return (
            <li key={n}>
              {/* A round opens in place to its visuals (owner, 2026-10-16: "round detail when you click"). */}
              <button
                type="button"
                className={'ch-qf-prounds__r' + (isBest ? ' is-best' : '') + (isOpen ? ' is-open' : '')}
                aria-expanded={isOpen}
                aria-controls={`ch-qf-rv-${rd.id}`}
                onClick={() => {
                  haptic('select');
                  chTrail('qualifiers open round detail');
                  setShown(isOpen ? null : rd.id);
                }}
              >
                <span className="ch-qf-prounds__n">R{n}</span>
                <span className="ch-qf-prounds__m">
                  <b>{rd.course ?? `Round ${n}`}</b>
                  <small className="ch-num">
                    {dayLabel(rd.date)}
                    {isBest && ' · Best round'}
                  </small>
                </span>
                <span className="ch-qf-prounds__s ch-num">{rd.total ?? '—'}</span>
                <ToParPlate value={rd.toPar} size="card" />
              </button>
              {isOpen && (
                <div className="ch-qf-rv" id={`ch-qf-rv-${rd.id}`}>
                  <Streamed fallback={<div className="ch-qf-rv__wait" aria-busy="true" />}>
                    {(sec) => (
                      <RoundVisual
                        round={rd}
                        holes={sec.holesError ? undefined : (sec.holes[rd.id] ?? [])}
                        field={b.rows.flatMap((r) => r.rounds.filter((x) => x.number === rd.number && x.total != null).map((x) => x.total as number))}
                      />
                    )}
                  </Streamed>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {coach && !picked && !ownOnly && <p className="ch-qf-prounds__hint">Choose a player on the leaderboard to see their rounds here.</p>}
    </section>
  );
}

/** Where a player starts a qualifier's next round: round setup with the qualifier chosen (`?qualifier=`), once it is rebuilt for players. */
export const playRoundHref = (qualifierId: string) => rebuiltHref(`/golf/dashboard/rounds/new?qualifier=${encodeURIComponent(qualifierId)}`, 'player');

export type OpenRow = { get: () => string | null; set: (playerId: string | null) => void; subscribe: (listener: () => void) => () => void };

export function createOpenRow(): OpenRow {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}


/** Hole kinds against par, for the counts under a round's visuals. */
const KINDS: Array<{ key: string; label: string; test: (d: number) => boolean }> = [
  { key: 'eagle', label: 'Eagles', test: (d) => d <= -2 },
  { key: 'birdie', label: 'Birdies', test: (d) => d === -1 },
  { key: 'par', label: 'Pars', test: (d) => d === 0 },
  { key: 'bogey', label: 'Bogeys', test: (d) => d === 1 },
  { key: 'double', label: 'Double+', test: (d) => d >= 2 },
];

/**
 * One round's visuals in the side panel: its shape against par (a bar a hole, up for under par, down for over), the
 * nines as scored marks, the counts by kind, and the way to the whole round.
 */
function RoundVisual({ round, holes, field }: { round: ChQRound; holes: ChQHole[] | undefined; field: number[] }) {
  const full = (
    <Link href={`/golf/dashboard/rounds/${round.id}`} className="ch-qf-rv__link">
      Open the full round
      <Icon icon={ArrowRight} size={14} />
    </Link>
  );
  const vsField = <FieldStrip total={round.total} field={field} number={round.number} />;
  if (holes === undefined || holes.length === 0) {
    return (
      <>
        {vsField}
        <p className="ch-qf-rv__note">{holes === undefined ? 'The hole-by-hole card didn’t load.' : 'Only the total was recorded for this round, so there is no hole-by-hole card.'}</p>
        {full}
      </>
    );
  }
  const sorted = [...holes].sort((a, b) => a.n - b.n);
  const diffs = sorted.map((h) => (h.score == null ? null : h.score - h.par));
  const W = 12;
  const H = 64;
  const mid = H / 2;
  const unit = 11;
  const nine = (from: number, to: number) => {
    const part = sorted.filter((h) => h.n >= from && h.n <= to);
    if (!part.length || part.some((h) => h.score == null)) return null;
    const score = part.reduce((t, h) => t + (h.score as number), 0);
    const par = part.reduce((t, h) => t + h.par, 0);
    return { score, toPar: score - par };
  };
  const out = nine(1, 9);
  const back = nine(10, 18);
  return (
    <>
      {vsField}
      <svg className="ch-qf-rv__shape" viewBox={`0 0 ${sorted.length * W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Round ${round.number} against par, hole by hole`}>
        <line x1={0} x2={sorted.length * W} y1={mid} y2={mid} className="is-par" />
        {sorted.length > 9 && <line x1={9 * W} x2={9 * W} y1={4} y2={H - 4} className="is-turn" />}
        {diffs.map((d, i) => {
          const x = i * W + 2;
          if (d == null) return null;
          if (d === 0) return <circle key={i} cx={x + 4} cy={mid} r={2.2} className="is-even" />;
          const h = Math.min(2.5, Math.abs(d)) * unit;
          return <rect key={i} x={x} width={8} rx={2} y={d < 0 ? mid - h : mid} height={h} className={d < 0 ? 'is-under' : 'is-over'} />;
        })}
      </svg>
      <div className="ch-qf-rv__nines">
        {[
          { label: 'Out', from: 1, to: 9, sum: out },
          { label: 'In', from: 10, to: 18, sum: back },
        ]
          .filter((g) => sorted.some((h) => h.n >= g.from && h.n <= g.to))
          .map((g) => (
            <div key={g.label} className="ch-qf-rv__nine">
              <div className="ch-qf-rv__holes">
                {sorted
                  .filter((h) => h.n >= g.from && h.n <= g.to)
                  .map((h) => (
                    <span key={h.n} className="ch-qf-rv__hole">
                      <small className="ch-num">{h.n}</small>
                      <ScoreMark score={h.score} par={h.par} size="sm" />
                    </span>
                  ))}
              </div>
              <span className="ch-qf-rv__sum ch-num">
                <small>{g.label}</small>
                {g.sum ? g.sum.score : '—'}
              </span>
            </div>
          ))}
      </div>
      <ul className="ch-qf-rv__counts">
        {KINDS.map((k) => {
          const c = diffs.filter((d) => d != null && k.test(d)).length;
          return c > 0 ? (
            <li key={k.key} className={`is-${k.key}`}>
              <b className="ch-num">{c}</b>
              {k.label}
            </li>
          ) : null;
        })}
      </ul>
      {full}
    </>
  );
}

/**
 * The round against the field that round: where it ranked, the field's average, and every score that round as a dot on
 * one line with this one lit. The other dots carry no names (a player sees only their own rounds named).
 */
function FieldStrip({ total, field, number }: { total: number | null; field: number[]; number: number }) {
  if (total == null || field.length < 2) return null;
  const lo = Math.min(...field);
  const hi = Math.max(...field);
  const span = Math.max(1, hi - lo);
  const rank = field.filter((t) => t < total).length + 1;
  const tied = field.filter((t) => t === total).length > 1;
  const avg = field.reduce((a, t) => a + t, 0) / field.length;
  const at = (t: number) => `${((t - lo) / span) * 100}%`;
  const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
  return (
    <div className="ch-qf-rv__field">
      <div className="ch-qf-rv__fieldhead">
        <b className="ch-num">
          {tied ? 'T' : ''}
          {ord(rank)}
        </b>
        <span className="ch-num">
          of {field.length} in round {number} · field average {formatFixed(avg)}
        </span>
      </div>
      <div className="ch-qf-rv__strip" role="img" aria-label={`${total}, ${tied ? 'tied ' : ''}${ord(rank)} of ${field.length} in round ${number}; field average ${formatFixed(avg)}`}>
        <i className="ch-qf-rv__avg" style={{ left: at(avg) }} />
        {field.map((t, i) => (
          <i key={i} className="ch-qf-rv__dot" style={{ left: at(t) }} />
        ))}
        <i className="ch-qf-rv__dot is-me" style={{ left: at(total) }} />
      </div>
      <div className="ch-qf-rv__scale ch-num">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
