'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import { NO_DATA, changeTone } from '../../../../lib/format';
import { Nine, type ChNineHole } from '../../../../ui/Nine';
import { ScrollRegion } from '../../../../ui/ScrollRegion';
import { PlanCard } from '../../plan/PlanCard';
import { CardBody } from '../cards';
import { AppLinkRow, CoachNoteChip } from '../cards/answers';
import { BriefBody, DocBody, HandoffBody } from '../cards/drafts';
import { dayParts, dayWords, plural } from '../cards/facts';
import { DataTable } from './table';
import { HoleStrip, MissPattern, PuttProfile, SeasonCompare } from '../visual/blocks';
import { AskKey, OpenKey, type AskTarget } from './ask';
import { HolePlan, RuledTrend, onTheHole, trendReference } from './drawings';
import type { StudioEvent, StudioHole, StudioProps } from './types';

/**
 * The studio's components, one per kind (registry.tsx), in the chat's approved look (LOOK.md, "A. The yardage book"):
 * each is a ruled section of the answer's leaf. A head names it (and, at its right, what its figures are measured in),
 * the thing itself is drawn under it, and nothing is boxed: no card in the card, no track behind a bar, no pill. A
 * figure is type, and its tone is its colour (gain green, loss amber). Figures arrive printed and a sample arrives in
 * words; nothing here computes one.
 *
 * No component has motion of its own. The entrance is the composition's (CoachComposition, MOTION.md); a row's only
 * response to a press is its dim.
 */

const targetOf = (kind: AskTarget['kind'], p: Pick<StudioProps, 'read' | 'onAsk'>): AskTarget => ({ kind, read: p.read, onAsk: p.onAsk });

