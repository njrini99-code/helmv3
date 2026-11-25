'use client';

import { ArrowRight, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChTeamForm } from '../../data/home';
import type { ChScoringPoint } from '../../data/player-home';
import type { ChFormWindow } from '../../data/span';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { NoData } from '../../ui/NoData';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { formatWith } from '../../lib/dates';
import { formatFixed, formatSigned } from '../../lib/format';
import { deltaTone, deltaWords, type DeltaTone } from '../../lib/stats-signal';
import { rebuiltHref } from '../../shell/nav';
import { HomeSpanSwitch } from './HomeSpanSwitch';
import { ScoreChart } from './PlayerGame';

const shortDay = (ymd: string) => formatWith(new Date(`${ymd}T12:00:00Z`), { timeZone: 'UTC', month: 'short', day: 'numeric' });

/**
 * The team's best and toughest day on the line: the lowest and highest team average among days with two rounds or more,
 * so one player's round is never "the team's" day (HOME-P-13, Stats' `teamLineDays` rule). A tie goes to the newer day.
 * Null without the days and counts (an older fixture) or with fewer than two such days that differ.
 */
export function teamDays(form: Pick<ChTeamForm, 'line' | 'lineDays' | 'lineCounts'>): { best: number; worst: number } | null {
  const pts = form.line;
  const days = form.lineDays?.length === pts.length ? form.lineDays : null;
  const counts = form.lineCounts?.length === pts.length ? form.lineCounts : null;
  if (!days || !counts) return null;
  let best = -1;
  let worst = -1;
  pts.forEach((v, i) => {
    if (counts[i]! < 2) return;
    if (best < 0 || v <= pts[best]!) best = i;
    if (worst < 0 || v >= pts[worst]!) worst = i;
  });
  return best >= 0 && worst >= 0 && pts[best] !== pts[worst] ? { best, worst } : null;
}

/** The window Team scoring reads, in words, as Stats names it (prod audit 2026-11-15, HOME-P-11: "Each player’s last 10"). */
const FORM_WINDOW_WORDS: Record<ChFormWindow, string> = { last10: 'Each player’s last 10', season: 'This season', all: 'All time, every round' };

/** What the card's dates cover, said once: "Each player’s last 10 · Sep 1 – Sep 28". The rounds are counted in their own cell. */
export function formSpan(b: ChTeamForm['basis'], w: ChFormWindow): string {
  const span = b.from === b.to ? shortDay(b.from) : `${shortDay(b.from)} – ${shortDay(b.to)}`;
  return `${FORM_WINDOW_WORDS[w]} · ${span}`;
}

/** Under a figure's dash: why there is none, so totals-only rounds read as what they are and not as a gap. */
export function figureMissing(rounds: number, needs?: string): string {
  return rounds > 0 ? (needs ?? 'Too few rounds') : 'Totals only so far';
}

/** A change's figure and words, the signed figure only when the change clears its standard error (HOME-P-09, HOME-P-14). */
function changeLine(delta: number | null, tone: DeltaTone, signed: (d: number) => string, against: string): string | null {
  if (delta == null) return null;
  return tone ? `${signed(delta)} · ${deltaWords(delta, tone, against)}` : deltaWords(delta, tone, against);
}

/**
 * Team scoring on coach Home, in Player Home's Scoring layout (lay-01, owner 15 Nov 2026: the coach's Home matches the
 * player's): the one scoring line on Home (`ScoreChart`, SYS-04) drawing the team's average on each of its last round
 * days against the team's average, four figures each with its window, and one sentence. Phone and desktop read the same
 * `ChTeamForm` as before; only the drawing changed.
 */
