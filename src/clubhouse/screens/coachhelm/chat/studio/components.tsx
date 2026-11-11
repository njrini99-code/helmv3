'use client';

import type { CSSProperties } from 'react';
import { NO_DATA } from '../../../../lib/format';
import { Nine, type ChNineHole } from '../../../../ui/Nine';
import { ScrollRegion } from '../../../../ui/ScrollRegion';
import { PlanCard } from '../../plan/PlanCard';
import { CardBody } from '../cards';
import { AppLinkRow, CoachNoteChip } from '../cards/answers';
import { BriefBody, DocBody, HandoffBody } from '../cards/drafts';
import { dayParts, dayWords, plural } from '../cards/facts';
import { DataTable, Drawing, Trend } from '../Evidence';
import { HoleStrip, MissPattern, PuttProfile, SeasonCompare } from '../visual/blocks';
import { AskKey, OpenKey, type AskTarget } from './ask';
import type { StudioEvent, StudioHole, StudioProps } from './types';

/**
 * The studio's components, one per kind (registry.tsx). Each draws the thing as the app itself shows it: a round as
 * its scorecard, a qualifier as its board with the cut between rows, a schedule as days. Figures arrive printed and a
 * sample arrives in words; nothing here computes one.
 *
 * No component has motion of its own. The entrance is the chat lead's (the composition's beats, MOTION.md); a row's
 * only response is the pressed wash. A bar's length is a transform on a full-width fill, so nothing animates layout.
 */

const targetOf = (kind: AskTarget['kind'], p: Pick<StudioProps, 'read' | 'onAsk'>): AskTarget => ({ kind, read: p.read, onAsk: p.onAsk });
const pct = (n: number): CSSProperties => ({ transform: `scaleX(${Math.max(0, Math.min(1, n))})` });

/* ---------------------------------------------------------------- figure */