/** A section's head: its name at the left and, at the right, the quiet words that say what its figures are. */
function Head({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  if (!title) return null;
  return (
    <p className="ch-aks-title">
      <span>{title}</span>
      {aside && <small className="ch-num">{aside}</small>}
    </p>
  );
}

/* ---------------------------------------------------------------- figure */

/**
 * One figure set large with its name on the figure's own baseline and its terms on the line under it, or several as ruled
 * rows (one figure is large; every other number is a row figure). Each is a key: "Ask about Jonah's putts per round, 31.8
 * over 4 rounds".
 */
export function Figure(p: StudioProps<'figure'>) {
  const t = targetOf('figure', p);
  const one = p.data.figures.length === 1;
  return (
    <div className="ch-aks ch-aks-fig" data-size={p.size} data-one={one ? '' : undefined}>
      <Head title={p.data.title} />
      <ul className="ch-aks-fig__list">
        {p.data.figures.map((f) => (
          <li key={f.key} className="ch-aks-row">
            <AskKey target={t} id={f.key} className="ch-aks-fig__cell" words={`Ask about this: ${f.label}, ${f.value}${f.sub ? ` ${f.sub}` : ''}`}>
              <b className="ch-aks-fig__value ch-num" data-tone={f.tone === 'plain' ? undefined : f.tone}>
                {f.value}
              </b>
              <span className="ch-aks-fig__label">{f.label}</span>
              {(f.sub || f.verdict) && (
                <span className="ch-aks-fig__sub">
                  {f.sub}
                  {/* The tone is the figure's colour; its words are kept for a reader who does not see colour. */}
                  {f.verdict && <span className="ch-sr-only"> {f.verdict}</span>}
                </span>
              )}
              {!!f.refs?.length && <span className="ch-sr-only ch-aks-fig__vs">Compared with</span>}
              {f.refs?.map((r) => (
                <span key={r} className="ch-aks-fig__ref ch-num">
                  {r}
                </span>
              ))}
            </AskKey>
            {/* The one large figure stands alone, as the sheet sets it; the answer's sources open what it was read from. */}
            {!one && <OpenKey href={f.href} label={`Open ${f.label}`} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- ranking */

const RANK_TONE = { good: 'gain', best: 'gain', loss: 'loss', plain: undefined } as const;

/** Players ranked on one measure, as ruled rows: place, name, the sample in words, the figure in its tone. A row asks about that player on that measure; its arrow opens their stats. */
export function RankingList(p: StudioProps<'ranking'>) {
  const t = targetOf('ranking', p);
  const { rows, label, highlight, hrefs } = p.data;
  return (
    <div className="ch-aks ch-aks-rank" data-size={p.size}>
      <Head title={label} />
      <ol className="ch-aks-rows" aria-label={label}>
        {rows.map((r) => (
          <li key={r.id} className="ch-aks-row" data-on={highlight === r.id ? '' : undefined}>
            <AskKey target={t} id={r.id} className="ch-aks-rank__row" words={`Ask about this: ${r.label}, ${label} ${r.display}${r.of ? ` ${r.of}` : ''}`}>
              <span className="ch-aks-rank__n ch-num">{r.rank}</span>
              <span className="ch-aks-rank__who">{r.label}</span>
              {r.of && <small className="ch-aks-rank__of ch-num">{r.of}</small>}
              <b className="ch-aks-rank__val ch-num" data-tone={RANK_TONE[r.tone]}>
                {r.display}
              </b>
            </AskKey>
            <OpenKey href={hrefs?.[r.id]} label={`Open ${r.label}’s stats`} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------- comparison */

/** Players across the same measures, the best in each marked. A player's name asks about that player; a cell is read, not pressed (a grid of forty keys is not a control). */
export function Comparison(p: StudioProps<'comparison'>) {
  const t = targetOf('comparison', p);
  const { team, label, hrefs } = p.data;
  // In the compact size the players are always the rows: a phone reads down a list of names, never across twelve columns.
  const playersAsRows = p.size === 'compact' ? true : team.playersAsRows;
  const cell = (pi: number, mi: number) => {
    const c = team.cells[pi]?.[mi];
    const best = team.best[mi] === team.players[pi]?.id;
    return (
      <td key={`${pi}-${mi}`} className="ch-num" data-tone={c && c.tone !== 'plain' ? (c.tone === 'good' ? 'gain' : c.tone) : undefined} data-best={best ? '' : undefined}>
        {best && <span className="ch-aks-cmp__dot" aria-hidden="true" />}
        {c?.display ?? <span className="ch-aks-none">None</span>}
        {best && <span className="ch-sr-only"> (best)</span>}
      </td>
    );
  };
  const who = (pi: number) => {
    const pl = team.players[pi]!;
    return (
      <span className="ch-aks-row">
        <AskKey target={t} id={pl.id} className="ch-aks-cmp__who" words={`Ask about this: ${pl.label} against the others on ${team.metrics.map((m) => m.label).join(', ')}`}>
          <b>{pl.label}</b>
          {pl.sample && <small>{pl.sample}</small>}
        </AskKey>
        {/* The phone keeps every measure on screen instead of an arrow per row: the name still asks, and the full size carries the link. */}
        {p.size === 'full' && <OpenKey href={hrefs?.[pl.id]} label={`Open ${pl.label}’s stats`} />}
      </span>
    );
  };
  return (
    <div className="ch-aks ch-aks-cmp" data-size={p.size}>
      <Head title={label} />
      <ScrollRegion label={`${label}, scrolls sideways`} className="ch-aks-cmp__wrap" fade={false}>
        <table className="ch-aks-cmp__table">
          <caption className="ch-sr-only">{`${label}: ${plural(team.players.length, 'player')} across ${plural(team.metrics.length, 'measure')}; the best in each is marked.`}</caption>
          <thead>
            <tr>
              <th scope="col">{playersAsRows ? 'Player' : 'Measure'}</th>
              {playersAsRows ? team.metrics.map((m) => <th key={m.id} scope="col" title={m.label}>{p.size === 'compact' ? m.short : m.label}</th>) : team.players.map((_, pi) => <th key={pi} scope="col">{who(pi)}</th>)}
            </tr>
          </thead>
          <tbody>
            {playersAsRows
              ? team.players.map((pl, pi) => (
                  <tr key={pl.id}>
                    <th scope="row">{who(pi)}</th>
                    {team.metrics.map((_, mi) => cell(pi, mi))}
                  </tr>
                ))
              : team.metrics.map((m, mi) => (
                  <tr key={m.id}>
                    <th scope="row">{m.label}</th>
                    {team.players.map((_, pi) => cell(pi, mi))}
                  </tr>
                ))}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="ch-aks-foot">
        <span className="ch-aks-cmp__dot" aria-hidden="true" /> The best in each measure.
        {team.metrics.some((m) => m.strokes) && ' Strokes gained is against the baseline.'}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- trend */

/** One measure round by round, ink on ruled paper with the first and the last round named (drawings.tsx), or this season against last on one scale. The whole trend asks; a round is read from the table kept for a screen reader. */
export function TrendFigure(p: StudioProps<'trend'>) {
  const t = targetOf('trend', p);
  if (p.data.form === 'seasons') {
    return (
      <div className="ch-aks ch-aks-trend" data-size={p.size}>
        <Head title={p.data.seasons.metric} />
        <SeasonCompare block={p.data.seasons} />
      </div>
    );
  }
  const { trend } = p.data;
  return (
    <div className="ch-aks ch-aks-trend" data-size={p.size}>
      <Head title={trend.title} aside={trendReference(trend)} />
      <RuledTrend block={trend} drawIn={p.drawIn} />
      <AskKey target={t} id="trend" className="ch-aks-line" words={`Ask about this: ${trend.title}, ${trend.summary}`}>
        {trend.summary}
      </AskKey>
    </div>
  );
}

/* ---------------------------------------------------------------- round */

const toParWords = (n: number): string => (n === 0 ? 'par' : n > 0 ? `${n} over` : `${Math.abs(n)} under`);
const holeDiff = (h: StudioHole): number | null => (h.score != null && h.par != null ? h.score - h.par : (h.toPar ?? null));

/**
 * A round as the scorecard shows it: the two nines in the app's own scorecard table (circles under par, squares over),
 * then the holes that decided it as keys. A coach asks about the 7th, not about a cell, so the holes that cost or
 * gained the most are named and each one asks.
 */
export function Round(p: StudioProps<'round'>) {
  const t = targetOf('round', p);
  if ('strip' in p.data) {
    return (
      <div className="ch-aks ch-aks-round" data-size={p.size}>
        <Head title={p.data.title ?? 'Hole by hole'} aside="To par" />
        <HoleStrip block={p.data.strip} />
        <OpenLine href={p.data.href} label="Open the round" />
      </div>
    );
  }
  const holes = [...p.data.holes].sort((a, b) => a.n - b.n);
  const nine = (from: number, to: number): ChNineHole[] => holes.filter((h) => h.n >= from && h.n <= to).map((h) => ({ n: h.n, par: h.par, score: h.score }));
  const told = holes.map((h) => ({ h, d: holeDiff(h) })).filter((x): x is { h: StudioHole; d: number } => x.d !== null && x.d !== 0);
  const cost = told.filter((x) => x.d > 0).sort((a, b) => b.d - a.d || a.h.n - b.h.n).slice(0, p.size === 'compact' ? 3 : 4);
  const made = told.filter((x) => x.d < 0).sort((a, b) => a.d - b.d || a.h.n - b.h.n).slice(0, p.size === 'compact' ? 3 : 4);
  const group = (title: string, list: typeof told) =>
    list.length > 0 && (
      <div className="ch-aks-round__group">
        <p className="ch-aks-k">{title}</p>
        <ul>
          {list.map(({ h, d }) => (
            <li key={h.n}>
              <AskKey target={t} id={`hole:${h.n}`} className="ch-aks-round__hole" words={`Ask about this: hole ${h.n}, ${toParWords(d)}`}>
                <b className="ch-num">{h.n}</b>
                <span>{toParWords(d)}</span>
              </AskKey>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="ch-aks ch-aks-round" data-size={p.size}>
      <Head title={p.data.title} />
      <div className="ch-aks-round__nines">
        <Nine label="Out" holes={nine(1, 9)} caption="Holes 1 to 9: par and score" />
        <Nine label="In" holes={nine(10, 18)} caption="Holes 10 to 18: par and score" />
      </div>
      {group('Cost the most', cost)}
      {group('Gained the most', made)}
      <OpenLine href={p.data.href} label="Open the round" />
    </div>
  );
}

/** The part's own way into the app, when it has one: a quiet line at the foot, the same row an app link is. */
function OpenLine({ href, label }: { href: string | null | undefined; label: string }) {
  return href ? <AppLinkRow link={{ href, label }} /> : null;
}

/* ---------------------------------------------------------------- strokes gained */

/**
 * Strokes gained by part of the game. When the legs are the parts of one game (off the tee, approach, around the green,
 * putting), they are sounded off the hole drawn tee to green: plan and figures on one axis (drawings.tsx). Any other set
 * of legs (a total among them, two players' legs) is ruled rows, the figure in its tone. A part asks about itself.
 */
export function StrokesGained(p: StudioProps<'strokes_gained'>) {
  const t = targetOf('strokes_gained', p);
  const placed = onTheHole(p.data.legs);
  const title = p.data.title ?? (placed ? 'Tee to green' : 'Strokes gained');
  return (
    <div className="ch-aks ch-aks-sg" data-size={p.size} data-form={placed ? 'hole' : 'rows'}>
      <Head title={title} aside={/strokes gained/i.test(title) ? 'A round' : 'Strokes gained a round'} />
      {placed ? (
        <HolePlan placed={placed} target={t} baseline="Baseline" highlight={p.data.highlight ?? null} />
      ) : (
        <ul className="ch-aks-rows" aria-label="Strokes gained by part of the game">
          {p.data.legs.map((l) => (
            <li key={l.key} className="ch-aks-row">
              <AskKey target={t} id={l.key} className="ch-aks-sg__row" words={`Ask about this: strokes gained ${l.label.toLowerCase()}, ${l.display}`}>
                <span className="ch-aks-sg__label">{l.label}</span>
                {l.sample && <small className="ch-aks-rank__of ch-num">{l.sample}</small>}
                {/* The tone comes from the value as it prints (one decimal): a leg shown as 0.0 is neither a gain nor a loss (A2). */}
                <b className="ch-aks-sg__val ch-num" data-tone={TONE_OF[changeTone(l.value, false, 1)]}>
                  {l.display}
                </b>
              </AskKey>
            </li>
          ))}
        </ul>
      )}
      {p.data.takeaway && <p className="ch-aks-say">{p.data.takeaway}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- distance profile */

const BAND_TONE = { good: 'gain', loss: 'loss', neutral: undefined } as const;
const TONE_OF = { 'is-gain': 'gain', 'is-loss': 'loss', '': undefined } as const;

/** Make rate or feet left by distance band, as ruled rows: the band, its attempts, the figure in its tone, and under it what it is set against, in words. Putts and misses keep their own drawings. Each band and each direction asks. */
export function DistanceProfile(p: StudioProps<'distance_profile'>) {
  const t = targetOf('distance_profile', p);
  if (p.data.form === 'putts')
    return (
      <div className="ch-aks ch-aks-dist" data-size={p.size}>
        <Head title="Make rate by distance" aside="Made" />
        <PuttProfile block={p.data.putts} />
      </div>
    );
  if (p.data.form === 'misses')
    return (
      <div className="ch-aks ch-aks-dist" data-size={p.size}>
        <Head title="Where the misses go" />
        <MissPattern block={p.data.misses} />
      </div>
    );
  const { bands } = p.data;
  return (
    <div className="ch-aks ch-aks-dist" data-size={p.size}>
      <Head title={bands.title} />
      <ul className="ch-aks-rows" aria-label={bands.title}>
        {bands.rows.map((r) => (
          <li key={r.label} className="ch-aks-row" data-on={r.highlight ? '' : undefined}>
            <AskKey
              target={t}
              id={r.label}
              className="ch-aks-dist__row"
              // With references, the row is one sentence for a screen reader: the figure, then each of them by name.
              label={r.ticks?.length ? `${r.label}: ${r.display}. ${r.ticks.map((k) => k.text).join('. ')}` : undefined}
              words={`Ask about this: ${bands.title}, ${r.label}, ${r.display}${r.of ? ` ${r.of}` : ''}`}
            >
              <span className="ch-aks-dist__band">{r.label}</span>
              <b className="ch-aks-dist__val ch-num" data-tone={BAND_TONE[r.tone]}>
                {r.display}
              </b>
              {r.of && <small className="ch-aks-rank__of ch-num"> {r.of}</small>}
              {r.ticks?.length ? (
                // What the figure is set against, in words under it: the level, the team, the Tour. No tick to decode, no track to read it off.
                <small className="ch-aks-dist__refs ch-num">
                  {r.ticks.map((k) => (
                    <span key={k.kind} data-kind={k.kind}>
                      {k.short ?? k.text}
                    </span>
                  ))}
                </small>
              ) : null}
            </AskKey>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- schedule */

const EVENT_WORD: Record<StudioEvent['kind'], string> = { practice: 'Practice', qualifier: 'Qualifier', tournament: 'Tournament', travel: 'Travel', class: 'Class', other: 'Event' };

function repliesWords(r: NonNullable<StudioEvent['replies']>): string {
  const parts = [`${r.going} going`, r.out > 0 ? `${r.out} out` : null, r.waiting > 0 ? `${r.waiting} not replied` : null].filter(Boolean);
  return parts.join(', ');
}

/** Days with their events: the day set in the margin, each event a ruled row with what it is, its time, its place, the replies in and the class conflicts. An event asks about itself; its arrow opens it on the Calendar. */
export function Schedule(p: StudioProps<'schedule'>) {
  const t = targetOf('schedule', p);
  return (
    <div className="ch-aks ch-aks-sched" data-size={p.size}>
      <Head title={p.data.title} />
      <ol className="ch-aks-sched__days">
        {p.data.days.map((d) => {
          const parts = dayParts(d.date);
          return (
            <li key={d.date} className="ch-aks-sched__day">
              <span className="ch-aks-sched__date" aria-hidden="true">
                <small>{parts?.weekday}</small>
                <b className="ch-num">{parts?.day}</b>
                <small>{parts?.month}</small>
              </span>
              <ul aria-label={dayWords(d.date, true)}>
                {d.events.length === 0 && <li className="ch-aks-none">Nothing on the calendar.</li>}
                {d.events.map((e) => (
                  <li key={e.id} className="ch-aks-row">
                    <AskKey target={t} id={e.id} className="ch-aks-sched__event" words={`Ask about this: ${e.title}, ${dayWords(d.date)}${e.time ? `, ${e.time}` : ''}`}>
                      <b>{e.title}</b>
                      <small className="ch-num">{[EVENT_WORD[e.kind], e.time ?? 'All day', e.place].filter(Boolean).join(' · ')}</small>
                      {e.replies && <small className="ch-num">{repliesWords(e.replies)}</small>}
                      {!!e.conflicts && (
                        <small className="ch-aks-sched__clash">
                          {plural(e.conflicts, 'player has', 'players have')} a class then
                        </small>
                      )}
                    </AskKey>
                    <OpenKey href={e.href} label={`Open ${e.title} on the Calendar`} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      <OpenLine href={p.data.href} label="Open the Calendar" />
    </div>
  );
}

/* ---------------------------------------------------------------- qualifier board */

/** A qualifier's board: place, player, each round, the total against par, and the cut drawn between the last seat and the first player outside it. A row asks about that player's qualifier. */
export function QualifierBoard(p: StudioProps<'qualifier_board'>) {
  const t = targetOf('qualifier_board', p);
  const { rows, cut, roundLabels, title, status } = p.data;
  // The phone keeps the place, the name and the total: the rounds are one tap away on the board itself.
  const rounds = p.size === 'compact' ? [] : roundLabels;
  return (
    <div className="ch-aks ch-aks-board" data-size={p.size}>
      <Head title={title} aside={status} />
      <ol className="ch-aks-board__rows" data-open={rows.some((r) => r.href) ? '' : undefined} style={{ '--ch-aks-cols': ['20px', 'minmax(0, 1fr)', ...rounds.map(() => '36px'), '44px', '52px'].join(' ') } as CSSProperties} aria-label={`${title}: ${plural(rows.length, 'player')}${cut ? `, ${plural(cut, 'seat')}` : ''}`}>
        <li className="ch-aks-board__head" aria-hidden="true">
          <span />
          <span>Player</span>
          {rounds.map((r) => (
            <span key={r} className="is-num">
              {r}
            </span>
          ))}
          <span className="is-num">Total</span>
          <span className="is-num">To par</span>
        </li>
        {rows.map((r, i) => (
          <li key={r.id} className="ch-aks-row" data-in={cut != null && i < cut ? '' : undefined} data-cut={cut != null && i === cut - 1 && i < rows.length - 1 ? '' : undefined}>
            <AskKey target={t} id={r.id} className="ch-aks-board__row" label={`Place ${i + 1}, ${r.name}, ${r.total}, ${r.toPar === 'E' ? 'level par' : `${r.toPar} to par`}. Ask about it.`} words={`Ask about this: ${r.name} in ${title}, ${r.toPar === 'E' ? 'level par' : r.toPar}`}>
              <span className="ch-aks-rank__n ch-num">{i + 1}</span>
              <b className="ch-aks-board__name">{r.name}</b>
              {rounds.map((label, ri) => (
                <span key={label} className="is-num ch-num">
                  {r.rounds[ri] ?? NO_DATA}
                </span>
              ))}
              <span className="is-num ch-num">{r.total}</span>
              <b className="is-num ch-num">{r.toPar}</b>
            </AskKey>
            <OpenKey href={r.href} label={`Open ${r.name}’s rounds`} />
            {cut != null && i === cut - 1 && i < rows.length - 1 && (
              <span className="ch-aks-board__cut" role="separator" aria-label={`The cut: ${plural(cut, 'seat')}`}>
                <span>The cut · {plural(cut, 'seat')}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <OpenLine href={p.data.href} label="Open the board" />
    </div>
  );
}

/* ---------------------------------------------------------------- the forms other files already draw */

export function PracticePlan(p: StudioProps<'practice_plan'>) {
  return p.data.form === 'plan' ? <PlanCard plan={p.data.plan} onSend={(text) => p.onAsk?.({ kind: 'practice_plan', read: p.read, key: 'plan', words: text })} /> : <BriefBody brief={p.data.brief} density={p.size} />;
}

export function Document(p: StudioProps<'document'>) {
  return p.data.form === 'document' ? <DocBody doc={p.data.doc} density={p.size} /> : <HandoffBody handoff={p.data.handoff} roster={p.roster} density={p.size} />;
}

export function AppLink(p: StudioProps<'app_link'>) {
  return <AppLinkRow link={p.data.link} />;
}

const CLAIM_WORD = { measured: 'Measured', association: 'Pattern', hypothesis: 'Hypothesis' } as const;

/** One sentence about a visual (said as what it is: measured, a pattern, or a guess), or a note the coach asked to keep. */
export function Note(p: StudioProps<'note'>) {
  if (p.data.form === 'kept') return <CoachNoteChip note={p.data.note} />;
  return (
    <p className="ch-aks ch-aks-note" data-claim={p.data.claim} data-size={p.size}>
      <b>{CLAIM_WORD[p.data.claim]}</b> {p.data.text}
    </p>
  );
}

/** What CoachHelm has on record, each a sentence that can be asked about: what it is about, then what is kept. Never a label and value grid. */
export function OnRecord(p: StudioProps<'on_record'>) {
  const t = targetOf('on_record', p);
  return (
    <div className="ch-aks ch-aks-record" data-size={p.size}>
      <Head title={p.data.title} />
      <ul className="ch-aks-rows">
        {p.data.rows.map((r) => (
          <li key={r.label} className="ch-aks-row">
            <AskKey target={t} id={r.label} className="ch-aks-record__row" words={`Ask about this: ${r.label}, ${r.value}`}>
              <b>{r.label}</b>
              {r.value}
            </AskKey>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What a task will do, and then what it did: one body, in the tense of the block's own state. With a receipt it is the preview the
 * coach confirmed in its saved (or held, partial, undone, failed) tense, not a second object; without one it is the proposal in its
 * phase. The frame, the keys and the ring are the shell's (parts/TaskCard.tsx); this is the body it mounts.
 */
export function Action(p: StudioProps<'action'>) {
  const receipt = p.data.receipt ?? null;
  const phase = !receipt
    ? (p.data.phase ?? 'proposed')
    : receipt.status === 'completed' ? 'saved' : receipt.status === 'partial' ? 'partial' : receipt.status === 'held' ? 'held' : receipt.status === 'cancelled' ? 'undone' : 'failed';
  return <CardBody tool={p.data.tool} proposal={p.data.proposal} receipt={receipt} phase={phase} density={p.size} roster={p.roster} team={p.team} />;
}

/** Rows and columns with a caption that names the source: the fallback, always available. */
export function Table(p: StudioProps<'table'>) {
  const titleId = useId();
  const { table } = p.data;
  const title = p.data.title?.trim() || table.caption;
  return (
    <div className="ch-aks ch-aks-table" data-size={p.size}>
      <p className="ch-aks-title" id={titleId}>
        <span>{title}</span>
      </p>
      {/* A head that already says the caption names the table; a different one leaves the caption to a screen reader. */}
      <DataTable table={table} labelledBy={title === table.caption.trim() ? titleId : undefined} />
    </div>
  );
}
