'use client';

import { useId, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Trash2 } from 'lucide-react';
import type { ChLibraryRound, ChRoundsSeason, ChRoundType, ChTeeColor, ChUnfinishedRound } from '../../data/rounds-shape';
import { formatFixed, formatToPar, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useInViewOnce } from '../../lib/use-in-view';
import { InlineNotice } from '../../ui/Notices';
import { withPointSpan } from '../../ui/point-span';
import type { ContextMenuBind } from '../../ui/ContextMenu';
import { Icon } from '../../ui/Icon';

import { dateOf, TYPE_LABEL } from './labels';

export { dateOf, TYPE_LABEL };
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o });
export const monthLabel = (iso: string) => fmt({ month: 'long', year: 'numeric' }).format(dateOf(iso));
export const shortDay = (iso: string) => fmt({ month: 'short', day: 'numeric' }).format(dateOf(iso));
const dow = (iso: string) => fmt({ weekday: 'short' }).format(dateOf(iso));

export function TeeSwatch({ color }: { color: ChTeeColor | null }) {
  return color ? <i className={`ch-rd-tee ch-rd-tee--${color}`} aria-hidden="true" /> : null;
}

export function TypePill({ type }: { type: ChRoundType | null }) {
  return type ? <span className={`ch-rd-pill is-${type}`}>{TYPE_LABEL[type]}</span> : null;
}