export function TeamScoring({ form, phone }: { form: ChTeamForm; phone: boolean }) {
  // Last 10, Season or All time (HOME-P-10); only Last 10 has a previous window to set a change against.
  const win: ChFormWindow = form.window ?? 'last10';
  const against = 'vs previous 10';
  const avgTone = deltaTone(form.delta, form.deltaSe, true);
  const girTone = deltaTone(form.gir.delta, form.gir.se, false);
  const puttsTone = deltaTone(form.putts.delta, form.putts.se, true);
  const days = form.lineDays?.length === form.line.length ? form.lineDays : null;
  const points: ChScoringPoint[] = form.line.map((v, i) => ({ id: days?.[i] ?? String(i), label: days ? shortDay(days[i]!) : '', score: v, par: null }));
  const marks = teamDays(form);
  // The average against the previous window's, as the player's figure draws it: decorative, the words carry it.
  const prev = form.delta != null ? form.avg - form.delta : null;
  const lo = Math.min(form.avg, prev ?? form.avg) - 1.5;
  const hi = Math.max(form.avg, prev ?? form.avg) + 1.5;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const avgViz: ReactNode =
    prev != null ? (
      <span className="ch-ph-viz ch-ph-viz--avg" aria-hidden="true">
        <i className="is-was" style={{ left: `${at(prev)}%` }} />
        <i className={('is-now ' + avgTone).trim()} style={{ left: `${at(form.avg)}%` }} />
        <b style={{ left: `${Math.min(at(form.avg), at(prev))}%`, width: `${Math.abs(at(form.avg) - at(prev))}%` }} />
      </span>
    ) : null;
  // The window is said once, in the section's line (HOME-P-11); a figure names only what differs from it.
  const partOf = (n: number) => (n > 0 && n < form.basis.rounds ? `${n} of ${form.basis.rounds} rounds` : '');
  const figs: Array<{ k: string; v: ReactNode; m: string; tone: string; viz?: ReactNode }> = [
    {
      k: 'Average',
      v: formatFixed(form.avg),
      m: changeLine(form.delta, avgTone, (d) => formatSigned(d), against) ?? '',
      tone: avgTone,
      viz: avgViz,
    },
    {
      k: 'Greens',
      v: form.gir.pct != null ? `${Math.round(form.gir.pct)}%` : <NoData />,
      m: changeLine(form.gir.delta, girTone, (d) => `${formatSigned(d, 0)} pts`, against) ?? (form.gir.pct == null ? figureMissing(form.basis.girRounds, form.gir.needs) : partOf(form.basis.girRounds)),
      tone: form.gir.pct != null ? girTone : '',
    },
    {
      k: 'Putts',
      v: form.putts.avg != null ? formatFixed(form.putts.avg) : <NoData />,
      m: changeLine(form.putts.delta, puttsTone, (d) => formatSigned(d), against) ?? (form.putts.avg == null ? figureMissing(form.basis.puttsRounds) : partOf(form.basis.puttsRounds)),
      tone: form.putts.avg != null ? puttsTone : '',
    },
    // The rounds the figures rest on, in the card's window (HOME-P-14); this week's count is in This week.
    { k: 'Rounds', v: String(form.basis.rounds), m: win === 'last10' ? 'last 10 each' : win === 'season' ? 'this season' : 'all time', tone: '' },
  ];
  const meta = formSpan(form.basis, win);
  const label = `Team scoring, the team’s average on each of its last ${points.length} round days, from ${formatFixed(points[0]?.score)} to ${formatFixed(points[points.length - 1]?.score)}; the team average is ${formatFixed(form.avg)}.`;
  const body =
    points.length < 2 ? (
      <p className="ch-ph-tm-noline">The line starts with a second round day.</p>
    ) : (
      <ScoreChart points={points} phone={phone} format={(v) => formatFixed(v)} pin="Best day" label={label} mean={form.avg} best={marks ? marks.best : null} dodge />
    );
  const top = (
    <div className="ch-ph-game__top">
      {body}
      <dl className="ch-ph-figs">
        {figs.map((f) => (
          <div key={f.k}>
            <dt>{f.k}</dt>
            <dd className={'ch-num ' + f.tone}>{f.v}</dd>
            {(f.viz || f.m) && (
              <dd className="ch-ph-figs__m ch-num">
                {f.viz}
                {f.m}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
  const note = marks && days && (
    <p className="ch-ph-note ch-num">
      <Icon icon={Pencil} size={14} />
      {`Best day ${formatFixed(form.line[marks.best])} on ${shortDay(days[marks.best]!)}, toughest ${formatFixed(form.line[marks.worst])} on ${shortDay(days[marks.worst]!)}, among days with two rounds or more.`}
    </p>
  );
  const stats = rebuiltHref('/golf/dashboard/stats');
  const more = stats && (
    <Button variant="ghost" rightIcon={ArrowRight} href={stats} className="ch-ph-card__more ch-btn--flush-end">
      Team stats
    </Button>
  );
  const picker = <HomeSpanSwitch value={win} />;

  if (phone) {
    return (
      <section className="ch-hm-sec ch-hm-sec--stat" aria-labelledby="ch-ph-tm-scoring">
        <div className="ch-hm-sec__h">
          <h2 id="ch-ph-tm-scoring">Team scoring</h2>
          <span className="ch-hm-meta">{meta}</span>
        </div>
        <div className="ch-ph-game is-phone ch-ph-tm">
          {picker}
          {top}
          {note}
          {more}
        </div>
      </section>
    );
  }
  return (
    <section className="ch-ph-game ch-ph-tm" aria-labelledby="ch-ph-tm-scoring">
      <div className="ch-ph-game__h">
        <div>
          <h2 id="ch-ph-tm-scoring">Team scoring</h2>
          <span>
            {meta}{points.length >= 2 ? ` · dashed line, the team average ${formatFixed(form.avg)}` : ''}
          </span>
        </div>
        {picker}
      </div>
      {top}
      {note}
      {more}
    </section>
  );
}

/**
 * Team scoring when the rounds didn't load (CH-2211): the section keeps its place and its title, as the player's Scoring
 * does (CH-2215), and the notice carries Try again unless the page's notice already does (`covered`, CH-1209).
 */
export function TeamScoringFailed({ phone, covered }: { phone: boolean; covered: boolean }) {
  const notice = <RefreshNotice code="CH-2211" title="Team scoring didn’t load" body="Posted rounds are safe. Try again." covered={covered} />;
  if (phone)
    return (
      <section className="ch-hm-sec ch-hm-sec--stat" aria-labelledby="ch-ph-tm-scoring">
        <div className="ch-hm-sec__h">
          <h2 id="ch-ph-tm-scoring">Team scoring</h2>
        </div>
        {notice}
      </section>
    );
  return (
    <section className="ch-ph-game ch-ph-tm" aria-labelledby="ch-ph-tm-scoring">
      <div className="ch-ph-game__h">
        <div>
          <h2 id="ch-ph-tm-scoring">Team scoring</h2>
        </div>
      </div>
      {notice}
    </section>
  );
}
