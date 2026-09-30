'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Flag, Sparkles } from 'lucide-react';
import { distribution, type ChReviewHole, type ChRoundReview } from '../../data/round-review-shape';
import { formatFixed, formatToPar, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { ScoreMark } from '../../ui/ScoreMark';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { dateOf, TeeSwatch, TYPE_LABEL } from './parts';

const LIE_LABEL: Record<string, string> = { fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', hole: 'Holed', penalty: 'Penalty', other: 'Other', tee: 'Tee' };
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o });
const pct = (hit: number, of: number) => `${Math.round((hit / of) * 100)}%`;

/** Where "back" goes: the player's Rounds, or for a coach, that player's rounds on Stats (D-53). */
export function reviewBack(r: ChRoundReview): { label: string; href: string } {
  return r.playerName ? { label: r.playerName, href: `/golf/dashboard/stats?player=${r.playerId}&tab=rounds` } : { label: 'Rounds', href: '/golf/dashboard/rounds' };
}

/** The hole a review opens on: the first one over par (the board's choice), else the first. */
export function firstHole(holes: ChReviewHole[]): number {
  return holes.find((h) => h.score != null && h.par != null && h.score > h.par)?.n ?? holes[0]?.n ?? 1;
}

function Mark({ v }: { v: boolean | null }) {
  if (v == null) return <i className="ch-rv-yn is-na" aria-label="Not applicable" />;
  return <i className={'ch-rv-yn' + (v ? ' is-y' : ' is-n')} aria-label={v ? 'Hit' : 'Missed'} />;
}

/**
 * One nine of the review's card: tap a hole number to see its shots. CH-11704: a pick is a selection tap.
 * CH-11804: a captioned table, a pressed button per hole, and marks read as Hit, Missed or Not applicable.
 */
function ReviewNine({ label, holes, sel, onPick }: { label: 'Out' | 'In'; holes: ChReviewHole[]; sel: number; onPick: (n: number) => void }) {
  if (!holes.length) return null;
  const sum = (k: 'par' | 'score' | 'putts') => (holes.every((h) => h[k] != null) ? holes.reduce((a, h) => a + (h[k] as number), 0) : null);
  const pick = (n: number) => () => {
    haptic('select');
    onPick(n);
  };
  return (
    <table className="ch-rv-nine ch-num">
      <caption className="ch-sr-only">{label === 'Out' ? 'Front nine' : 'Back nine'}: score, putts, fairways and greens by hole</caption>
      <thead>
        <tr>
          <th scope="col">{label}</th>
          {holes.map((h) => (
            <th key={h.n} scope="col">
              <button type="button" className={h.n === sel ? 'is-sel' : undefined} aria-pressed={h.n === sel} aria-label={`Hole ${h.n}`} onClick={pick(h.n)}>
                {h.n}
              </button>
            </th>
          ))}
          <th scope="col">Tot</th>
        </tr>
      </thead>
      <tbody>
        <tr className="is-par">
          <th scope="row">Par</th>
          {holes.map((h) => (
            <td key={h.n}>{h.par ?? NO_DATA}</td>
          ))}
          <td>{sum('par') ?? NO_DATA}</td>
        </tr>
        <tr className="is-score">
          <th scope="row">Score</th>
          {holes.map((h) => (
            <td key={h.n} className={h.n === sel ? 'is-sel' : undefined}>
              <ScoreMark score={h.score} par={h.par} size="sm" />
            </td>
          ))}
          <td>
            <b>{sum('score') ?? NO_DATA}</b>
          </td>
        </tr>
        <tr>
          <th scope="row">Putts</th>
          {holes.map((h) => (
            <td key={h.n} className={h.putts != null && h.putts >= 3 ? 'is-warn' : undefined}>
              {h.putts ?? NO_DATA}
            </td>
          ))}
          <td>{sum('putts') ?? NO_DATA}</td>
        </tr>
        <tr className="is-marks">
          <th scope="row">FIR</th>
          {holes.map((h) => (
            <td key={h.n}>
              <Mark v={h.fairway} />
            </td>
          ))}
          <td />
        </tr>
        <tr className="is-marks">
          <th scope="row">GIR</th>
          {holes.map((h) => (
            <td key={h.n}>
              <Mark v={h.gir} />
            </td>
          ))}
          <td />
        </tr>
      </tbody>
    </table>
  );
}

