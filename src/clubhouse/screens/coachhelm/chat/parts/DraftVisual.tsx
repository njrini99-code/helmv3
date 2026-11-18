'use client';

import { Bell, LockKeyhole, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readQuickChatWeek } from '@/app/golf/actions/coachhelm-ask';
import type { ActionProposal, TaskVisual } from '@/lib/coachhelm/v3/chat/action-types';
import { clockIn, localDateIn, type QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';
import { formatWith } from '../../../../lib/dates';
import { pluralWord } from '../../../../lib/plural';
import { useQcSeam } from '../../../../shell/quick-chat/qc-seam';
import { Avatar } from '../../../../ui/Avatar';
import { Icon } from '../../../../ui/Icon';
import { useDraftMotion, type DraftMotionProps } from './DraftVisual.motion';
import { speakClock, speakSpan } from './fact-speech';

export type { DraftMotionProps, DraftState } from './DraftVisual.motion';
type Visual<K extends TaskVisual['kind']> = Extract<TaskVisual, { kind: K }>;
type Props<K extends TaskVisual['kind']> = { visual: Visual<K> } & DraftMotionProps;
const dayWord = (date: string, opts: Intl.DateTimeFormatOptions) => formatWith(new Date(`${date.slice(0, 10)}T12:00:00Z`), { ...opts, timeZone: 'UTC' });
const shortDate = (date: string) => dayWord(date, { month: 'short', day: 'numeric' });
const plusDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoursOf = (time: string) => { const [h = 0, m = 0] = time.split(':').map(Number); return h + m / 60; };
const clock12 = (v: number) => `${Math.floor(v) % 12 || 12}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`;
const signed = (n: number) => n === 0 ? 'E' : n < 0 ? `−${Math.abs(n)}` : `+${n}`;
const figureNumber = (n: number) => String(n).replace('-', '−');

/** Faces past the row's limit stay a count. The names themselves stay in the figure label. */
function CoinRow({ names, delay, step, limit }: { names: readonly string[]; delay: number; step: number; limit: number }) {
  const shown = names.slice(0, limit);
  const more = names.length - shown.length;
  if (!shown.length) return null;
  return <div className="ch-ak-dv-coins" aria-hidden="true">{shown.map((name, i) => <span key={`${name}-${i}`} data-draft-motion="pop" data-delay={delay + i * step}><Avatar name={name} size="xs" /></span>)}{more > 0 && <span className="ch-ak-dv-more ch-num" data-draft-motion="pop" data-delay={delay + shown.length * step}>+{more}</span>}</div>;
}

/** Calendar occupancy is not class availability. Unknown days keep a neutral dot. */
export function WeekDraft({ visual, fresh = false, state = 'draft' }: Props<'cal'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const seam = useQcSeam();
  const [week, setWeek] = useState<QuickChatWeek | null>(seam?.week ?? null);
  useEffect(() => {
    if (visual.calendar || seam || !fresh) return;
    let live = true;
    void readQuickChatWeek(visual.date).then((w) => { if (live) setWeek(w); }).catch(() => undefined);
    return () => { live = false; };
  }, [visual.calendar, visual.date, seam, fresh]);
  const calendar = visual.calendar;
  const dow = (new Date(`${visual.date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const days = Array.from({ length: 5 }, (_, i) => plusDays(visual.date, (dow <= 4 ? -dow : 2 - dow) + i));
  const start = visual.start ? hoursOf(visual.start) : null;
  const end = visual.end ? hoursOf(visual.end) : null;
  const first = Math.max(0, Math.min(19, Math.floor(start ?? 9) - 1));
  const span = Math.max(4.4, (end ?? first + 4.4) - first + .25);
  const pct = (h: number) => Math.max(0, Math.min(100, (h - first) / span * 100));
  const events = calendar?.events ?? (week?.items ?? []).map((e) => {
    const zone = week?.timeZone ?? 'UTC';
    const a = clockIn(e.start, zone), b = e.end ? clockIn(e.end, zone) : null;
    const date = localDateIn(e.start, zone);
    return { date, title: e.title, start: `${a.hours}:${a.minutes}`, end: b && e.end ? (localDateIn(e.end, zone) === date ? `${b.hours}:${b.minutes}` : '24:00') : null };
  });
  const knownDays = calendar?.days ?? week?.days;
  const conflict = start !== null && end !== null && events.some((e) => e.date === visual.date && e.end && hoursOf(e.start) < end && hoursOf(e.end) > start);
  const slotTop = start === null ? 4 : pct(start);
  const slotHeight = start === null || end === null ? 22 : Math.max(8, pct(end) - pct(start));
  return (
    <div ref={ref} className="ch-ak-dv ch-ak-dv-week" data-state={state}>
      <figure aria-label={`${visual.title}, ${shortDate(visual.date)}. ${knownDays ? 'Team calendar checked; class availability is not included.' : 'Calendar availability has not been checked.'}${conflict ? ' Overlaps another calendar event.' : ''}`}>
        <div className="ch-ak-dv-days" aria-hidden="true"><span />{days.map((d, i) => {
          const known = knownDays?.find((x) => x.date === d);
          return <div key={d} data-draft-motion="rise" data-delay={i * 40} data-selected={d === visual.date}><small>{dayWord(d, { weekday: 'short' })}</small><b>{Number(d.slice(8))}</b><i className="ch-ak-dv-day-dot" data-busy={known?.hasEvent} data-draft-motion={known ? 'pop' : undefined} data-delay={560 + i * 300} /></div>;
        })}</div>
        <div className="ch-ak-dv-calendar" aria-hidden="true">
          <div className="ch-ak-dv-hours">{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ top: `${pct(first + i)}%` }}>{(first + i) % 12 || 12}</span>)}</div>
          {days.map((d, i) => <div key={d} className="ch-ak-dv-day" data-date={d} data-selected={d === visual.date} data-draft-motion="rise" data-delay={i * 40}>
            {knownDays?.some((x) => x.date === d) && <i className="ch-ak-dv-scan" data-draft-motion="scan" data-delay={260 + i * 300} />}
            {events.filter((e) => e.date === d).map((e, j) => {
              const from = hoursOf(e.start), to = e.end ? hoursOf(e.end) : null;
              if (from >= first + span || (to !== null && to <= first)) return null;
              return <span key={`${e.title}-${j}`} className="ch-ak-dv-busy" style={{ top: `${pct(from)}%`, ...(to === null ? {} : { height: `${Math.max(5, pct(to) - pct(from))}%` }) }} title={`${e.title}, ${e.start}${e.end ? `–${e.end}` : ', end unknown'}`}>{e.title}</span>;
            })}
            {d === visual.date && state !== 'gone' && <div className="ch-ak-dv-slot" data-conflict={conflict} data-draft-motion={fresh ? 'pop' : undefined} data-delay={knownDays ? 1760 : 280} style={{ top: `${slotTop}%`, height: `${slotHeight}%` }}><b>{visual.title}</b><small>{visual.start ? (visual.end ? speakSpan(visual.start, visual.end) : speakClock(visual.start)) : 'All day'}</small></div>}
          </div>)}
        </div>
        <figcaption>{knownDays ? 'Team calendar' : 'Calendar not checked'}{conflict ? ' · overlapping event' : ''}{calendar ? ` · ${calendar.timeZone}` : ''}</figcaption>
      </figure>
    </div>
  );
}

const fact = (p: ActionProposal, label: string) => p.facts.find((f) => f.label === label)?.value ?? null;
/** Existing announcement consumer remains compatible. */
export function LockPreview({ proposal, team, fresh = false, state = 'draft' }: { proposal: ActionProposal; team?: string } & DraftMotionProps) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const urgent = /urgent/i.test(fact(proposal, 'Urgency') ?? '');
  const [now] = useState(() => new Date());
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return <div ref={ref} className="ch-ak-lock" aria-hidden="true"><div className="tm"><b className="ch-num" suppressHydrationWarning>{clock12(now.getHours() + now.getMinutes() / 60)}</b><span suppressHydrationWarning>{day}</span></div><div className="ban" data-draft-motion="pin"><span className="app"><Icon icon={Megaphone} size={15} /></span><span className="tx"><small>{team && <em>{team}</em>}<span className={urgent ? 'is-urgent' : undefined}>{urgent ? 'Urgent · now' : 'Announcement · now'}</span></small><b>{fact(proposal, 'Title') ?? proposal.summary}</b>{fact(proposal, 'Message') && <span className="bd">{fact(proposal, 'Message')}</span>}</span></div></div>;
}

export function QualDraft({ visual, fresh = false, state = 'draft' }: Props<'qual'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const scored = Math.max(0, visual.total - visual.picks);
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-qual" data-state={state}><figure aria-label={`${visual.title}. ${visual.rounds} rounds; ${visual.total} spots, ${scored} by score and ${visual.picks} coach picks. ${visual.field} players.`}>
    <div className="ch-ak-dv-rounds">{Array.from({ length: visual.rounds }, (_, i) => {
      // A start date is not a promise that every round is on a consecutive day.
      const round = visual.roundDetails?.[i];
      const date = round?.date ?? (i === 0 ? visual.start : undefined);
      return <div key={i} className="ch-ak-dv-round" data-draft-motion="slide" data-delay={i * 90}>{date ? <DateTile date={date} /> : <span className="ch-ak-dv-round-number">{i + 1}</span>}<span><b>Round {i + 1}</b><small>{[date ? shortDate(date) : 'Date not set', round?.course, round?.holes ? `${round.holes} holes` : null].filter(Boolean).join(' · ')}</small></span></div>;
    })}</div>
    <CoinRow names={visual.players ?? []} delay={400} step={50} limit={7} />
    <div className="ch-ak-dv-seat-meter" aria-hidden="true">{Array.from({ length: visual.total }, (_, i) => <i key={i} data-pick={i >= scored} data-draft-motion="pop" data-delay={780 + i * 80} />)}</div>
    <figcaption>{scored} by score{visual.picks ? ` · ${visual.picks} coach ${pluralWord(visual.picks, 'pick', 'picks')}` : ''} · {visual.field} players{visual.deadline ? ` · Enter by ${shortDate(visual.deadline)}` : ''}</figcaption>
  </figure></div>;
}

export function TaskDraft({ visual, today, fresh = false, state = 'draft' }: Props<'task'> & { today: string }) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const delta = visual.due ? Math.ceil((Date.parse(`${visual.due.slice(0, 10)}T12:00:00Z`) - Date.parse(`${today.slice(0, 10)}T12:00:00Z`)) / 86400000) : null;
  const days = delta !== null && Number.isFinite(delta) ? delta : null;
  const offset = 100 - Math.min(100, Math.max(0, days ?? 0) / 7 * 100);
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-task" data-state={state}><figure aria-label={`${visual.title}. ${visual.due ? `Due ${shortDate(visual.due)}.` : 'No due date.'} Assigned to ${visual.who.join(', ')}.${visual.reminder ? ` Reminder: ${visual.reminder}.` : ''}`}>
    <div className="ch-ak-dv-task-row">{days !== null && <svg viewBox="0 0 64 64" className="ch-ak-dv-ring" aria-hidden="true"><circle cx="32" cy="32" r="26" className="ch-ak-dv-track" /><circle cx="32" cy="32" r="26" pathLength="100" className="ch-ak-dv-progress" style={{ strokeDashoffset: offset }} data-draft-motion="ring" data-end={offset} /><text x="32" y="31" textAnchor="middle">{Math.abs(days)}</text><text x="32" y="44" textAnchor="middle" className="ch-ak-dv-ring-label">{days < 0 ? 'overdue' : pluralWord(days, 'day', 'days')}</text></svg>}
      <div className="ch-ak-dv-task-body"><b>{visual.title}</b><CoinRow names={visual.who} delay={160} step={80} limit={3} />
      {visual.reminder !== undefined && <small className="ch-ak-dv-reminder">{visual.reminder && <span data-draft-motion="bell" data-delay="500"><Icon icon={Bell} size={14} /></span>}{visual.reminder ?? 'No reminder'}</small>}
      {visual.repeats && <small>{visual.repeats}</small>}{visual.countsFrom && <small>{visual.countsFrom}</small>}</div></div>
    <figcaption>{visual.due ? `Due ${shortDate(visual.due)}` : 'Due date not set'}{days !== null ? ' · ring shows up to one week' : ''}</figcaption>
  </figure></div>;
}

/** History points must be real round figures; a target alone never produces a trend. */
export function GoalDraft({ visual, fresh = false, state = 'draft' }: Props<'goal'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const points = (visual.history ?? []).filter((p) => Number.isFinite(p.value));
  const band = visual.targetBand;
  const values = [...points.map((p) => p.value), visual.target, ...(band ? [band.low, band.high] : [])];
  const low = Math.min(...values), high = Math.max(...values), range = Math.max(high - low, .1);
  const y = (v: number) => 26 + (high - v) / range * 92;
  const x = (i: number) => 34 + i / Math.max(1, points.length - 1) * 188;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.value)}`).join(' ');
  const last = points.at(-1);
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-goal" data-state={state}><figure aria-label={`${visual.player}, ${visual.stat}. Target ${figureNumber(visual.target)} in ${visual.days} days.${points.length ? ` ${points.length} recorded rounds: ${points.map((p) => `${p.at}: ${figureNumber(p.value)}`).join('; ')}.` : ' No round history available.'}`}>
    <div className="ch-ak-dv-goal-heading"><span><small>{visual.stat}</small><b>{figureNumber(visual.target)}</b></span><small>{visual.player} · {visual.days} days</small></div>
    {points.length >= 2 ? <svg viewBox="0 0 340 156" aria-hidden="true">
      <line x1="34" x2="328" y1={y(high)} y2={y(high)} className="ch-ak-dv-grid" /><line x1="34" x2="328" y1={y(low)} y2={y(low)} className="ch-ak-dv-grid" />
      <text x="28" y={y(high) + 4} textAnchor="end">{figureNumber(high)}</text><text x="28" y={y(low) + 4} textAnchor="end">{figureNumber(low)}</text>
      {band && <rect x="256" y={y(Math.max(band.high, band.low))} width="66" height={Math.max(1, Math.abs(y(band.low) - y(band.high)))} rx="4" className="ch-ak-dv-band" data-draft-motion="band" data-delay="900" />}
      <line x1="256" x2="328" y1={y(visual.target)} y2={y(visual.target)} className="ch-ak-dv-target" data-draft-motion="rise" data-delay="900" />
      <text x="328" y={Math.max(14, y(visual.target) - 9)} textAnchor="end">Target {figureNumber(visual.target)}</text>
      <path d={path} pathLength="1" className="ch-ak-dv-history" data-draft-motion="draw" />{points.map((p, i) => <circle key={`${p.at}-${i}`} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 3} className="ch-ak-dv-point" data-draft-motion="pop" data-delay={i * 70} />)}
      {last && <path d={`M${x(points.length - 1) + 8} ${y(last.value)} C246 ${y(last.value)} 242 ${y(visual.target)} 256 ${y(visual.target)}`} pathLength="1" className="ch-ak-dv-projection" data-draft-motion="draw" data-delay="1140" />}
      <text x="34" y="148">{shortDate(points[0]!.at)} – {shortDate(last!.at)}</text><text x="328" y="148" textAnchor="end">{visual.days} days</text>
    </svg> : <p className="ch-ak-dv-empty">{points.length === 1 ? `One recorded round: ${figureNumber(points[0]!.value)}. A trend needs more rounds.` : 'No round history available for this preview.'}</p>}
    <figcaption>{visual.historyNote ?? (points.length >= 2 ? 'Recorded rounds · guide shows the goal, not a forecast' : 'The target is shown as proposed.')}</figcaption>
  </figure></div>;
}

export function NoteDraft({ visual, fresh = false, state = 'draft' }: Props<'note'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const holes = (visual.holes ?? []).filter((h) => h.number >= 1 && h.number <= 18 && Number.isFinite(h.par));
  const largest = Math.max(2, ...holes.flatMap((h) => h.score === null ? [] : [Math.abs(h.score - h.par)]));
  const height = (n: number) => Math.abs(n) / largest * 40;
  const cx = (n: number) => (n - .5) * 18 + 8;
  const selected = holes.find((h) => h.number === visual.hole);
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-note" data-state={state}><figure aria-label={`Note for ${visual.player}${visual.hole ? ` on hole ${visual.hole}` : ''}.${holes.length ? ` Recorded holes: ${holes.map((h) => `${h.number}, par ${h.par}, score ${h.score ?? 'not recorded'}`).join('; ')}.` : ' Hole scores unavailable.'}`}>
    <div className="ch-ak-dv-heading"><b>{visual.player}{visual.course ? ` · ${visual.course}` : ''}</b>{visual.roundDate && <small>{shortDate(visual.roundDate)}</small>}</div>
    {holes.length > 0 && <svg viewBox="0 0 340 132" aria-hidden="true"><line x1="8" x2="332" y1="72" y2="72" className="ch-ak-dv-grid" />{holes.map((h, i) => {
      const delta = h.score === null ? null : h.score - h.par;
      return <g key={h.number}>{delta !== null ? <rect x={cx(h.number) - 5} y={delta > 0 ? 72 - height(delta) : delta === 0 ? 70 : 72} width="10" height={delta === 0 ? 4 : height(delta)} rx="2" className="ch-ak-dv-hole-bar" data-under={delta < 0} data-over={delta > 0} style={{ transformOrigin: `${cx(h.number)}px 72px` }} data-draft-motion="bar" data-delay={i * 20} /> : <text x={cx(h.number)} y="75" textAnchor="middle">—</text>}<text x={cx(h.number)} y="126" textAnchor="middle">{h.number}</text></g>;
    })}{selected && <g transform={`translate(${cx(selected.number)} 24)`}><g className="ch-ak-dv-pin" data-draft-motion="pin" data-delay="500"><path d="M0 11C-4 6-8 2-8-3a8 8 0 0 1 16 0c0 5-4 9-8 14Z" /><circle cy="-3" r="3" /></g></g>}</svg>}
    <blockquote className="ch-ak-dv-note-bubble" data-draft-motion="pop" data-delay={holes.length ? 860 : 0}>{visual.note}</blockquote>
    {selected && <figcaption>Hole {selected.number} · par {selected.par} · {selected.score === null ? 'score not recorded' : `made ${selected.score}`}</figcaption>}
  </figure></div>;
}

/** A schematic route, never a map or a distance estimate. */
export function TripDraft({ visual, fresh = false, state = 'draft' }: Props<'trip'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const path = 'M26 62 C96 62 110 22 178 32 S270 60 312 26';
  const ground = visual.how === 'van' || visual.how === 'bus' || visual.how === 'carpool';
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-trip" data-state={state}><figure aria-label={`${visual.how} trip from ${visual.from ?? 'departure location not set'} to ${visual.to}, leaves ${shortDate(visual.leave)}. Schematic route, not to scale.`}>
    <svg viewBox="0 0 340 96" aria-hidden="true"><path d={path} className="ch-ak-dv-route-base" /><path d={path} pathLength="1" className="ch-ak-dv-route-line" data-route-path="" data-draft-motion="draw" data-ms="1100" /><circle cx="26" cy="62" r="5" className="ch-ak-dv-origin" /><g transform="translate(312 26)"><g data-draft-motion="pop" data-delay="900"><path d="M0 8V-20l14 5-14 5" className="ch-ak-dv-flag" /></g></g><g transform="translate(312 26)"><g data-draft-motion="route">{ground ? <g className="ch-ak-dv-vehicle"><rect x="-13" y="-16" width="26" height="14" rx="4" /><path d="M2-14h7l2 6H2Z" /><circle cx="-7" cy="-1" r="3" /><circle cx="8" cy="-1" r="3" /></g> : <path d="m-10-8 8-2 1-10 4 0 1 10 8 2v3L4-6 3 1h-4l-1-7-8 1Z" className="ch-ak-dv-plane" />}</g></g></svg>
    <div className="ch-ak-dv-route-ends"><span><small>Leaves</small><b>{visual.from ?? 'Departure not set'}</b><small>{shortDate(visual.leave)}</small></span><small>{visual.how[0]?.toUpperCase()}{visual.how.slice(1)}</small><span><small>{visual.back ? 'Back' : 'Destination'}</small><b>{visual.to}</b>{visual.back && <small>{shortDate(visual.back)}</small>}</span></div>
    {(visual.hotel || visual.rooms) && <div className="ch-ak-dv-rooms" data-draft-motion="rise" data-delay="1060">{visual.hotel && <b>{visual.hotel}</b>}{visual.rooms && <p>{visual.rooms}</p>}</div>}
    {((visual.gear?.length ?? 0) > 0 || visual.uniform) && <ul className="ch-ak-dv-gear">{[...(visual.gear ?? []), ...(visual.uniform ? [visual.uniform] : [])].map((item, i) => <li key={`${item}-${i}`} data-draft-motion="pop" data-delay={1200 + i * 70}>{item}</li>)}</ul>}
    <figcaption>Schematic route · not to scale</figcaption>
  </figure></div>;
}

export function LineupDraft({ visual, fresh = false, state = 'draft' }: Props<'lineup'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-lineup" data-state={state}><figure aria-label={`Proposed lineup. ${visual.seats.map((s) => `${s.alternate ? 'Alternate' : `Slot ${s.slot ?? 'unassigned'}`}: ${s.name}${s.tied ? ', tied in source standings' : ''}${s.locked || visual.locked ? ', locked' : ''}`).join('; ')}.`}>
    <div className="ch-ak-dv-lineup-columns">{!!visual.standings?.length && <div className="ch-ak-dv-standings"><small>{visual.source ?? 'Standings'}</small>{visual.standings.map((s, i) => <div key={`${s.name}-${i}`} className="ch-ak-dv-standing" data-tied={s.tied} data-draft-motion="rise" data-delay={i * 45}><span data-coin-source={i}><Avatar name={s.name} size="xs" /></span><span>{s.name}{s.tied && <small>Tied</small>}</span><b>{s.score === null ? '—' : signed(s.score)}</b></div>)}</div>}
      <ol className="ch-ak-dv-seats">{visual.seats.map((s, i) => {
        const source = visual.standings?.findIndex((p) => p.name === s.name) ?? -1;
        return <li key={`${s.name}-${i}`} data-alternate={s.alternate} data-tied={s.tied}><span className="ch-ak-dv-seat-number">{s.alternate ? 'Alt' : s.slot ?? '—'}</span><span data-draft-motion={source >= 0 ? 'flight' : 'pop'} data-source={source} data-delay={500 + i * 140}><Avatar name={s.name} size="xs" /></span><span data-draft-motion="rise" data-delay={source >= 0 ? 962 + i * 140 : i * 80}>{s.name}{s.history && <small>{s.history}</small>}{s.tied && <small>Tied in source</small>}</span>{(s.locked || visual.locked) && <span className="ch-ak-dv-lock" data-draft-motion="lock" data-delay={i * 70} aria-label="Locked"><Icon icon={LockKeyhole} size={13} /></span>}</li>;
      })}</ol></div>
    <figcaption>{visual.locked ? 'Lineup locked' : 'Locking is a separate action'}{visual.standings?.some((s) => s.tied) ? ' · ties remain the coach’s call' : ''}</figcaption>
  </figure></div>;
}

/** Deterministic geometry: dots illustrate only an explicitly supplied ball count. */
export function drillRingPoints(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: Number.isFinite(count) ? Math.max(0, Math.min(40, Math.floor(count))) : 0 }, (_, i) => {
    const a = i / Math.min(40, Math.floor(count)) * Math.PI * 2 - Math.PI / 2;
    return { x: 170 + 64 * Math.cos(a), y: 78 + 35 * Math.sin(a) };
  });
}