/** The strip with no scores drawn: the hole numbers, faint (the idle card, and a card whose holes didn't load: it says nothing about what is scored). */
function GhostStrip({ holes }: { holes: number }) {
  return (
    <div className={'ch-rd-strip is-ghost' + (holes === 9 ? ' is-nine' : '')} aria-hidden="true">
      {Array.from({ length: holes }, (_, i) => (
        <span key={i}>{i + 1}</span>
      ))}
    </div>
  );
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
            // D15: the hole's number over its score, so "4" on hole 1 never reads as hole 4.
            <span key={n} className={cls + ' is-played'}>
              <em>{n}</em>
              {h.score}
            </span>
          );
        }
        return (
          // Unplayed holes show their number, faint, so the strip reads as the round's 18 holes.
          <span key={n} className={n === next ? 'is-next' : undefined}>
            {n}
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
  listFailed = false,
  continueHref,
  startHref,
  onRetry,
  retrying = false,
  onDiscard,
  menu,
}: {
  round: ChUnfinishedRound | null;
  error: boolean;
  todayIso: string;
  last: ChLibraryRound | null;
  /** The posted rounds didn't load: `last` is unknown, not "none", so the idle card says nothing about the last round. */
  listFailed?: boolean;
  continueHref: string | null;
  startHref: string | null;
  onRetry: () => void;
  /** The retry is in flight (`useRefresh().refreshing`). */
  retrying?: boolean;
  onDiscard: (r: ChUnfinishedRound) => void;
  /** The round's right-click menu handlers (ui/ContextMenu.tsx); the round in progress only. */
  menu?: ContextMenuBind;
}) {
  if (error) {
    return (
      <div className="ch-rd-unf is-idle">
        <InlineNotice code="CH-11202" title="Couldn’t check for a round in progress" body="Any round you started is still saved. Try again in a moment." onRetry={onRetry} retrying={retrying} />
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
        <b className="ch-rd-unf__c">Ready when you are</b>
        <span className="ch-rd-unf__m">Start a round and track every shot. It saves as you go, so you can pick it back up here.</span>
        <GhostStrip holes={18} />
        <div className="ch-rd-unf__f">
          <span>
            {last ? (
              <>
                Last round <b>{shortDay(last.date)}</b> · {last.course}
              </>
            ) : listFailed ? null : (
              'No rounds posted yet'
            )}
          </span>
          {startHref && (
            // CH-11703: Start a round, Continue and Post round are primary taps (light).
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
  const cta = round.readyToSubmit ? 'Post round' : round.nextHole ? `Continue at hole ${round.nextHole}` : 'Continue';
  return (
    <div className="ch-rd-unf" {...menu}>
      <div className="ch-rd-unf__top">
        <span className="ch-rd-unf__k">
          <i />
          {round.readyToSubmit ? 'Ready to post' : 'In progress'}
        </span>
        <span className="ch-rd-unf__t">{started}</span>
      </div>
      <b className="ch-rd-unf__c">{round.course}</b>
      <span className="ch-rd-unf__m">{[round.tee, round.type ? TYPE_LABEL[round.type] : null, `${round.holes} holes`].filter(Boolean).join(' · ')}</span>
      {round.holesError ? <GhostStrip holes={round.holes} /> : <Strip holes={round.holes} played={round.played} next={round.nextHole} />}
      {round.holesError && <InlineNotice code="CH-11214" title="This round’s scores didn’t load" body="The round is saved. Try again to see how far you are." onRetry={onRetry} retrying={retrying} />}
      {round.submitUnchecked && (
        <InlineNotice
          code="CH-11215"
          title="Couldn’t check whether this round was already posted"
          body="Every hole is scored, but your posted rounds didn’t load, so Post round isn’t offered here yet. Try again."
          onRetry={onRetry}
          retrying={retrying}
        />
      )}
      <div className="ch-rd-unf__f">
        <span>
          {round.holesError ? null : thru ? (
            <>
              <b className="ch-num">{formatToPar(round.toParThru)}</b> through {thru}
            </>
          ) : (
            'Set up, no holes scored yet'
          )}
        </span>
        <span className="ch-rd-unf__acts">
          <button type="button" className="ch-rd-unf__discard" data-ch-press="" onClick={() => onDiscard(round)} aria-label={`Discard the round at ${round.course}`}>
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

/**
 * Strokes over par for each round, oldest to newest, against the dashed average (rounds-flow.jsx `Ribbon`). CH-11803: one labelled
 * image; each bar has a title. Move across it (or touch it) and the round reads out on a card; the bars rise from the par line once,
 * the first time the chart is scrolled into view (`.is-in` on the stage that holds it, rounds.css).
 */
export function Ribbon({ rounds, avg, compact = false }: { rounds: ChRoundsSeason['ribbon']; avg: number; compact?: boolean }) {
  const id = useId();
  const [hover, setHover] = useState<string | null>(null);
  // The card keeps the last round it read while it fades out, so it never empties before it is gone.
  const [last, setLast] = useState<string | null>(null);
  const maxOver = Math.max(1, ...rounds.map((x) => x.toPar));
  const maxUnder = Math.max(0, ...rounds.map((x) => -x.toPar));
  // The phone draws a narrower canvas, so its labels render at a readable size.
  const W = compact ? 380 : 640,
    L = 40,
    R = compact ? 76 : 100,
    u = Math.min(20, 160 / (maxOver + maxUnder)),
    top = 20;
  const base = top + maxOver * u;
  const H = base + maxUnder * u + 40;
  const bw = (W - L - R) / Math.max(rounds.length, 1);
  const y = (d: number) => base - d * u;
  const step = maxOver + maxUnder > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = -maxUnder; v <= maxOver; v++) if (v % step === 0) ticks.push(v);
  const cxOf = (i: number) => L + bw * i + bw / 2;
  const shown = rounds.find((x) => x.id === (hover ?? last)) ?? null;
  const shownAt = shown ? rounds.indexOf(shown) : 0;
  return (
    <div className="ch-rd-rib-w">
      <svg viewBox={`0 0 ${W} ${H}`} className="ch-rd-rib" role="img" aria-label={`Strokes over par for your last ${rounds.length} rounds, oldest to newest; average ${formatToPar(avg, 1)}`} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${id}-u`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ch-rd-under-a)" />
            <stop offset="1" stopColor="var(--ch-rd-under-b)" />
          </linearGradient>
          <linearGradient id={`${id}-o`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--ch-rd-over-a)" />
            <stop offset="1" stopColor="var(--ch-rd-over-b)" />
          </linearGradient>
        </defs>
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
          <rect x="0" y="-11" width={compact ? 64 : 90} height="22" rx="11" className="ch-rd-rib__chip" />
          <text x={compact ? 32 : 45} y="4.5" textAnchor="middle" className="ch-rd-rib__t is-avg">
            {compact ? 'Avg' : 'Your avg'} {formatToPar(avg, 1)}
          </text>
        </g>
        {rounds.map((x, i) => {
          const d = x.toPar;
          const cx = cxOf(i);
          const h = Math.max(3, Math.abs(d) * u);
          const y0 = d >= 0 ? base - h : base;
          // D3: one scoring language, red under par as everywhere else; a qualifier is a gilt outline on any bar.
          const cls = (d < 0 ? 'is-under' : d === 0 ? 'is-even' : 'is-over') + (x.type === 'qualifier' ? ' is-q' : '');
          return (
            <g
              key={x.id}
              className={'ch-rd-rib__g' + (hover === x.id ? ' is-hot' : hover ? ' is-dim' : '')}
              style={{ '--ch-i': i } as CSSProperties}
              onPointerEnter={() => {
                setHover(x.id);
                setLast(x.id);
              }}
            >
              <title>{`${shortDay(x.date)} · ${x.score} (${formatToPar(d)})${x.type ? ` · ${TYPE_LABEL[x.type]}` : ''}`}</title>
              <rect x={cx - bw / 2} y={0} width={bw} height={H} className="ch-rd-rib__hit" />
              <rect
                x={cx - bw * 0.26}
                y={d === 0 ? base - 1.5 : y0}
                width={bw * 0.52}
                height={d === 0 ? 3 : h}
                rx="4"
                className={cls + ' ch-rd-rib__bar' + (d < 0 ? ' is-down' : '')}
                style={d < 0 ? { fill: `url(#${id}-u)` } : d > 0 ? { fill: `url(#${id}-o)` } : undefined}
              />
              <text x={cx} y={base - (d >= 0 ? h : 0) - 7} textAnchor="middle" className={'ch-rd-rib__v' + (d < 0 ? ' is-under' : '')}>
                {x.score}
              </text>
              {/* A day is labelled once, under the first of its rounds: "2 Aug 2 Aug 2 Aug" said nothing (F-57). */}
              {(i === 0 || rounds[i - 1]!.date.slice(0, 10) !== x.date.slice(0, 10)) && (
                <>
                  <text x={cx} y={H - 18} textAnchor="middle" className="ch-rd-rib__d">
                    {dateOf(x.date).getUTCDate()}
                  </text>
                  <text x={cx} y={H - 5} textAnchor="middle" className="ch-rd-rib__t">
                    {fmt({ month: 'short' }).format(dateOf(x.date))}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {shown && (
        <div className="ch-rd-rib__tipx" style={{ '--ch-rd-x': (cxOf(shownAt) / W) * 100 } as CSSProperties} role="presentation" aria-hidden={hover ? undefined : true}>
          <div className={'ch-rd-rib__tip' + (hover ? ' is-on' : '')}>
            <b>
              {shortDay(shown.date)}
              {shown.type ? ` · ${TYPE_LABEL[shown.type]}` : ''}
            </b>
            <span className="ch-num">
              {shown.score} · {formatToPar(shown.toPar)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Season scoring (rounds-flow.jsx `rf-season`): average, best, putts and greens, then the ribbon. */
/** Rounds on the phone's ribbon: the last ten, so each bar and label stays readable. */
export const PHONE_RIBBON = 10;

/**
 * The season's three figures, each drawn, not just stated (owner, 2026-10-06: "random numbers with not great labeling
 * mean little without visuals"). Each has a visual and a reference that needs no invented benchmark:
 *   Best: every season round as a dot on its scoring range, the best lit green, the average ticked.
 *   Putts: a bar against 36, two putts on every green (golf's own baseline), with how far under or over it is.
 *   GIR: the 18 greens of a round, as many lit as the season's greens per 18.
 * dt then the value dd stays first in each pair (the season test reads label, then value).
 */
function SeasonFigures({ season }: { season: ChRoundsSeason }) {
  const scores = season.ribbon.map((x) => x.score);
  const lo = scores.length ? Math.min(...scores) : null;
  const hi = scores.length ? Math.max(...scores) : null;
  const pos = (v: number) => (lo == null || hi == null || hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const putts = season.putts;
  const twoPutt = 36;
  const lit = season.girPer18 == null ? 0 : Math.round(season.girPer18);
  return (
    <dl className="ch-rd-season__f">
      <div className="ch-rd-fig">
        <dt>Best</dt>
        <dd className="ch-num ch-rd-fig__v">{season.best ? String(season.best.score) : NO_DATA}</dd>
        {lo != null && hi != null && hi > lo && (
          <dd className="ch-rd-fig__viz" aria-hidden="true">
            <span className="ch-rd-range">
              {season.ribbon.map((x) => (
                <i key={x.id} className={x.score === lo ? 'is-best' : undefined} style={{ left: `${pos(x.score)}%` }} />
              ))}
              {season.avg != null && <b style={{ left: `${pos(season.avg)}%` }} />}
            </span>
            <span className="ch-rd-range__ends">
              <span className="ch-num">{lo}</span>
              <span className="ch-num">{hi}</span>
            </span>
          </dd>
        )}
        <dd className="ch-rd-fig__m">{season.best ? (
            // D16: the whole course name, cut by the column's ellipsis rather than at its first word. It keeps its words
            // on one line (rounds.css) and the separator ends that line, so a wrapped date never starts with "·".
            <>
              <span className="ch-rd-fig__course">{season.best.course}</span>&nbsp;· {shortDay(season.best.date)}
            </>
          ) : (
            ''
          )}</dd>
      </div>
      <div className="ch-rd-fig">
        <dt>Putts</dt>
        <dd className="ch-num ch-rd-fig__v">{formatFixed(putts, 1)}</dd>
        {putts != null && (
          <dd className="ch-rd-fig__viz" aria-hidden="true">
            <span className="ch-rd-putts">
              <i style={{ '--ch-rd-fill': Math.min(1, putts / 40) } as CSSProperties} />
              <b style={{ left: `${(twoPutt / 40) * 100}%` }} />
            </span>
          </dd>
        )}
        {/* A non-breaking hyphen: "two-" never ends a line on the phone (overnight polish, 2026-10-15). */}
        <dd className="ch-rd-fig__m">
          {putts == null ? 'a round' : `a round · ${formatFixed(Math.abs(twoPutt - putts), 1)} ${putts <= twoPutt ? 'under' : 'over'} two‑putting`}
        </dd>
      </div>
      <div className="ch-rd-fig">
        <dt>GIR</dt>
        <dd className="ch-num ch-rd-fig__v">{season.girPct == null ? NO_DATA : `${Math.round(season.girPct)}%`}</dd>
        {season.girPer18 != null && (
          <dd className="ch-rd-fig__viz" aria-hidden="true">
            <span className="ch-rd-greens">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} className={i < lit ? 'is-hit' : undefined} />
              ))}
            </span>
          </dd>
        )}
        <dd className="ch-rd-fig__m">{season.girPer18 == null ? '' : `${formatFixed(season.girPer18, 1)} of 18 a round`}</dd>
      </div>
    </dl>
  );
}

export function SeasonCard({ season, phone = false }: { season: ChRoundsSeason; phone?: boolean }) {
  if (!season.rounds) {
    return (
      <section className="ch-rd-season is-empty" aria-labelledby="ch-rd-season-k" data-ch-code="CH-11302">
        <span className="ch-rd-k" id="ch-rd-season-k">
          Season scoring
        </span>
        {/* A non-breaking hyphen (U+2011), so the line never breaks "18- / hole". */}
        <b className="ch-rd-season__none">Your season starts with your first {'18\u2011hole'} round</b>
        <span className="ch-rd-season__nonebody">Scoring average, best round, putts and greens fill in here from 18-hole rounds posted since August 1.</span>
      </section>
    );
  }
  return (
    <section className="ch-rd-season" aria-labelledby="ch-rd-season-k">
      <div className="ch-rd-season__h">
        <div>
          <span className="ch-rd-k" id="ch-rd-season-k">
            Season scoring
          </span>
          <div className="ch-rd-season__big">
            <b className="ch-num">{withPointSpan(formatFixed(season.avg, 1))}</b>
            <em>avg · {formatToPar(season.toPar, 1)} to par</em>
          </div>
        </div>
        <SeasonFigures season={season} />
      </div>
      {season.ribbon.length >= 2 && season.toPar != null && <SeasonStage ribbon={season.ribbon} avg={season.toPar} phone={phone} />}
    </section>
  );
}

/**
 * The season's every-round chart on its stage: the title and what the colours mean on one line above the bars. On the desktop the
 * stage is the deep green the round review's pictures sit on; on the phone it stays flat on the page (one green card there).
 * The bars rise from the par line the first time the stage is scrolled into view, and not again.
 */
function SeasonStage({ ribbon, avg, phone }: { ribbon: ChRoundsSeason['ribbon']; avg: number; phone: boolean }) {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const under = ribbon.some((x) => x.toPar < 0);
  const q = ribbon.some((x) => x.type === 'qualifier');
  return (
    <div ref={ref} className={'ch-rd-stage' + (seen ? ' is-in' : '')}>
      <div className="ch-rd-stage__h">
        <div className="ch-rd-season__ch">
          <b>Every round vs par</b>
          <span>Above the line is over par, below it under · lower is better · the number on top is your score</span>
        </div>
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
          {ribbon.some((x) => x.toPar === 0) && (
            <span>
              <i className="is-even" />
              Even
            </span>
          )}
          {q && (
            <span>
              <i className="is-q" />
              Qualifier
            </span>
          )}
        </div>
      </div>
      <Ribbon rounds={phone ? ribbon.slice(-PHONE_RIBBON) : ribbon} avg={avg} compact={phone} />
    </div>
  );
}

/**
 * A month's rounds as a row of small bars, oldest to newest: taller is further over par, red is under it. It reads at a glance
 * whether the month trended down; the figures beside it say the rest. Skipped for fewer than two rounds with a par to read against.
 */
export function MonthSpark({ rounds }: { rounds: ChLibraryRound[] }) {
  const pts = rounds.filter((r): r is ChLibraryRound & { toPar: number } => r.toPar != null).reverse();
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((r) => r.toPar));
  const hi = Math.max(...pts.map((r) => r.toPar));
  return (
    <span className="ch-rd-grp__spark" aria-hidden="true">
      {pts.map((r) => (
        <i key={r.id} className={r.toPar < 0 ? 'is-under' : undefined} style={{ height: `${hi === lo ? 55 : 24 + ((r.toPar - lo) / (hi - lo)) * 76}%` }} />
      ))}
    </span>
  );
}

function Meter({ label, value, pct, muted }: { label: string; value: string; pct: number | null; muted?: boolean }) {
  return (
    <span className="ch-rd-meter">
      <em>{label}</em>
      <span className={'ch-rd-meter__t' + (muted ? ' is-p' : '')}>{pct != null && <i style={{ '--ch-rd-fill': Math.max(0, Math.min(100, pct)) / 100 } as CSSProperties} />}</span>
      <b className="ch-num">{value}</b>
    </span>
  );
}

/**
 * One round in the book (rounds-flow.jsx `rf-sc`): date, course and tee, Out · In · Tot, the three meters, to par.
 * CH-11801: one link (or one group) named for the round. CH-11702: opening it is a selection tap. CH-11601: on the
 * desktop Ledger a round that opens its review takes the row tint on hover (quick) and a deeper one on press, no lift.
 */
export function RoundRow({ r, href, onOpen, bind }: { r: ChLibraryRound; href: string | null; /** Called as the review opens (the library notes it, so the review's Back is a step back). */ onOpen?: () => void; /** The library's right-click menu (desktop). */ bind?: ContextMenuBind }) {
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
          {r.tee && r.holes === 9 && <span className="ch-rd-pill is-nine">9 holes</span>}
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
    <Link
      href={href}
      className={'ch-rd-sc' + (under ? ' is-under' : '')}
      aria-label={label}
      {...bind}
      onClick={(e) => {
        haptic('select');
        // A plain left click only: a new-tab click may copy this tab's storage into a tab with no history behind it.
        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onOpen?.();
      }}
    >
      {body}
    </Link>
  ) : (
    <div className={'ch-rd-sc is-static' + (under ? ' is-under' : '')} role="group" aria-label={label}>
      {body}
    </div>
  );
}
