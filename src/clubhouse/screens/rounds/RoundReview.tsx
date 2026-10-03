'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Flag, Sparkles } from 'lucide-react';
import { distribution, type ChReviewHole, type ChRoundReview } from '../../data/round-review-shape';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { useRefresh } from '../../lib/use-refresh';
import { sgBaseline, sgScale, sgShare } from '../../lib/sg';
import { PhoneTop } from '../../shell/phone-chrome';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { ScoreMark } from '../../ui/ScoreMark';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { dateOf, TeeSwatch, TYPE_LABEL } from './parts';
import { openedFromLibrary } from './return-state';

const LIE_LABEL: Record<string, string> = { fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', hole: 'Holed', penalty: 'Penalty', other: 'Other', tee: 'Tee' };
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o });
const pct = (hit: number, of: number) => `${Math.round((hit / of) * 100)}%`;

/** A coach is looking at a player's round. The loader says so outright; a name alone also means it, for a review built without it (a fixture). */
export const isCoachView = (r: ChRoundReview) => r.coachView ?? r.playerName != null;

/** Where "back" goes: the player's Rounds, or for a coach, that player's rounds on Stats (D-53). */
export function reviewBack(r: ChRoundReview): { label: string; href: string } {
  return isCoachView(r) ? { label: r.playerName ?? 'Stats', href: `/golf/dashboard/stats?player=${r.playerId}&tab=rounds` } : { label: 'Rounds', href: '/golf/dashboard/rounds' };
}

/** CH-11216: what the review's supporting reads (the tee, the coach's read of the player's name) left out, in words. */
function missingDetails(r: ChRoundReview): string {
  const gone = [r.teeError ? 'tee’s yardage' : null, r.playerError ? 'player’s name' : null].filter(Boolean);
  return `The ${gone.join(' and the ')} ${gone.length > 1 ? 'are' : 'is'} missing; the scores are right. Try again in a moment.`;
}

/** The hole a review opens on: the first one over par (the board's choice), else the first. */
export function firstHole(holes: ChReviewHole[]): number {
  return holes.find((h) => h.score != null && h.par != null && h.score > h.par)?.n ?? holes[0]?.n ?? 1;
}

const SG_LEGS: Array<[keyof Omit<NonNullable<ChRoundReview['strokesGained']>, 'total'>, string]> = [
  ['tee', 'Off the tee'],
  ['approach', 'Approach'],
  ['around', 'Around green'],
  ['putting', 'Putting'],
];

/**
 * The round's strokes gained: the total, then the four legs as bars either side of zero on a scale the round
 * sets (its largest value rounded up, at least 1). A round posted without shots has none, and says so in one line.
 */