/** One figure set large, or up to six beside each other. Each is a key: "Ask about Jonah's putts per round, 31.8 over 4 rounds". */
export function Figure(p: StudioProps<'figure'>) {
  const t = targetOf('figure', p);
  const one = p.data.figures.length === 1;
  return (
    <div className="ch-aks ch-aks-fig" data-size={p.size} data-one={one ? '' : undefined}>
      {p.data.title && <p className="ch-aks-title">{p.data.title}</p>}
      <ul className="ch-aks-fig__list">
        {p.data.figures.map((f) => (
          <li key={f.key} className="ch-aks-row">
            <AskKey target={t} id={f.key} className="ch-aks-fig__cell" words={`Ask about this: ${f.label}, ${f.value}${f.sub ? ` ${f.sub}` : ''}`}>
              <span className="ch-aks-fig__label">{f.label}</span>
              <b className="ch-aks-fig__value ch-num" data-tone={f.tone === 'plain' ? undefined : f.tone}>
                {f.value}
              </b>
              {f.sub && <span className="ch-aks-fig__sub">{f.sub}</span>}
              {f.refs?.map((r) => (
                <span key={r} className="ch-aks-fig__ref ch-num">
                  {r}
                </span>
              ))}
            </AskKey>
            <OpenKey href={f.href} label={`Open ${f.label}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- ranking */

/** Players ranked on one measure: place, name, the sample in words, a bar on one fitted axis, the figure. A row asks about that player on that measure; its arrow opens their stats. */
export function RankingList(p: StudioProps<'ranking'>) {
  const t = targetOf('ranking', p);
  const { rows, signed, label, highlight, hrefs } = p.data;
  return (
    <div className="ch-aks ch-aks-rank" data-size={p.size} data-signed={signed ? '' : undefined}>
      <p className="ch-aks-title">{label}</p>
      <ol className="ch-aks-rank__list" aria-label={label}>
        {rows.map((r) => (
          <li key={r.id} className="ch-aks-row" data-on={highlight === r.id ? '' : undefined}>
            <AskKey target={t} id={r.id} className="ch-aks-rank__row" words={`Ask about this: ${r.label}, ${label} ${r.display}${r.of ? ` ${r.of}` : ''}`}>
              <span className="ch-aks-rank__n ch-num">{r.rank}</span>
              <span className="ch-aks-rank__who">
                <b>{r.label}</b>
                {r.of && <small>{r.of}</small>}
              </span>
              <span className="ch-aks-track" data-signed={signed ? '' : undefined} aria-hidden="true">
                <i data-tone={r.tone} data-side={signed ? (r.value < 0 ? 'neg' : 'pos') : undefined} style={pct(r.pct / 100)} />
              </span>
              <b className="ch-aks-rank__val ch-num" data-tone={r.tone === 'plain' ? undefined : r.tone}>
                {r.display}
              </b>
            </AskKey>
            <OpenKey href={hrefs?.[r.id]} label={`Open ${r.label}’s stats`} />
          </li>
        ))}
      </ol>
      {signed && <p className="ch-aks-foot">Right of the line gains strokes on the baseline; left of it loses them.</p>}
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
      <td key={`${pi}-${mi}`} className="ch-num" data-tone={c && c.tone !== 'plain' ? c.tone : undefined} data-best={best ? '' : undefined}>
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

/** One measure round by round with its reference line (the thread's own chart), or this season against last on one scale. The whole trend asks; a point is read from the table beside it. */
export function TrendFigure(p: StudioProps<'trend'>) {
  const t = targetOf('trend', p);
  if (p.data.form === 'seasons') {
    return (
      <div className="ch-aks ch-aks-trend" data-size={p.size}>
        <SeasonCompare block={p.data.seasons} />
      </div>
    );
  }
  const { trend } = p.data;
  return (
    <div className="ch-aks ch-aks-trend" data-size={p.size}>
      <Trend block={trend} />
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
        {p.data.title && <p className="ch-aks-title">{p.data.title}</p>}
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
              <AskKey target={t} id={`hole:${h.n}`} className="ch-aks-chip" words={`Ask about this: hole ${h.n}, ${toParWords(d)}`}>
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
      {p.data.title && <p className="ch-aks-title">{p.data.title}</p>}
      <div className="ch-aks-round__card">
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

/** Strokes gained by part of the game on one axis: gain to the right of the line, loss to the left. A part asks about itself. */
export function StrokesGained(p: StudioProps<'strokes_gained'>) {
  const t = targetOf('strokes_gained', p);
  const max = Math.max(0.5, ...p.data.legs.map((l) => Math.abs(l.value)));
  return (
    <div className="ch-aks ch-aks-sg" data-size={p.size}>
      {p.data.title && <p className="ch-aks-title">{p.data.title}</p>}
      <ul className="ch-aks-sg__list" aria-label="Strokes gained by part of the game">
        {p.data.legs.map((l) => {
          const side = l.value > 0 ? 'pos' : l.value < 0 ? 'neg' : undefined;
          return (
            <li key={l.key} className="ch-aks-row">
              <AskKey target={t} id={l.key} className="ch-aks-sg__row" words={`Ask about this: strokes gained ${l.label.toLowerCase()}, ${l.display}`}>
                <span className="ch-aks-sg__label">{l.label}</span>
                <span className="ch-aks-track" data-signed="" aria-hidden="true">
                  {side && <i data-tone={side === 'pos' ? 'good' : 'loss'} data-side={side} style={pct(Math.abs(l.value) / max)} />}
                </span>
                <b className="ch-aks-sg__val ch-num" data-tone={side === 'pos' ? 'gain' : side === 'neg' ? 'loss' : undefined}>
                  {l.display}
                </b>
              </AskKey>
            </li>
          );
        })}
      </ul>
      {p.data.takeaway && <p className="ch-aks-foot">{p.data.takeaway}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- distance profile */

/** Make rate or feet left by distance band, each with its attempts, or where the misses go. Each band and each direction asks (the lead's marks). */
export function DistanceProfile(p: StudioProps<'distance_profile'>) {
  return (
    <div className="ch-aks ch-aks-dist" data-size={p.size}>
      {p.data.form === 'bands' ? <Drawing block={p.data.bands} /> : p.data.form === 'putts' ? <PuttProfile block={p.data.putts} /> : <MissPattern block={p.data.misses} />}
    </div>
  );
}

/* ---------------------------------------------------------------- schedule */

const EVENT_WORD: Record<StudioEvent['kind'], string> = { practice: 'Practice', qualifier: 'Qualifier', tournament: 'Tournament', travel: 'Travel', class: 'Class', other: 'Event' };

function repliesWords(r: NonNullable<StudioEvent['replies']>): string {
  const parts = [`${r.going} going`, r.out > 0 ? `${r.out} out` : null, r.waiting > 0 ? `${r.waiting} not replied` : null].filter(Boolean);
  return parts.join(', ');
}

/** Days with their events: the day as the calendar's tile, each event with its time, its place, the replies in and the class conflicts. An event asks about itself; its arrow opens it on the Calendar. */
export function Schedule(p: StudioProps<'schedule'>) {
  const t = targetOf('schedule', p);
  return (
    <div className="ch-aks ch-aks-sched" data-size={p.size}>
      {p.data.title && <p className="ch-aks-title">{p.data.title}</p>}
      <ol className="ch-aks-sched__days">
        {p.data.days.map((d) => {
          const parts = dayParts(d.date);
          return (
            <li key={d.date} className="ch-aks-sched__day">
              <span className="ch-akc-tile ch-aks-sched__date" aria-hidden="true">
                <small>{parts?.weekday}</small>
                <b className="ch-num">{parts?.day}</b>
                <small>{parts?.month}</small>
              </span>
              <ul aria-label={dayWords(d.date, true)}>
                {d.events.length === 0 && <li className="ch-aks-none">Nothing on the calendar.</li>}
                {d.events.map((e) => (
                  <li key={e.id} className="ch-aks-row">
                    <AskKey target={t} id={e.id} className="ch-aks-sched__event" words={`Ask about this: ${e.title}, ${dayWords(d.date)}${e.time ? `, ${e.time}` : ''}`}>
                      <span className="ch-aks-sched__bar" data-kind={e.kind} aria-hidden="true" />
                      <span className="ch-aks-sched__tx">
                        <b>{e.title}</b>
                        <small className="ch-num">{[EVENT_WORD[e.kind], e.time ?? 'All day', e.place].filter(Boolean).join(' · ')}</small>
                        {e.replies && <small className="ch-num">{repliesWords(e.replies)}</small>}
                        {!!e.conflicts && (
                          <small className="ch-aks-sched__clash">
                            {plural(e.conflicts, 'player has', 'players have')} a class then
                          </small>
                        )}
                      </span>
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
      <p className="ch-aks-title">
        {title}
        {status && <small>{status}</small>}
      </p>
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

/** One sentence about a visual (said as what it is: measured, a pattern, or a guess), a note the coach asked to keep, or what is on record. */
export function Note(p: StudioProps<'note'>) {
  const t = targetOf('note', p);
  if (p.data.form === 'kept') return <CoachNoteChip note={p.data.note} />;
  if (p.data.form === 'visual') {
    return (
      <p className="ch-aks ch-aks-note" data-claim={p.data.claim} data-size={p.size}>
        <b>{CLAIM_WORD[p.data.claim]}</b> {p.data.text}
      </p>
    );
  }
  return (
    <div className="ch-aks ch-aks-record" data-size={p.size}>
      <p className="ch-aks-title">{p.data.title}</p>
      <ul>
        {p.data.rows.map((r) => (
          <li key={r.label} className="ch-aks-row">
            <AskKey target={t} id={r.label} className="ch-aks-record__row" words={`Ask about this: ${r.label}, ${r.value}`}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </AskKey>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What a task will do. The frame, the keys and the ring are the shell's (parts/TaskCard.tsx); this is the body it mounts. */
export function ActionPreview(p: StudioProps<'action_preview'>) {
  return <CardBody tool={p.data.tool} proposal={p.data.proposal} receipt={null} phase={p.data.phase ?? 'proposed'} density={p.size} roster={p.roster} team={p.team} />;
}

/** What a task did: the same body in its saved tense, so the receipt is the preview the coach confirmed, not a second object. */
export function Receipt(p: StudioProps<'receipt'>) {
  const { receipt } = p.data;
  const phase = receipt.status === 'completed' ? 'saved' : receipt.status === 'partial' ? 'partial' : receipt.status === 'held' ? 'held' : receipt.status === 'cancelled' ? 'undone' : 'failed';
  return <CardBody tool={p.data.tool} proposal={p.data.proposal} receipt={receipt} phase={phase} density={p.size} roster={p.roster} team={p.team} />;
}

/** Rows and columns with a caption that names the source: the fallback, always available. */
export function Table(p: StudioProps<'table'>) {
  return (
    <div className="ch-aks ch-aks-table" data-size={p.size}>
      <p className="ch-aks-title">{p.data.table.caption}</p>
      <DataTable table={p.data.table} />
    </div>
  );
}
