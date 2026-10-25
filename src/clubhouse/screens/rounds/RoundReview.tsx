'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { updateRoundType } from '@/app/golf/actions/round-type';
import { distribution, type ChReviewHole, type ChReviewTypeEdit, type ChRoundReview } from '../../data/round-review-shape';
import type { ChReviewHistory } from '../../data/round-history-shape';
import { useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { roundTypeFailure, savedLine, type ChRoundTypeChoice } from './entry/round-type';
import { CoachNote } from './CoachNote';
import { RoundTypeSheet } from './entry/RoundTypeSheet';
import { scoreName } from './track/labels';
import { changeTone, changeVerdict, formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { chScrollIntoView } from '../../lib/smooth-scroll';
import { useRefresh } from '../../lib/use-refresh';
import { sgBaseline, sgScale, sgShare } from '../../lib/sg';
import { PhoneTop } from '../../shell/phone-chrome';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { ScoreMark } from '../../ui/ScoreMark';
import { Swap } from '../../ui/Swap';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { dateOf, TeeSwatch, TYPE_LABEL } from './parts';
import { approachFinish, costliest, flow, headline, puttSplit, teeMisses, turningStretch } from './round-insights';
import { RoundSays, saysFigures } from './RoundSays';
import { RecordChips } from './RecordChips';
import { CourseLink } from './CourseLink';
import { courseHref } from '../../data/course-key';
import { shortDate } from '../../data/course-page-shape';
import { Segmented } from '../../ui/Segmented';
import { Zone, ZoneBig, ZoneBlock, Zones } from '../../ui/Zone';
import { Tooltip } from '../../ui/Tooltip';
import { PuttingViz, ScoreFlow, ShotTrail, TeeToGreen } from './RoundZones';
import { checkedRecap } from './recap-check';
import { hasCard } from './card/card-model';
import { useJustSubmitted } from './card/just-submitted';
import { RoundCard } from './card/RoundCard';
import { useRoundRecap } from './use-round-recap';
import { openedFromLibrary } from './return-state';
import { SideScroll } from '../../ui/SideScroll';
import { rebuiltHref } from '../../shell/nav';
import { invalidatePrefetchTabs } from '../../shell/use-prefetch-tabs';
import type { ChDebrief } from '../../data/round-debrief-shape';
import { plural, pluralWord } from '../../lib/plural';

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
  const tone = (v: number | null) => ' ' + changeTone(v, false, 1);
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
          title="Which Tour this is measured against didn’t load"
          body="The strokes gained numbers are the round’s own; only the baseline’s name is missing. Try again in a moment."
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
  // D12: Not applicable is the doctrine's dash, not a rule that reads as "_".
  if (v == null)
    return (
      <i className="ch-rv-yn is-na" role="img" aria-label="Not applicable">
        —
      </i>
    );
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
            <td key={h.n}>{h.par ?? <NoData />}</td>
          ))}
          <td>{sum('par') ?? <NoData />}</td>
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
            <b>{sum('score') ?? <NoData />}</b>
          </td>
        </tr>
        <tr>
          <th scope="row">Putts</th>
          {holes.map((h) => (
            <td key={h.n} className={h.putts != null && h.putts >= 3 ? 'is-warn' : undefined}>
              {h.putts ?? <NoData />}
            </td>
          ))}
          <td>{sum('putts') ?? <NoData />}</td>
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
  dir,
  before = null,
}: {
  hole: ChReviewHole;
  dir: 1 | -1;
  /** P-7 4.5.4: earlier plays of this hole at this course, and where its history is; null under two plays. */
  before?: { avg: number; n: number; href: string | null; course: string; who: string | null } | null;
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
              strokes ? `${plural(strokes, 'shot')}` : null,
              hole.putts != null ? `${plural(hole.putts, 'putt')}` : null,
              hole.penalties ? `${hole.penalties} penalty` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Scored as a total'}
          </span>
        </div>
        <div className="ch-rv-step">
          <Tooltip>
            <button type="button" data-ch-press="" onClick={() => onStep(-1)} disabled={hole.n <= 1} aria-label="Previous hole">
              <Icon icon={ChevronLeft} size={16} />
            </button>
          </Tooltip>
          <ScoreMark score={hole.score} par={hole.par} />
          <Tooltip>
            <button type="button" data-ch-press="" onClick={() => onStep(1)} disabled={hole.n >= count} aria-label="Next hole">
              <Icon icon={ChevronRight} size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
      {before && hole.par != null && (
        <div className="ch-rv-before">
          <p>
            {before.who ? `${before.who} here before` : 'Here before'}: {formatFixed(hole.par + before.avg, 1)} average · {before.n} times
          </p>
          {before.href && (
            <Link className="ch-rv-before__go" href={before.href}>
              Hole {hole.n} at {before.course}
            </Link>
          )}
        </div>
      )}
      {/* The shots slide in the direction of travel (CH-11604). */}
      {/* The trail is not slid with the list: its shots draw themselves in order, so the hole changes under a still frame. */}
      {!shotsError && <ShotTrail key={hole.n} hole={hole} />}
      <Swap swapKey={hole.n} kind="slide" dir={dir}>
        {shotsError ? (
          <InlineNotice code="CH-11205" title="The shots for this round didn’t load" body="The scorecard is right; only the shot-by-shot detail is missing. Try again in a moment." onRetry={onRetry} retrying={retrying} />
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
                    {s.penalty ? 'Penalty stroke' : [s.from, s.lie === 'hole' ? 'holed' : [LIE_LABEL[s.lie]?.toLowerCase(), s.to && `${s.to} left`].filter(Boolean).join(' · ')].filter(Boolean).join(' → ')}
                    {s.miss ? ` · ${s.miss}` : ''}
                  </span>
                  {s.read && <em>{s.read}</em>}
                </div>
                <span className={`ch-rv-lie is-${s.lie}`}>{LIE_LABEL[s.lie]}</span>
              </li>
            ))}
          </ol>
        )}
      </Swap>
    </section>
  );
}

