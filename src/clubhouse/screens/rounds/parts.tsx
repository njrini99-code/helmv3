'use client';

import Link from 'next/link';
import { ArrowRight, Trash2 } from 'lucide-react';
import type { ChLibraryRound, ChRoundsSeason, ChRoundType, ChTeeColor, ChUnfinishedRound } from '../../data/rounds-shape';
import { formatFixed, formatToPar, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';

/** A calendar date (yyyy-mm-dd) as a Date at noon UTC, so no zone moves it a day. */
export const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o });
export const monthLabel = (iso: string) => fmt({ month: 'long', year: 'numeric' }).format(dateOf(iso));
export const shortDay = (iso: string) => fmt({ month: 'short', day: 'numeric' }).format(dateOf(iso));
const dow = (iso: string) => fmt({ weekday: 'short' }).format(dateOf(iso));

export const TYPE_LABEL: Record<ChRoundType, string> = { practice: 'Practice', tournament: 'Tournament', qualifier: 'Qualifier' };

export function TeeSwatch({ color }: { color: ChTeeColor | null }) {
  return color ? <i className={`ch-rd-tee ch-rd-tee--${color}`} aria-hidden="true" /> : null;
}

export function TypePill({ type }: { type: ChRoundType | null }) {
  return type ? <span className={`ch-rd-pill is-${type}`}>{TYPE_LABEL[type]}</span> : null;
}

/** The in-progress card's hole strip: scored holes marked against par, the next hole ringed. CH-11802: hidden from screen readers; the card says it in words. */
function Strip({ holes, played, next }: { holes: number; played: ChUnfinishedRound['played']; next: number | null }) {
  const byHole = new Map(played.map((h) => [h.n, h]));
  return (
    <div className={'ch-rd-strip' + (holes === 9 ? ' is-nine' : '')} aria-hidden="true">
      {Array.from({ length: holes }, (_, i) => {
        const n = i + 1;
        const h = byHole.get(n);
        if (h) {
          const cls = h.par == null ? 'is-par' : h.score < h.par ? 'is-under' : h.score > h.par ? 'is-over' : 'is-par';
          return (
            <span key={n} className={cls}>
              {h.score}
            </span>
          );
        }
        return (
          <span key={n} className={n === next ? 'is-next' : undefined}>
            {n === next ? n : ''}
          </span>
        );
      })}
    </div>
  );
}