function StrokesGained({ review: r, onRetry, retrying }: { review: ChRoundReview; onRetry: () => void; retrying: boolean }) {
  const sg = r.strokesGained;
  if (!sg)
    return (
      <p className="ch-rv-nosg" data-ch-code="CH-11313">
        No strokes gained for this round. It is worked out from shots tracked hole by hole.
      </p>
    );
  const baseline = sgBaseline(r.tour);
  const scale = sgScale([sg.total, ...SG_LEGS.map(([k]) => sg[k])]);
  const tone = (v: number | null) => (v == null ? '' : v >= 0 ? ' is-gain' : ' is-loss');
  return (
    <section className="ch-rv-card ch-rv-sg" aria-labelledby="ch-rv-sg-h">
      <div className="ch-rv-card__h">
        <div>
          <h2 id="ch-rv-sg-h">Strokes gained</h2>
          <span>{[r.holesPlayed === 9 ? '9 holes' : null, baseline.vs].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="ch-rv-sg__tot">
          <b className={'ch-num' + tone(sg.total)}>{formatSigned(sg.total)}</b>
          <em>Total</em>
        </div>
      </div>
      {r.tourError && (
        <InlineNotice
          code="CH-11217"
          title="Which Tour this is measured against didn't load"
          body="The strokes gained numbers are the round's own; only the baseline's name is missing. Try again in a moment."
          onRetry={onRetry}
          retrying={retrying}
        />
      )}
      <dl className="ch-rv-sg__legs">
        {SG_LEGS.map(([k, label]) => {
          const v = sg[k];
          return (
            <div key={k} className="ch-rv-sg__r">
              <dt>{label}</dt>
              <dd>
                <span className="ch-rv-sg__bar" aria-hidden="true">
                  <i className="ch-rv-sg__z" />
                  {v != null && <i className={'ch-rv-sg__v' + tone(v)} style={{ [v >= 0 ? 'left' : 'right']: '50%', width: `${sgShare(v, scale) * 50}%` }} />}
                </span>
                <b className={'ch-num' + tone(v)}>{formatSigned(v)}</b>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Mark({ v }: { v: boolean | null }) {
  if (v == null) return <i className="ch-rv-yn is-na" role="img" aria-label="Not applicable" />;
  return <i className={'ch-rv-yn' + (v ? ' is-y' : ' is-n')} role="img" aria-label={v ? 'Hit' : 'Missed'} />;
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
            // The board makes the score the target too: a tap on it selects the hole. Pointer only; the hole number
            // above is the same choice as a button for the keyboard and a screen reader.
            <td key={h.n} data-hole={h.n} className={h.n === sel ? 'is-sel' : undefined} onClick={pick(h.n)}>
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

function HoleCard({
  hole,
  count,
  shotsError,
  onStep,
  onRetry,
  retrying,
}: {
  hole: ChReviewHole;
  count: number;
  shotsError: boolean;
  onStep: (d: -1 | 1) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
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
        <InlineNotice code="CH-11205" title="The shots for this round didn't load" body="The scorecard is right; only the shot-by-shot detail is missing. Try again in a moment." onRetry={onRetry} retrying={retrying} />
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
  const { refresh, refreshing } = useRefresh();
  const r = review;
  // Only a hole the player picked is kept; until then the review opens on the first hole over par of what it has. A card that
  // arrives after a retry therefore opens there, not on the hole 1 an empty card defaulted to.
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? firstHole(r.holes);
  const coach = isCoachView(r);
  const hole = r.holes.find((h) => h.n === sel) ?? r.holes[0] ?? null;
  const dist = useMemo(() => distribution(r.holes), [r.holes]);
  const maxD = Math.max(1, ...dist.map((d) => d.count));
  const back = reviewBack(r);
  // Rule 8: a player's review opened from the library goes back in history, so the library returns with its search and its place
  // (screens/rounds/return-state.ts); anywhere else (a deep link, a reload in a fresh tab, a coach's Stats) it goes to the address as before.
  // A tab with no history behind it (a copied note in a new tab) has nothing to step back to: it goes to the address.
  const stepBack = () => {
    if (coach || window.history.length <= 1 || !openedFromLibrary(r.id)) return false;
    router.back();
    return true;
  };
  const goBack = () => {
    if (!stepBack()) router.push(back.href);
  };
  const under = r.toPar != null && r.toPar < 0;
  const kicker = [r.playerName, `${fmt({ weekday: 'short' }).format(dateOf(r.date))} ${fmt({ month: 'short', day: 'numeric' }).format(dateOf(r.date))}`, r.type ? TYPE_LABEL[r.type] : null]
    .filter(Boolean)
    .join(' · ');
  const step = (d: -1 | 1) => {
    const i = r.holes.findIndex((h) => h.n === sel);
    const next = r.holes[i + d];
    if (next) {
      haptic('select');
      setPicked(next.n);
    }
  };
  const figs: Array<[string, string, string]> = [
    ['Front 9', r.front.score == null ? NO_DATA : String(r.front.score), r.front.toPar == null ? '' : formatToPar(r.front.toPar)],
    ...(r.holesPlayed === 18 ? ([['Back 9', r.back.score == null ? NO_DATA : String(r.back.score), r.back.toPar == null ? '' : formatToPar(r.back.toPar)]] as Array<[string, string, string]>) : []),
    ['Putts', r.putts == null ? NO_DATA : String(r.putts), r.putts == null ? '' : `${formatFixed(r.putts / r.holesPlayed, 1)} / hole`],
    ['Fairways', r.fairways ? `${r.fairways.hit}/${r.fairways.of}` : NO_DATA, r.fairways ? pct(r.fairways.hit, r.fairways.of) : ''],
    ['Greens', r.greens ? `${r.greens.hit}/${r.greens.of}` : NO_DATA, r.greens ? pct(r.greens.hit, r.greens.of) : ''],
  ];

  return (
    <main className={'ch-rv' + (phone ? ' is-phone' : '')} aria-labelledby="ch-rv-title">
      {phone && <PhoneTop title="Round" back={{ label: coach ? 'Stats' : 'Rounds', onBack: () => goBack() }} />}
      {!phone && (
        <Link
          href={back.href}
          className="ch-rv-back"
          onClick={(e) => {
            // A plain click only: a new-tab click is the address's, as it always was.
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (stepBack()) e.preventDefault();
          }}
        >
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
          <b className="ch-num">{r.score ?? NO_DATA}</b>
          <em className={'ch-num' + (under ? ' is-under' : '')}>{formatToPar(r.toPar)}</em>
          <span>{r.score == null ? 'Score not recorded' : r.holesPlayed === 9 ? 'Strokes · 9 holes' : 'Strokes'}</span>
        </div>
      </header>

      <dl className="ch-rv-figs">
        {figs.map(([k, v, m]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="ch-num">{v}</dd>
            <dd className="ch-num">{m}</dd>
          </div>
        ))}
      </dl>

      {(r.teeError || r.playerError) && (
        <InlineNotice
          code="CH-11216"
          title="Some details of this round didn't load"
          body={missingDetails(r)}
          onRetry={refresh}
          retrying={refreshing}
        />
      )}

      <SectionBoundary surface="rounds.review.strokesGained" label="Strokes gained" code="CH-11203">
        <StrokesGained review={r} onRetry={refresh} retrying={refreshing} />
      </SectionBoundary>

      {r.holesError ? (
        <InlineNotice code="CH-11204" title="The scorecard didn't load" body="The round's totals are right; the hole-by-hole card is missing. Try again in a moment." onRetry={refresh} retrying={refreshing} />
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
                <ReviewNine label="Out" holes={r.holes.filter((h) => h.n <= 9)} sel={sel} onPick={setPicked} />
                <ReviewNine label="In" holes={r.holes.filter((h) => h.n > 9)} sel={sel} onPick={setPicked} />
              </div>
            </section>
          </SectionBoundary>
          <div className="ch-rv-cols">
            <SectionBoundary surface="rounds.review.hole" label="This hole" code="CH-11203">
              {hole && <HoleCard hole={hole} count={r.holes[r.holes.length - 1]?.n ?? 18} shotsError={r.shotsError} onStep={step} onRetry={refresh} retrying={refreshing} />}
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
                      <h3 id="ch-rv-notes-h">{r.playerName ? `${r.playerName.split(' ')[0]}'s notes` : coach ? 'The player’s notes' : 'Your notes'}</h3>
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