/**
 * A round's review (P011; design/handoff/rounds-review.jsx). The player sees
 * their own round; a coach sees a player's round from Stats. The hero, the
 * five figures, the card (tap a hole for its shots), the scoring
 * distribution, the recap and the player's notes.
 */
/**
 * CH-11522: change what a submitted round counts toward, from its review (the Fairway round page's "Change round type",
 * `RoundTypeEditor`; coach report 2026-08-19, players who tapped Practice for a qualifier round). The owning player
 * and a coach of the player's team may; a coach is also offered the team's qualifiers the player isn't in yet, and
 * the save enters them. The sheet is Continue's (`RoundTypeSheet`); Save calls `updateRoundType` and the page reads
 * the round again. Scores never move.
 */
function ChangeRoundType({ roundId, edit }: { roundId: string; edit: ChReviewTypeEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const change = useAction(
    'rounds.review.changeType',
    async (choice: ChRoundTypeChoice) => {
      const res = await updateRoundType({ roundId, roundType: choice.type, qualifierId: choice.qualifierId, qualifierRoundNumber: choice.roundNumber });
      if (res.success) {
        setOpen(false);
        // Stats and the qualifier pages held from before count the round under its old type (A21).
        invalidatePrefetchTabs();
        router.refresh();
      }
      return res;
    },
    (choice: ChRoundTypeChoice) => ({
      done: savedLine(
        choice,
        edit.options.qualifiers.find((q) => q.id === choice.qualifierId),
      ),
      failed: 'Couldn’t change the round type',
      hint: 'The round and its scores are unchanged. Try again in a moment.',
      code: 'CH-11020',
    }),
    (result, c) => (result.success ? c : { ...c, hint: roundTypeFailure(result.error, edit.viewer) ?? c.hint }),
  );
  return (
    <>
      <span className="ch-rv-type" data-ch-code="CH-11522">
        <Button size="sm" variant="ghost" leftIcon={Flag} onClick={() => setOpen(true)}>
          Change round type
        </Button>
      </span>
      <RoundTypeSheet
        open={open}
        current={edit.current}
        options={edit.options}
        pending={change.pending}
        viewer={edit.viewer}
        live={false}
        onClose={() => setOpen(false)}
        onSave={(choice) => void change.run(choice)}
      />
    </>
  );
}

/** Where "Why?" goes: the read on the player's own Deep dive, when the Deep dive is rebuilt for them. */
export function debriefWhyHref(readId: string): string | null {
  return rebuiltHref(`/golf/dashboard/coachhelm?view=deep-dive&insight=${encodeURIComponent(readId)}`, 'player');
}

/**
 * CoachHelm's 30-second debrief on the player's own round (chs-30; supercharge 04 example 9, layout 3): the one number that moved
 * against their own average, the top open read and what this round did to it, the round's counted facts, and one next step. It
 * stands where the recap stood; each line the data cannot say is left out (`round-debrief-shape.ts`).
 */
function RoundDebrief({ debrief: d }: { debrief: ChDebrief }) {
  const why = d.read ? debriefWhyHref(d.read.id) : null;
  return (
    <section className="ch-rv-recap ch-rv-debrief" aria-labelledby="ch-rv-debrief-k">
      <h3 className="ch-rv-recap__k" id="ch-rv-debrief-k">
        Round debrief
      </h3>
      <dl className="ch-rv-debrief__l">
        {d.moved && (
          <div>
            <dt>Moved</dt>
            <dd>
              <b className={'ch-num is-' + d.moved.tone}>{d.moved.value}</b> {d.moved.line}
            </dd>
          </div>
        )}
        {d.read && (
          <div>
            <dt>Your read</dt>
            <dd>
              <b>{d.read.title}</b>
              {d.read.change ? ` ${d.read.change}` : null}
            </dd>
          </div>
        )}
        {d.facts && (
          <div>
            <dt>The round</dt>
            <dd className="ch-num">{d.facts}</dd>
          </div>
        )}
        {d.next && (
          <div>
            <dt>Next</dt>
            <dd>{d.next}</dd>
          </div>
        )}
      </dl>
      {why && (
        <Link href={why} className="ch-rv-debrief__why">
          Why?
          <Icon icon={ChevronRight} size={14} />
        </Link>
      )}
    </section>
  );
}

export function RoundReview({
  review: given,
  history: historyIn,
  typeEdit = null,
  initialHole = null,
}: {
  review: ChRoundReview;
  /** P-7 stage 3, streamed by the server after the review (it never rejects); a fixture puts it in `review.history` instead. */
  history?: PromiseLike<ChReviewHistory | null>;
  typeEdit?: ChReviewTypeEdit | null;
  /** P-7: `?hole=`, a hole to open on. */ initialHole?: number | null;
}) {
  const [streamed, setStreamed] = useState<{ from: PromiseLike<ChReviewHistory | null>; history: ChReviewHistory | null } | null>(null);
  useEffect(() => {
    if (!historyIn) return;
    let live = true;
    // A stream cut off in the browser is the same as a failed read: no history, and nothing said about it (P-7 4.8).
    Promise.resolve(historyIn).then(
      (history) => live && setStreamed({ from: historyIn, history }),
      () => live && setStreamed({ from: historyIn, history: null }),
    );
    return () => {
      live = false;
    };
  }, [historyIn]);
  const review = useMemo(() => (streamed && streamed.from === historyIn ? { ...given, history: streamed.history } : given), [given, streamed, historyIn]);
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const justSubmitted = useJustSubmitted();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  const r = review;
  // Only a hole the player picked is kept; until then the review opens on the first hole over par of what it has. A card that
  // arrives after a retry therefore opens there, not on the hole 1 an empty card defaulted to.
  const [picked, setPicked] = useState<number | null>(() => (initialHole != null && review.holes.some((h) => h.n === initialHole) ? initialHole : null));
  // Which way the last move went, so the hole's shots slide in from that side.
  const [holeDir, setHoleDir] = useState<1 | -1>(1);
  const sel = picked ?? firstHole(r.holes);
  const pick = (n: number) => {
    setHoleDir(n >= sel ? 1 : -1);
    setPicked(n);
  };
  const coach = isCoachView(r);
  const hole = r.holes.find((h) => h.n === sel) ?? r.holes[0] ?? null;
  const dist = useMemo(() => distribution(r.holes), [r.holes]);
  // The stored recap, or the one written now for a completed round that has none (useRoundRecap, as the Fairway page
  // does); then D13: less any sentence its own figures contradict (recap-check.ts).
  // With the debrief drawn in its place (chs-30), no recap is asked for.
  const recapText = useRoundRecap(r.id, r.recap, r.recapPending === true && !r.debrief);
  const recap = useMemo(() => checkedRecap({ ...r, recap: recapText }), [r, recapText]);
  const holesScored = r.holes.filter((h) => h.score != null).length || r.holesPlayed;
  const maxD = Math.max(1, ...dist.map((d) => d.count));
  // A coach who opened this round from Team rounds goes back there, as a player goes back to the library: the note is
  // read after mount (session storage), so the first paint is the server's.
  const [fromList, setFromList] = useState(false);
  useEffect(() => setFromList(openedFromLibrary(r.id)), [r.id]);
  const back = coach && fromList ? { label: 'Rounds', href: '/golf/dashboard/rounds' } : reviewBack(r);
  const insight = useMemo(() => headline(r), [r]);
  const points = useMemo(() => flow(r.holes), [r.holes]);
  // P-7: the stretch that turned the round, drawn on the arc and said in its note.
  // A posted round keeps no start hole, so the holes run in number order. A nine-hole round is stored 1 to 9 whichever nine
  // was played, so it names no stretch (P-7 4.1.2): its numbers may not be the card's.
  const turning = useMemo(() => (r.holesPlayed === 9 ? null : turningStretch(points)), [points, r.holesPlayed]);
  // P-7 4.5.2: another round under this one: the average here or the best here, each past its floor; the viewer's choice
  // is kept on this device (`ch.rv.compare`).
  const ghosts = r.history?.ghosts ?? null;
  const ghostOptions = useMemo(() => {
    const out: Array<{ value: 'none' | 'average' | 'best'; label: string }> = [{ value: 'none', label: 'None' }];
    if (ghosts?.average) out.push({ value: 'average', label: 'Average here' });
    if (ghosts?.best) out.push({ value: 'best', label: `Best here · ${ghosts.best.score}` });
    return out;
  }, [ghosts]);
  const [ghostPref, setGhostPref] = useState<'none' | 'average' | 'best'>('none');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('ch.rv.compare');
      if (v === 'average' || v === 'best') setGhostPref(v);
    } catch {
      /* no storage: None */
    }
  }, []);
  const ghostChoice = ghostOptions.some((o) => o.value === ghostPref) ? ghostPref : 'none';
  const chooseGhost = (v: 'none' | 'average' | 'best') => {
    haptic('select');
    setGhostPref(v);
    try {
      window.localStorage.setItem('ch.rv.compare', v);
    } catch {
      /* the choice holds for this visit */
    }
  };
  const ghostLine =
    ghostChoice === 'average' && ghosts?.average
      ? { cum: ghosts.average, label: 'Average here', spoken: 'average here', legend: 'Average here' }
      : ghostChoice === 'best' && ghosts?.best
        ? { cum: ghosts.best.cum, label: `Best here · ${ghosts.best.score}`, spoken: 'best here', legend: `Best here, ${shortDate(ghosts.best.date)}` }
        : null;
  const says = useMemo(
    () => saysFigures({ holes: r.holes, startHole: null, usual: r.history?.usual ?? null, nine: r.holesPlayed === 9, who: coach ? (r.playerName?.split(' ')[0] ?? null) : null }),
    [r.holes, r.history, r.holesPlayed, r.playerName, coach],
  );
  const costly = useMemo(() => costliest(r.holes, 3), [r.holes]);
  const putting = useMemo(() => puttSplit(r.holes), [r.holes]);
  const approach = useMemo(() => approachFinish(r.holes), [r.holes]);
  const misses = useMemo(() => teeMisses(r.holes), [r.holes]);
  // Rule 8: a player's review opened from the library goes back in history, so the library returns with its search and its place
  // (screens/rounds/return-state.ts), and so does a coach's from Team rounds; anywhere else (a deep link, a reload in a fresh tab, a coach's Stats) it goes to the address as before.
  // A tab with no history behind it (a copied note in a new tab) has nothing to step back to: it goes to the address.
  const stepBack = () => {
    if (window.history.length <= 1 || !openedFromLibrary(r.id)) return false;
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
      setHoleDir(d);
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
    <main className={'ch-rv' + (phone ? ' is-phone' : '')} aria-labelledby="ch-rv-title" data-canopy={phone ? undefined : ''}>
      {phone && <PhoneTop heading={false} title="Round" back={{ label: coach && !fromList ? 'Stats' : 'Rounds', onBack: () => goBack() }} />}
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
      <header className="ch-rv-hero" data-canopy-head={phone ? undefined : ''}>
        <div className="ch-rv-hero__l">
          <span className="ch-rv-hero__k">{kicker}</span>
          {/* D11: one h1 per screen, the course; the phone bar's "Round" is plain text (heading={false}). */}
          <h1 id="ch-rv-title">{r.course}</h1>
          <RecordChips marks={r.history?.records ?? []} />
          {insight && <p className="ch-rv-hero__h">{insight}</p>}
          {(r.tee || r.teeFacts) && (
            <span className="ch-rv-hero__m">
              <TeeSwatch color={r.teeColor} />
              <span>{[r.tee, r.teeFacts].filter(Boolean).join(' · ')}</span>
            </span>
          )}
          <CourseLink review={r} coach={coach} />
        </div>
        <div className="ch-rv-hero__s">
          <b className="ch-num">{r.score ?? NO_DATA}</b>
          <em className={'ch-num' + (under ? ' is-under' : '')}>{formatToPar(r.toPar)}</em>
          <span>{r.score == null ? 'Score not recorded' : r.holesPlayed === 9 ? 'Strokes · 9 holes' : 'Strokes'}</span>
        </div>
      </header>

      {hasCard(r) && <RoundCard review={r} phone={phone} just={justSubmitted} settle={justSubmitted && !reduced} />}

      <dl className="ch-rv-figs">
        {figs.map(([k, v, m]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="ch-num">{v}</dd>
            <dd className="ch-num">{m}</dd>
          </div>
        ))}
      </dl>

      {typeEdit && <ChangeRoundType roundId={r.id} edit={typeEdit} />}

      {(r.teeError || r.playerError) && (
        <InlineNotice
          code="CH-11216"
          title="Some details of this round didn’t load"
          body={missingDetails(r)}
          onRetry={refresh}
          retrying={refreshing}
        />
      )}

      <Zones>
        <Zone
          n={1}
          title="The round"
          def={
            <>
              The score hole by hole against par. The line rises when {coach ? 'the player gains' : 'you gain'} on par and falls when strokes go back. <b>A lower score is better.</b>
            </>
          }
          read={
            <>
              <ZoneBig value={formatToPar(r.toPar)} tone={changeVerdict(r.toPar, true, 0)} />
              <div className="ch-znlines">
                {r.holesPlayed === 18 && r.front.score != null && r.back.score != null && (
                  <span>
                    <b>
                      Out {r.front.score} · In {r.back.score}
                    </b>
                  </span>
                )}
                {points.length > 0 && (
                  <span>
                    <b>{points.filter((p) => p.delta < 0).length}</b> under par · <b>{points.filter((p) => p.delta >= 1).length}</b> over
                  </span>
                )}
              </div>
            </>
          }
        >
          {points.length >= 2 ? (
            <ZoneBlock
              title="Running score to par"
              note={`${turning ? `${turning.words}. ` : ''}One dot a hole; the columns under it are each hole’s strokes against par. Pick a hole to read it and see its shots.`}
            >
              <ScoreFlow
                holes={r.holes}
                outScore={r.front.score}
                outToPar={r.front.toPar}
                inScore={r.back.score}
                inToPar={r.back.toPar}
                selected={sel}
                turning={turning}
                ghost={ghostLine}
                onPick={(n, via) => {
                  pick(n);
                  // From the keyboard the slider keeps focus and the page stays put; the card below follows the value.
                  if (via === 'key') return;
                  haptic('select');
                  chScrollIntoView(document.getElementById('ch-rz-card'), reduced); // A-11: instant when motion is off
                }}
              />
            </ZoneBlock>
          ) : (
            <p className="ch-znmiss">The hole-by-hole picture needs holes posted with their scores.</p>
          )}
          {ghostOptions.length > 1 && (
            <div className="ch-rv-ghost">
              <Segmented label="Draw under this round" value={ghostChoice} onChange={chooseGhost} options={ghostOptions} />
              {ghostLine && (
                <p className="ch-rv-ghost__l">
                  <i aria-hidden="true" />
                  {ghostLine.legend}
                </p>
              )}
            </div>
          )}
          {!r.holesError && <RoundSays figures={says} />}
          {r.holes.length > 0 && !r.holesError && (
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
                      <i style={{ '--ch-rv-p': d.count / maxD } as CSSProperties} />
                    </span>
                    <b className="ch-num">{d.count}</b>
                  </div>
                ))}
              </div>
            </section>
          )}
        </Zone>

        <Zone
          n={2}
          alt
          title="Where the strokes went"
          def={
            <>
              Strokes won or lost against the Tour, shot by shot. <b>Zero is the {sgBaseline(r.tour).noun.replace(/^the /, '')}.</b> Each leg counts its own shots, so the round shows where the strokes went.
            </>
          }
          read={
            r.strokesGained?.total != null ? (
              <>
                <ZoneBig value={formatSigned(r.strokesGained.total)} tone={changeVerdict(r.strokesGained.total)} />
                <div className="ch-znlines">
                  <span>
                    <b>Total</b> {sgBaseline(r.tour).vs}
                  </span>
                </div>
              </>
            ) : undefined
          }
        >
          <SectionBoundary surface="rounds.review.strokesGained" label="Strokes gained" code="CH-11203">
            <StrokesGained review={r} onRetry={refresh} retrying={refreshing} />
          </SectionBoundary>
          {costly.length > 0 && (
            <ZoneBlock title="Where the strokes were lost" note="The holes that cost the most against par. Pick one on the scorecard to see its shots.">
              <div className="ch-rzcost">
                {costly.map((c) => (
                  <div key={c.n} className="ch-rzcost__r">
                    <button
                      type="button"
                      onClick={() => {
                        haptic('select');
                        pick(c.n);
                        chScrollIntoView(document.getElementById('ch-rz-card'), reduced); // A-11: instant when motion is off
                      }}
                    >
                      <span className="ch-rzcost__n ch-num">{c.n}</span>
                      <span className="ch-rzcost__t">
                        Hole {c.n} · Par {c.par}
                        <small>{r.holes.find((h) => h.n === c.n)?.shots.length ? scoreName(c.score, c.par) : `${scoreName(c.score, c.par)} · scored as a total`}</small>
                      </span>
                      <b className="ch-num">{c.score}</b>
                      <em className="ch-num">{formatSigned(c.delta, 0)}</em>
                    </button>
                  </div>
                ))}
              </div>
            </ZoneBlock>
          )}
        </Zone>

        {r.holesError ? (
          <div className="ch-zn ch-zn--note">
            <InlineNotice code="CH-11204" title="The scorecard didn’t load" body="The round’s totals are right; the hole-by-hole card is missing. Try again in a moment." onRetry={refresh} retrying={refreshing} />
          </div>
        ) : r.holes.length === 0 ? (
          <div className="ch-zn ch-zn--note">
            <EmptyState code="CH-11305" compact icon={Flag} title="Posted as a total" body="This round was posted with its score only, so there’s no hole-by-hole card or shots to show." />
          </div>
        ) : (
          <>
            <Zone
              n={3}
              title="Tee to green"
              def={
                <>
                  Fairways found off the tee, and <b>greens in regulation</b>: the green reached in par minus two strokes.
                </>
              }
              read={
                r.greens ? (
                  <>
                    <ZoneBig value={pct(r.greens.hit, r.greens.of)} unit="" />
                    <div className="ch-znlines">
                      <span>
                        <b>
                          {r.greens.hit} of {r.greens.of}
                        </b>{' '}
                        greens
                      </span>
                      {r.fairways && (
                        <span>
                          <b>
                            {r.fairways.hit} of {r.fairways.of}
                          </b>{' '}
                          fairways
                        </span>
                      )}
                    </div>
                  </>
                ) : undefined
              }
            >
              <ZoneBlock title="Fairways and greens" note="A filled dot found it, a hollow dot missed it, a dash does not apply (a par 3 has no fairway).">
                <TeeToGreen holes={r.holes} />
                {(misses.left > 0 || misses.right > 0) && (
                  <p className="ch-rzmeta">
                    Fairways missed: <b>{misses.left}</b> left, <b>{misses.right}</b> right{misses.other ? `, ${misses.other} with no side recorded` : ''}.
                  </p>
                )}
              </ZoneBlock>
              {approach && (
                <ZoneBlock title="How close approaches finished" note={`${approach.n} approach ${pluralWord(approach.n, 'shot')} that found the green.`}>
                  <div className="ch-rzpair">
                    <div>
                      <b className="ch-num">{Math.round(approach.avg)}</b>
                      <small>ft on average</small>
                    </div>
                    <div>
                      <b className="ch-num">{approach.best}</b>
                      <small>ft closest, hole {approach.hole}</small>
                    </div>
                  </div>
                </ZoneBlock>
              )}
            </Zone>

            <Zone
              n={4}
              alt
              title="Putting"
              def={
                <>
                  Putts a hole, and the first putt on each green by its length. <b>Fewer is better,</b> and a three-putt is the stroke most worth finding.
                </>
              }
              read={
                putting ? (
                  <>
                    <ZoneBig value={r.putts == null ? NO_DATA : String(r.putts)} />
                    <div className="ch-znlines">
                      <span>
                        <b>{formatFixed(putting.perHole, 1)}</b> a hole
                      </span>
                      {r.strokesGained?.putting != null && (
                        <span>
                          Strokes gained <b>{formatSigned(r.strokesGained.putting)}</b>
                        </span>
                      )}
                    </div>
                  </>
                ) : undefined
              }
            >
              <PuttingViz holes={r.holes} />
            </Zone>

            <Zone
              n={5}
              title="Scorecard and shots"
              read={
                hole ? (
                  <>
                    <ZoneBig
                      key={hole.n}
                      settle
                      value={hole.score == null ? NO_DATA : String(hole.score)}
                      tone={hole.score == null || hole.par == null ? undefined : hole.score < hole.par ? 'good' : hole.score > hole.par ? 'bad' : undefined}
                    />
                    <div className="ch-znlines">
                      <span>
                        <b>Hole {hole.n}</b>
                        {hole.par != null ? ` · Par ${hole.par}` : ''}
                        {hole.yards ? ` · ${hole.yards} yds` : ''}
                      </span>
                      {hole.putts != null && (
                        <span>
                          <b>{hole.putts}</b> {pluralWord(hole.putts, 'putt')}
                        </span>
                      )}
                    </div>
                  </>
                ) : undefined
              }
              def={
                <>
                  Every hole’s score, putts, fairway and green. {phone ? 'Tap' : 'Select'} a hole number to see each shot on it, in order, and where it finished.
                </>
              }
            >
              <SectionBoundary surface="rounds.review.card" label="The scorecard" code="CH-11203">
                <section className="ch-rv-card" id="ch-rz-card" aria-labelledby="ch-rv-card-h">
                  <div className="ch-rv-card__h">
                    <div>
                      <h2 id="ch-rv-card-h">Scorecard</h2>
                      <span>{phone ? 'Tap a hole to see every shot' : 'Select a hole to see every shot'}</span>
                    </div>
                  </div>
                  <SideScroll className="ch-rv-cardw">
                    <ReviewNine label="Out" holes={r.holes.filter((h) => h.n <= 9)} sel={sel} onPick={pick} />
                    <ReviewNine label="In" holes={r.holes.filter((h) => h.n > 9)} sel={sel} onPick={pick} />
                  </SideScroll>
                </section>
              </SectionBoundary>
              <SectionBoundary surface="rounds.review.hole" label="This hole" code="CH-11203">
                {hole && (
                  <HoleCard
                    hole={hole}
                    dir={holeDir}
                    count={r.holes[r.holes.length - 1]?.n ?? 18}
                    shotsError={r.shotsError}
                    onStep={step}
                    onRetry={refresh}
                    retrying={refreshing}
                    before={(() => {
                      const b = r.history?.hereBefore[hole.n];
                      const c = r.history?.course;
                      if (!b || !c) return null;
                      return { ...b, course: c.name, who: coach ? (r.playerName?.split(' ')[0] ?? null) : null, href: rebuiltHref(courseHref(c.key, { hole: hole.n, ...(coach ? { player: r.playerId } : {}) }), coach ? 'coach' : 'player') };
                    })()}
                  />
                )}
              </SectionBoundary>
            </Zone>

            {(r.debrief || recap || r.notes || r.coachNote || r.coachNoteError || coach) && (
              <Zone
                n={6}
                alt
                title="In words"
                def={<>What CoachHelm read in the round, {coach ? 'what the player wrote' : 'what you wrote'} when posting it, and the note {coach ? 'you leave' : 'your coach left'}.</>}
              >
                {r.debrief ? (
                  <RoundDebrief debrief={r.debrief} />
                ) : (
                  recap && (
                  // C2: a passage under a rule, labelled in words for who wrote it (no sparkle, D14).
                  <section className="ch-rv-recap" aria-labelledby="ch-rv-recap-k">
                    <h3 className="ch-rv-recap__k" id="ch-rv-recap-k">
                      Round recap
                    </h3>
                    <p>{recap}</p>
                    <span className="ch-rv-recap__by">
                      Written by CoachHelm from {holesScored} {pluralWord(holesScored, 'hole')}
                    </span>
                  </section>
                  )
                )}
                {r.notes && (
                  <section className="ch-rv-card ch-rv-notes" aria-labelledby="ch-rv-notes-h">
                    <div className="ch-rv-card__h">
                      <div>
                        <h3 id="ch-rv-notes-h">{r.playerName ? `${r.playerName.split(' ')[0]}’s notes` : coach ? 'The player’s notes' : 'Your notes'}</h3>
                        <span>Written when the round was posted</span>
                      </div>
                    </div>
                    <p>{r.notes}</p>
                  </section>
                )}
                <CoachNote roundId={r.id} note={r.coachNote} error={r.coachNoteError} canWrite={coach} playerFirst={r.playerName ? (r.playerName.split(' ')[0] ?? null) : null} />
              </Zone>
            )}
          </>
        )}
      </Zones>
    </main>
  );
}