/** The thread as it is: the last message only when one was read, then the draft. Nothing is sent from this figure. */
export function MessageDraft({ visual, fresh = false, state = 'draft' }: Props<'msg'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const people = `${visual.count} ${visual.count === 1 ? 'person' : 'people'}`;
  const placed = state === 'landing' || state === 'landed';
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-msg" data-state={state}><figure aria-label={`Draft to ${visual.thread}, ${people}.${visual.last ? ` Last message: ${visual.last}.` : ''} Draft: ${visual.draft}`}>
    <div className="ch-ak-dv-thread">
      <div className="ch-ak-dv-thread-h"><b>{visual.thread}</b><small>{people}</small></div>
      {visual.last && <p className="ch-ak-dv-bubble is-them" data-draft-motion="rise">{visual.last}</p>}
      <p className="ch-ak-dv-bubble is-draft" data-draft-motion="rise" data-delay={visual.last ? 140 : 0}>{visual.draft}</p>
      <small className="ch-ak-dv-thread-meta">{placed ? 'In the thread' : 'Draft · only you can see this'}</small>
    </div>
  </figure></div>;
}

export function DrillDraft({ visual, fresh = false, state = 'draft' }: Props<'drill'>) {
  const ref = useDraftMotion<HTMLDivElement>(fresh, state);
  const gate = visual.diagram?.kind === 'gate';
  const balls = drillRingPoints(visual.diagram?.balls ?? 0);
  return <div ref={ref} className="ch-ak-dv ch-ak-dv-drill" data-state={state}><figure aria-label={`${visual.name}, ${visual.minutes} minutes. ${gate ? 'Gate setup schematic, not to scale.' : `${visual.area.replace('_', ' ')} drill.`}${visual.setup ? ` Setup: ${visual.setup}` : ''}`}>
    {gate ? <svg viewBox="0 0 340 154" aria-hidden="true"><ellipse cx="170" cy="78" rx="150" ry="62" className="ch-ak-dv-green" data-draft-motion="pop" /><ellipse cx="170" cy="78" rx="64" ry="35" className="ch-ak-dv-drill-ring" />{balls.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" className="ch-ak-dv-ball" data-draft-motion="pop" data-delay={460 + i * 60} />)}<circle cx="170" cy="78" r="6" className="ch-ak-dv-cup" /><path d="M170 78V48l12 5-12 5" className="ch-ak-dv-flag" />{[68, 84].map((y, i) => <rect key={y} x="201" y={y} width="3" height="8" rx="1.5" className="ch-ak-dv-tee" data-draft-motion="pin" data-delay={260 + i * 80} />)}<path d="M234 78L172 78" pathLength="1" className="ch-ak-dv-roll" data-roll-path="" data-draft-motion="draw" data-delay="1000" /><g transform="translate(172 78)"><circle r="4" className="ch-ak-dv-ball" data-draft-motion="roll" data-delay="1000" /></g>{visual.diagram?.distance !== undefined && <text x="246" y="68">{visual.diagram.distance} {visual.diagram.unit}</text>}</svg> : <div className="ch-ak-dv-drill-stations" aria-hidden="true"><span data-draft-motion="pop">Setup</span><i /><span data-draft-motion="pop" data-delay="160">Practice</span><i /><span data-draft-motion="pop" data-delay="320">Review</span></div>}
    <div className="ch-ak-dv-drill-copy"><b>{visual.name}</b><small>{visual.area.replace('_', ' ')} · {visual.minutes} min</small>{visual.setup ? <p data-draft-motion="rise" data-delay="1200">{visual.setup}</p> : <p>Setup has not been specified.</p>}{visual.goal && <p data-draft-motion="rise" data-delay="1270">{visual.goal}</p>}</div>
    <figcaption>{gate ? 'Setup schematic · not to scale' : 'Practice sequence · setup details above'}</figcaption>
  </figure></div>;
}

/** Optional parent dispatch. A message figure is the thread that was read, not a sent message. */
export function DraftVisual({ visual, fresh = false, state = 'draft', today = new Date().toISOString().slice(0, 10) }: { visual?: TaskVisual; today?: string } & DraftMotionProps) {
  if (!visual) return null;
  switch (visual.kind) {
    case 'cal': return <WeekDraft visual={visual} fresh={fresh} state={state} />;
    case 'qual': return <QualDraft visual={visual} fresh={fresh} state={state} />;
    case 'task': return <TaskDraft visual={visual} today={today} fresh={fresh} state={state} />;
    case 'goal': return <GoalDraft visual={visual} fresh={fresh} state={state} />;
    case 'note': return <NoteDraft visual={visual} fresh={fresh} state={state} />;
    case 'trip': return <TripDraft visual={visual} fresh={fresh} state={state} />;
    case 'lineup': return <LineupDraft visual={visual} fresh={fresh} state={state} />;
    case 'drill': return <DrillDraft visual={visual} fresh={fresh} state={state} />;
    case 'msg': return <MessageDraft visual={visual} fresh={fresh} state={state} />;
    default: return null;
  }
}

export function draftDate(visual: TaskVisual | undefined): string | null {
  if (!visual) return null;
  if (visual.kind === 'cal') return visual.date;
  if (visual.kind === 'qual') return visual.start;
  if (visual.kind === 'task') return visual.due;
  if (visual.kind === 'trip') return visual.leave;
  return null;
}
export function DateTile({ date }: { date: string }) {
  return <span className="dt" aria-hidden="true">{dayWord(date, { weekday: 'short' })}<b className="ch-num">{Number(date.slice(8, 10))}</b></span>;
}