function HoleCard({ hole, count, shotsError, onStep, onRetry }: { hole: ChReviewHole; count: number; shotsError: boolean; onStep: (d: -1 | 1) => void; onRetry: () => void }) {
  const title = [`Hole ${hole.n}`, hole.par != null ? `Par ${hole.par}` : null, hole.yards ? `${hole.yards} yds` : null].filter(Boolean).join(' · ');
  const strokes = hole.shots.filter((s) => !s.penalty).length;
  return (
    <section className="ch-rv-card ch-rv-hole" aria-labelledby="ch-rv-hole-h" aria-live="polite">
      <div className="ch-rv-card__h">
        <div>
          <h3 id="ch-rv-hole-h">{title}</h3>
          <span>
            {[
              strokes ? `${strokes} ${strokes === 1 ? 'shot' : 'shots'}` : null,
              hole.putts != null ? `${hole.putts} ${hole.putts === 1 ? 'putt' : 'putts'}` : null,
              hole.penalties ? `${hole.penalties} penalty` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Scored as a total'}
          </span>
        </div>
        <div className="ch-rv-step">
          <button type="button" onClick={() => onStep(-1)} disabled={hole.n <= 1} aria-label="Previous hole">
            <Icon icon={ChevronLeft} size={16} />
          </button>
          <ScoreMark score={hole.score} par={hole.par} />
          <button type="button" onClick={() => onStep(1)} disabled={hole.n >= count} aria-label="Next hole">
            <Icon icon={ChevronRight} size={16} />
          </button>
        </div>
      </div>
      {shotsError ? (
        <InlineNotice code="CH-11205" title="The shots for this round didn't load" body="The scorecard is right; only the shot-by-shot detail is missing. Try again in a moment." onRetry={onRetry} />
      ) : hole.shots.length === 0 ? (
        <p className="ch-rv-none" data-ch-code="CH-11306">
          No shots were tracked on this hole. It was scored as a total.
        </p>
      ) : (
        <ol className="ch-rv-shots">
          {hole.shots.map((s) => (
            <li key={s.n} className={s.penalty ? 'is-pen' : undefined}>
              <span className={`ch-rv-shots__n is-${s.lie}`}>{s.penalty ? '+1' : s.n}</span>
              <div>
                <b>{[s.kind, s.club].filter(Boolean).join(' · ')}</b>
                <span>
                  {s.penalty ? 'Penalty stroke' : [s.from, s.lie === 'hole' ? 'holed' : [LIE_LABEL[s.lie]?.toLowerCase(), s.to].filter(Boolean).join(', ')].filter(Boolean).join(' → ')}
                  {s.miss ? ` · ${s.miss}` : ''}
                </span>
                {s.read && <em>{s.read}</em>}
              </div>
              <span className={`ch-rv-lie is-${s.lie}`}>{LIE_LABEL[s.lie]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * A round's review (P011; design/handoff/rounds-review.jsx). The player sees
 * their own round; a coach sees a player's round from Stats. The hero, the
 * five figures, the card (tap a hole for its shots), the scoring
 * distribution, the recap and the player's notes.
 */
export function RoundReview({ review }: { review: ChRoundReview }) {
  const phone = useChPhone();
  const router = useRouter();
  const r = review;
  const [sel, setSel] = useState(() => firstHole(r.holes));
  const hole = r.holes.find((h) => h.n === sel) ?? r.holes[0] ?? null;
  const dist = useMemo(() => distribution(r.holes), [r.holes]);
  const maxD = Math.max(1, ...dist.map((d) => d.count));
  const back = reviewBack(r);
  const under = r.toPar != null && r.toPar < 0;
  const kicker = [r.playerName, `${fmt({ weekday: 'short' }).format(dateOf(r.date))} ${fmt({ month: 'short', day: 'numeric' }).format(dateOf(r.date))}`, r.type ? TYPE_LABEL[r.type] : null]
    .filter(Boolean)
    .join(' · ');
  const step = (d: -1 | 1) => {
    const i = r.holes.findIndex((h) => h.n === sel);
    const next = r.holes[i + d];
    if (next) {
      haptic('select');
      setSel(next.n);
    }
  };
  const refresh = () => router.refresh();
  const figs: Array<[string, string, string]> = [
    ['Front 9', r.front.score == null ? NO_DATA : String(r.front.score), r.front.toPar == null ? '' : formatToPar(r.front.toPar)],
    ...(r.holesPlayed === 18 ? ([['Back 9', r.back.score == null ? NO_DATA : String(r.back.score), r.back.toPar == null ? '' : formatToPar(r.back.toPar)]] as Array<[string, string, string]>) : []),
    ['Putts', r.putts == null ? NO_DATA : String(r.putts), r.putts == null ? '' : `${formatFixed(r.putts / r.holesPlayed, 1)} / hole`],
    ['Fairways', r.fairways ? `${r.fairways.hit}/${r.fairways.of}` : NO_DATA, r.fairways ? pct(r.fairways.hit, r.fairways.of) : ''],
    ['Greens', r.greens ? `${r.greens.hit}/${r.greens.of}` : NO_DATA, r.greens ? pct(r.greens.hit, r.greens.of) : ''],
  ];

  return (
    <main className={'ch-rv' + (phone ? ' is-phone' : '')} aria-labelledby="ch-rv-title">
      {phone && <PhoneTop title="Round" back={{ label: r.playerName ? 'Stats' : 'Rounds', onBack: () => router.push(back.href) }} />}
      {!phone && (
        <Link href={back.href} className="ch-rv-back">
          <Icon icon={ChevronLeft} size={16} />
          {back.label}
        </Link>
      )}
      <header className="ch-rv-hero">
        <div className="ch-rv-hero__l">
          <span className="ch-rv-hero__k">{kicker}</span>
          <h1 id="ch-rv-title">{r.course}</h1>
          {(r.tee || r.teeFacts) && (
            <span className="ch-rv-hero__m">
              <TeeSwatch color={r.teeColor} />
              <span>{[r.tee, r.teeFacts].filter(Boolean).join(' · ')}</span>
            </span>
          )}
        </div>
        <div className="ch-rv-hero__s">
          <b className="ch-num">{r.score}</b>
          <em className={'ch-num' + (under ? ' is-under' : '')}>{formatToPar(r.toPar)}</em>
          <span>{r.holesPlayed === 9 ? 'Strokes · 9 holes' : 'Strokes'}</span>
        </div>
      </header>

      <dl className="ch-rv-figs">
        {figs.map(([k, v, m]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="ch-num">{v}</dd>
            <span className="ch-num">{m}</span>
          </div>
        ))}
      </dl>

      {r.holesError ? (
        <InlineNotice code="CH-11204" title="The scorecard didn't load" body="The round's totals are right; the hole-by-hole card is missing. Try again in a moment." onRetry={refresh} />
      ) : r.holes.length === 0 ? (
        <EmptyState code="CH-11305" compact icon={Flag} title="Posted as a total" body="This round was posted with its score only, so there's no hole-by-hole card or shots to show." />
      ) : (
        <>
          <SectionBoundary surface="rounds.review.card" label="The scorecard" code="CH-11203">
            <section className="ch-rv-card" aria-labelledby="ch-rv-card-h">
              <div className="ch-rv-card__h">
                <div>
                  <h2 id="ch-rv-card-h">Scorecard</h2>
                  <span>Tap a hole to see every shot</span>
                </div>
              </div>
              <div className="ch-rv-cardw">
                <ReviewNine label="Out" holes={r.holes.filter((h) => h.n <= 9)} sel={sel} onPick={setSel} />
                <ReviewNine label="In" holes={r.holes.filter((h) => h.n > 9)} sel={sel} onPick={setSel} />
              </div>
            </section>
          </SectionBoundary>
          <div className="ch-rv-cols">
            <SectionBoundary surface="rounds.review.hole" label="This hole" code="CH-11203">
              {hole && <HoleCard hole={hole} count={r.holes[r.holes.length - 1]?.n ?? 18} shotsError={r.shotsError} onStep={step} onRetry={refresh} />}
            </SectionBoundary>
            <div className="ch-rv-side">
              <section className="ch-rv-card" aria-labelledby="ch-rv-dist-h">
                <div className="ch-rv-card__h">
                  <div>
                    <h3 id="ch-rv-dist-h">Scoring distribution</h3>
                    <span className="ch-num">{r.holes.filter((h) => h.score != null).length} holes</span>
                  </div>
                </div>
                <div className="ch-rv-dist">
                  {dist.map((d) => (
                    <div key={d.label} className={`ch-rv-dist__r is-${d.label.replace('+', '').toLowerCase()}`}>
                      <span>{d.label}</span>
                      <span className="ch-rv-dist__t">
                        <i style={{ width: `${(d.count / maxD) * 100}%` }} />
                      </span>
                      <b className="ch-num">{d.count}</b>
                    </div>
                  ))}
                </div>
              </section>
              {r.recap && (
                <section className="ch-rv-recap" aria-labelledby="ch-rv-recap-k">
                  <span className="ch-rv-recap__k" id="ch-rv-recap-k">
                    <Icon icon={Sparkles} size={14} />
                    Round recap
                  </span>
                  <p>{r.recap}</p>
                </section>
              )}
              {r.notes && (
                <section className="ch-rv-card ch-rv-notes" aria-labelledby="ch-rv-notes-h">
                  <div className="ch-rv-card__h">
                    <div>
                      <h3 id="ch-rv-notes-h">{r.playerName ? `${r.playerName.split(' ')[0]}'s notes` : 'Your notes'}</h3>
                      <span>Written when the round was posted</span>
                    </div>
                  </div>
                  <p>{r.notes}</p>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