/** The one round in progress (rounds-flow.jsx `rf-unf`), or the idle card when there is none. */
export function UnfinishedCard({
  round,
  error,
  todayIso,
  last,
  continueHref,
  startHref,
  onRetry,
  onDiscard,
}: {
  round: ChUnfinishedRound | null;
  error: boolean;
  todayIso: string;
  last: ChLibraryRound | null;
  continueHref: string | null;
  startHref: string | null;
  onRetry: () => void;
  onDiscard: (r: ChUnfinishedRound) => void;
}) {
  if (error) {
    return (
      <div className="ch-rd-unf is-idle">
        <InlineNotice code="CH-11202" title="Couldn't check for a round in progress" body="Any round you started is still saved. Try again in a moment." onRetry={onRetry} />
      </div>
    );
  }
  if (!round) {
    return (
      <div className="ch-rd-unf is-idle" data-ch-code="CH-11304">
        <div className="ch-rd-unf__top">
          <span className="ch-rd-unf__k is-idle">
            <i />
            No round in progress
          </span>
        </div>
        <b className="ch-rd-unf__c">Ready when you are.</b>
        <span className="ch-rd-unf__m">Start a round and track every shot. It saves as you go, so you can pick it back up here.</span>
        <div className="ch-rd-strip is-ghost" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div className="ch-rd-unf__f">
          <span>
            {last ? (
              <>
                Last round <b>{shortDay(last.date)}</b> · {last.course}
              </>
            ) : (
              'No rounds posted yet'
            )}
          </span>
          {startHref && (
            // CH-11703: Start a round, Continue and Submit are primary taps (light).
            <Link href={startHref} className="ch-rd-unf__cta" onClick={() => haptic('press')}>
              Start a round
              <Icon icon={ArrowRight} size={15} />
            </Link>
          )}
        </div>
      </div>
    );
  }
  const started = round.date === todayIso ? 'Today' : shortDay(round.date);
  const thru = round.played.length;
  const cta = round.readyToSubmit ? 'Submit round' : round.nextHole ? `Continue at hole ${round.nextHole}` : 'Continue';
  return (
    <div className="ch-rd-unf">
      <div className="ch-rd-unf__top">
        <span className="ch-rd-unf__k">
          <i />
          {round.readyToSubmit ? 'Ready to submit' : 'In progress'}
        </span>
        <span className="ch-rd-unf__t">{started}</span>
      </div>
      <b className="ch-rd-unf__c">{round.course}</b>
      <span className="ch-rd-unf__m">{[round.tee, round.type ? TYPE_LABEL[round.type] : null, `${round.holes} holes`].filter(Boolean).join(' · ')}</span>
      <Strip holes={round.holes} played={round.played} next={round.nextHole} />
      <div className="ch-rd-unf__f">
        <span>
          {thru ? (
            <>
              <b className="ch-num">{formatToPar(round.toParThru)}</b> through {thru}
            </>
          ) : (
            'Set up, no holes scored yet'
          )}
        </span>
        <span className="ch-rd-unf__acts">
          <button type="button" className="ch-rd-unf__discard" onClick={() => onDiscard(round)} aria-label={`Discard the round at ${round.course}`}>
            <Icon icon={Trash2} size={14} />
          </button>
          {continueHref && (
            <Link href={continueHref} className="ch-rd-unf__cta" onClick={() => haptic('press')}>
              {cta}
              <Icon icon={ArrowRight} size={15} />
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}

/** Strokes over par for each round, oldest to newest, against the dashed average (rounds-flow.jsx `Ribbon`). CH-11803: one labelled image; each bar has a title. */
export function Ribbon({ rounds, avg }: { rounds: ChRoundsSeason['ribbon']; avg: number }) {
  const maxOver = Math.max(1, ...rounds.map((x) => x.toPar));
  const maxUnder = Math.max(0, ...rounds.map((x) => -x.toPar));
  const W = 640,
    L = 40,
    R = 100,
    u = Math.min(20, 160 / (maxOver + maxUnder)),
    top = 16;
  const base = top + maxOver * u;
  const H = base + maxUnder * u + 40;
  const bw = (W - L - R) / Math.max(rounds.length, 1);
  const y = (d: number) => base - d * u;
  const step = maxOver + maxUnder > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = -maxUnder; v <= maxOver; v++) if (v % step === 0) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ch-rd-rib" role="img" aria-label={`Strokes over par for your last ${rounds.length} rounds, oldest to newest; average ${formatToPar(avg, 1)}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'is-par' : undefined} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className={'ch-rd-rib__t' + (v === 0 ? ' is-par' : '')}>
            {v === 0 ? 'Par' : formatToPar(v)}
          </text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} className="ch-rd-rib__avg" />
      <g transform={`translate(${W - R + 8},${y(avg)})`}>
        <rect x="0" y="-10" width="86" height="20" rx="10" className="ch-rd-rib__chip" />
        <text x="43" y="4" textAnchor="middle" className="ch-rd-rib__t is-avg">
          Your avg {formatToPar(avg, 1)}
        </text>
      </g>
      {rounds.map((x, i) => {
        const d = x.toPar;
        const cx = L + bw * i + bw / 2;
        const h = Math.max(3, Math.abs(d) * u);
        const y0 = d >= 0 ? base - h : base;
        const cls = d < 0 ? 'is-under' : d === 0 ? 'is-even' : x.type === 'qualifier' ? 'is-q' : 'is-over';
        return (
          <g key={x.id}>
            <title>{`${shortDay(x.date)} · ${x.score} (${formatToPar(d)})${x.type ? ` · ${TYPE_LABEL[x.type]}` : ''}`}</title>
            <rect x={cx - bw * 0.26} y={d === 0 ? base - 1.5 : y0} width={bw * 0.52} height={d === 0 ? 3 : h} rx="4" className={cls} />
            <text x={cx} y={d >= 0 ? base - h - 6 : base + h + 13} textAnchor="middle" className={'ch-rd-rib__v' + (d < 0 ? ' is-under' : '')}>
              {x.score}
            </text>
            <text x={cx} y={H - 18} textAnchor="middle" className="ch-rd-rib__d">
              {dateOf(x.date).getUTCDate()}
            </text>
            <text x={cx} y={H - 5} textAnchor="middle" className="ch-rd-rib__t">
              {fmt({ month: 'short' }).format(dateOf(x.date))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Season scoring (rounds-flow.jsx `rf-season`): average, best, putts and greens, then the ribbon. */
export function SeasonCard({ season }: { season: ChRoundsSeason }) {
  if (!season.rounds) {
    return (
      <section className="ch-rd-season is-empty" aria-labelledby="ch-rd-season-k" data-ch-code="CH-11302">
        <span className="ch-rd-k" id="ch-rd-season-k">
          Season scoring
        </span>
        <b className="ch-rd-season__none">Your season starts with your first 18-hole round.</b>
        <span className="ch-rd-season__nonebody">Scoring average, best round, putts and greens fill in here from 18-hole rounds posted since August 1.</span>
      </section>
    );
  }
  const figs: Array<[string, string, string]> = [
    ['Best', season.best ? String(season.best.score) : NO_DATA, season.best ? `${season.best.course.split(' ')[0]} · ${shortDay(season.best.date)}` : ''],
    ['Putts', formatFixed(season.putts, 1), 'per round'],
    ['GIR', season.girPct == null ? NO_DATA : `${Math.round(season.girPct)}%`, season.girPer18 == null ? '' : `${formatFixed(season.girPer18, 1)} of 18`],
  ];
  const under = season.ribbon.some((x) => x.toPar < 0);
  const q = season.ribbon.some((x) => x.type === 'qualifier');
  return (
    <section className="ch-rd-season" aria-labelledby="ch-rd-season-k">
      <div className="ch-rd-season__h">
        <div>
          <span className="ch-rd-k" id="ch-rd-season-k">
            Season scoring
          </span>
          <div className="ch-rd-season__big">
            <b className="ch-num">{formatFixed(season.avg, 1)}</b>
            <em>avg · {formatToPar(season.toPar, 1)} to par</em>
          </div>
        </div>
        <dl className="ch-rd-season__f">
          {figs.map(([k, v, m]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="ch-num">{v}</dd>
              <span>{m}</span>
            </div>
          ))}
        </dl>
      </div>
      {season.ribbon.length >= 2 && season.toPar != null && (
        <>
          <div className="ch-rd-season__ch">
            <b>Every round vs par</b>
            <span>Bar height is strokes over par · the number on top is your score · shorter is better</span>
          </div>
          <Ribbon rounds={season.ribbon} avg={season.toPar} />
          <div className="ch-rd-season__lg">
            {under && (
              <span>
                <i className="is-under" />
                Under par
              </span>
            )}
            <span>
              <i className="is-over" />
              Over par
            </span>
            {q && (
              <span>
                <i className="is-q" />
                Qualifier
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Meter({ label, value, pct, muted }: { label: string; value: string; pct: number | null; muted?: boolean }) {
  return (
    <span className="ch-rd-meter">
      <em>{label}</em>
      <span className={'ch-rd-meter__t' + (muted ? ' is-p' : '')}>{pct != null && <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />}</span>
      <b className="ch-num">{value}</b>
    </span>
  );
}

/**
 * One round in the book (rounds-flow.jsx `rf-sc`): date, course and tee, Out · In · Tot, the three meters, to par.
 * CH-11801: one link (or one group) named for the round. CH-11702: opening it is a selection tap.
 */
export function RoundRow({ r, href }: { r: ChLibraryRound; href: string | null }) {
  const under = r.toPar != null && r.toPar < 0;
  const body = (
    <>
      <span className="ch-rd-sc__date">
        <b className="ch-num">{dateOf(r.date).getUTCDate()}</b>
        <em>{dow(r.date)}</em>
      </span>
      <span className="ch-rd-sc__c">
        <b>{r.course}</b>
        <span>
          <TeeSwatch color={r.teeColor} />
          {r.tee ?? `${r.holes} holes`}
          <TypePill type={r.type} />
          {!r.countable && <span className="ch-rd-pill is-nc">Not counted</span>}
        </span>
      </span>
      <span className="ch-rd-sc__grid" aria-label={r.inn != null ? `Out ${r.out ?? NO_DATA}, in ${r.inn}, total ${r.score}` : `${r.holes} holes, total ${r.score}`}>
        {r.holes === 18 ? (
          <>
            <span>
              <em>Out</em>
              <b className="ch-num">{r.out ?? NO_DATA}</b>
            </span>
            <span>
              <em>In</em>
              <b className="ch-num">{r.inn ?? NO_DATA}</b>
            </span>
          </>
        ) : (
          <span>
            <em>Holes</em>
            <b className="ch-num">{r.holes}</b>
          </span>
        )}
        <span className="is-tot">
          <em>Tot</em>
          <b className="ch-num">{r.score}</b>
        </span>
      </span>
      <span className="ch-rd-sc__m">
        <Meter label="Fairways" value={r.fairways ? `${r.fairways.hit}/${r.fairways.of}` : NO_DATA} pct={r.fairways ? (r.fairways.hit / r.fairways.of) * 100 : null} />
        <Meter label="Greens" value={r.greens ? `${r.greens.hit}/${r.greens.of}` : NO_DATA} pct={r.greens ? (r.greens.hit / r.greens.of) * 100 : null} />
        {/* Fewer putts fills more: 36 per 18 is empty, 26 is full (the board's scale). */}
        <Meter label="Putts" value={r.putts == null ? NO_DATA : String(r.putts)} pct={r.putts == null ? null : ((36 - r.putts * (18 / r.holes)) / 10) * 100} muted />
      </span>
      <span className={'ch-rd-sc__s' + (under ? ' is-under' : '')}>
        <b className="ch-num">{formatToPar(r.toPar)}</b>
        <em className="ch-num">{r.score}</em>
      </span>
    </>
  );
  const label = `${shortDay(r.date)}, ${r.course}, ${r.score}${r.toPar != null ? ` (${formatToPar(r.toPar)})` : ''}`;
  return href ? (
    <Link href={href} className={'ch-rd-sc' + (under ? ' is-under' : '')} aria-label={label} onClick={() => haptic('select')}>
      {body}
    </Link>
  ) : (
    <div className={'ch-rd-sc is-static' + (under ? ' is-under' : '')} role="group" aria-label={label}>
      {body}
    </div>
  );
}
