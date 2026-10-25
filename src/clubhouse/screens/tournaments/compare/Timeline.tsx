'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { haptic } from '../../../lib/haptics';
import { Segmented } from '../../../ui/Segmented';
import { daysUntil, formatSigned, plural, tourDay } from '../format';
import type { ChTourCompareRound, ChTourEvent, ChTourScope } from '../types';
import { selectRounds, summarize, type ScopeEnv } from './scope';

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const FOREVER = { kind: 'range', from: '0000-01-01', to: '9999-12-31' } as const;

/**
 * The history timeline (board `Timeline`): every 18-hole round of the side being adjusted on one axis, the tournaments as
 * markers that pick an event, and the side's period as a range to drag (the whole bar, or either end). Arrow keys move an
 * end by a week, Shift by a month; the date fields say the same dates. It edits one side at a time, and the other side's
 * range stays in view, dashed.
 */
export function Timeline({
  A,
  B,
  target,
  onTarget,
  onChange,
  env,
  finished,
  from,
  to,
}: {
  A: ChTourScope;
  B: ChTourScope;
  target: 'a' | 'b';
  onTarget: (t: 'a' | 'b') => void;
  onChange: (side: 'a' | 'b', next: ChTourScope) => void;
  env: ScopeEnv;
  finished: readonly ChTourEvent[];
  /** The axis, first and last day. */
  from: string;
  to: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<[string, string] | null>(null);
  const D0 = at(from);
  const D1 = at(to);
  const pct = (d: string) => ((at(d) - D0) / (D1 - D0)) * 100;
  const dateAt = (p: number) => iso(D0 + Math.max(0, Math.min(1, p)) * (D1 - D0));

  const tsc = target === 'a' ? A : B;
  const osc = target === 'a' ? B : A;
  const rangeOf = (sc: ChTourScope): [string, string] | null => {
    if (sc.period.kind === 'range' && sc.context.kind !== 'event') return [sc.period.from, sc.period.to];
    const s = summarize(selectRounds(sc, env));
    return s.from && s.to ? [s.from, s.to] : null;
  };
  const cur: [string, string] = preview ?? rangeOf(tsc) ?? [from, to];
  const other = rangeOf(osc);
  const apply = (r: [string, string]) => {
    haptic('select');
    onChange(target, { ...tsc, context: tsc.context.kind === 'event' ? { kind: 'events' } : tsc.context, period: { kind: 'range', from: r[0], to: r[1] } });
  };

  // Every 18-hole round of the target's subject, a dot a day and kind: its mean against the course rating.
  const all = selectRounds({ ...tsc, context: { kind: 'all' }, period: FOREVER, refine: [] }, env).filter((r) => r.holes === 18 && r.vsRating != null);
  const byDay = new Map<string, { d: string; ctx: ChTourCompareRound['context']; v: number[] }>();
  for (const r of all) {
    const k = `${r.date}|${r.context}`;
    const cell = byDay.get(k) ?? { d: r.date, ctx: r.context, v: [] };
    cell.v.push(r.vsRating as number);
    byDay.set(k, cell);
  }
  const dots = [...byDay.values()].map((o) => ({ ...o, m: o.v.reduce((a, b) => a + b, 0) / o.v.length }));
  const ext = Math.max(1, ...dots.map((o) => Math.abs(o.m)));

  const gesture = (which: 0 | 1 | 'mid') => (e: PointerEvent<HTMLElement>) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const start = e.clientX;
    const r0: [string, string] = [...cur];
    let last: [string, string] | null = null;
    const show = (r: [string, string]) => {
      last = r;
      setPreview(r);
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (which === 'mid') {
        const dd = ((ev.clientX - start) / box.width) * (D1 - D0);
        const a = at(r0[0]) + dd;
        const b = at(r0[1]) + dd;
        if (a >= D0 && b <= D1) show([iso(a), iso(b)]);
        return;
      }
      const v = dateAt((ev.clientX - box.left) / box.width);
      show(which === 0 ? [v < r0[1] ? v : r0[1], r0[1]] : [r0[0], v > r0[0] ? v : r0[0]]);
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      move(ev);
      setPreview(null);
      if (last) apply(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const key = (which: 0 | 1) => (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 30 : 7;
    const r: [string, string] = [...cur];
    r[which] = iso(Math.max(D0, Math.min(D1, at(r[which]) + dir * step * DAY)));
    if (r[0] <= r[1]) apply(r);
  };

  const ss = summarize(selectRounds({ ...tsc, context: tsc.context.kind === 'event' ? { kind: 'events' } : tsc.context, period: { kind: 'range', from: cur[0], to: cur[1] } }, env));
  const months: string[] = [];
  for (let d = new Date(D0); d.getTime() < D1; d.setUTCMonth(d.getUTCMonth() + 2)) months.push(iso(d.getTime()));
  const seasons = env.seasons.map((s, i) => ({ s, left: pct(s.start < from ? from : s.start), right: pct(s.end > to ? to : s.end), now: i === 0 }));
  const label = `Scope ${target.toUpperCase()}`;

  return (
    <section className="ch-tour-cmp-tl" aria-label="History timeline">
      <div className="ch-tour-cmp-tl__top">
        <div className="ch-tour-cmp-tl__l">
          <Segmented size="sm" label="Timeline edits" value={target} onChange={onTarget} options={[{ value: 'a', label: 'Adjust A' }, { value: 'b', label: 'Adjust B' }]} />
          <span className="ch-tour-cmp-tl__dates">
            <input type="date" aria-label="Range start" value={cur[0]} max={cur[1]} onChange={(e) => e.target.value && apply([e.target.value, cur[1]])} />
            <span>to</span>
            <input type="date" aria-label="Range end" value={cur[1]} min={cur[0]} onChange={(e) => e.target.value && apply([cur[0], e.target.value])} />
          </span>
        </div>
        <div className="ch-tour-cmp-tl__legend">
          <span>
            <i className="f" />
            Tournament · click to pick
          </span>
          <span>
            <i className="q" />
            Qualifier
          </span>
          <span>
            <i className="p" />
            Practice
          </span>
        </div>
      </div>
      <div className="ch-tour-cmp-tl__track" ref={track}>
        <div className="ch-tour-cmp-tl__plot" aria-hidden="true">
          {seasons.map(({ s, left, right, now }) => (
            <span key={s.id} className={'ch-tour-cmp-tl__season' + (now ? ' is-now' : '')} style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}>
              <em>{s.label}</em>
            </span>
          ))}
          <span className="ch-tour-cmp-tl__col" style={{ left: `${pct(cur[0])}%`, width: `${Math.max(0.4, pct(cur[1]) - pct(cur[0]))}%` }} />
          <span className="ch-tour-cmp-tl__zero" />
          <span className="ch-tour-cmp-tl__yk is-top">Better than rating</span>
          <span className="ch-tour-cmp-tl__yk is-bottom">Worse</span>
          {dots.map((o) => (
            <i key={`${o.d}|${o.ctx}`} className={`ch-tour-cmp-tl__dot is-${o.ctx}${o.d >= cur[0] && o.d <= cur[1] ? ' is-in' : ''}`} style={{ left: `${pct(o.d)}%`, top: 28 + (o.m / ext) * 20 }} title={`${tourDay(o.d)} · ${formatSigned(o.m, 1)}`} />
          ))}
        </div>
        <div className="ch-tour-cmp-tl__axis" />
        {other && <div className="ch-tour-cmp-tl__sel is-other" style={{ left: `${pct(other[0])}%`, width: `${Math.max(0.6, pct(other[1]) - pct(other[0]))}%` }} />}
        <div className={'ch-tour-cmp-tl__sel' + (target === 'b' ? ' is-b' : '')} style={{ left: `${pct(cur[0])}%`, width: `${Math.max(0.6, pct(cur[1]) - pct(cur[0]))}%` }} onPointerDown={gesture('mid')}>
          <span className="ch-tour-cmp-tl__tag">{target.toUpperCase()}</span>
        </div>
        {finished.map((e) => (
          <span key={e.id} className="ch-tour-cmp-tl__mk" style={{ left: `${pct(e.startDate)}%` }}>
            <button
              type="button"
              aria-label={`Use ${e.name}`}
              aria-pressed={tsc.context.kind === 'event' && tsc.context.id === e.id}
              title={`${e.name} · ${tourDay(e.startDate)}`}
              onClick={() => {
                haptic('select');
                onChange(target, { ...tsc, context: { kind: 'event', id: e.id, rounds: null } });
              }}
            >
              <i className={'f' + (tsc.context.kind === 'event' && tsc.context.id === e.id ? ' is-on' : '')} />
            </button>
          </span>
        ))}
        {([0, 1] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="slider"
            className="ch-tour-cmp-tl__thumb"
            aria-label={w === 0 ? 'Range start' : 'Range end'}
            aria-valuetext={tourDay(cur[w], { month: 'long', day: 'numeric', year: 'numeric' })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct(cur[w]))}
            style={{ left: `${pct(cur[w])}%` }}
            onPointerDown={gesture(w)}
            onKeyDown={key(w)}
          />
        ))}
        {months.map((m) => (
          <span key={m} className="ch-tour-cmp-tl__lab" style={{ left: `${pct(m)}%` }}>
            {tourDay(m, { month: 'short', year: '2-digit' })}
          </span>
        ))}
      </div>
      <div className="ch-tour-cmp-tl__bot">
        <span>
          {preview ? 'Previewing · release to apply' : label} · {ss.n ? `${tsc.context.kind === 'events' || tsc.context.kind === 'event' ? `${plural(ss.events, 'event')} · ` : ''}${plural(ss.full, 'round')}` : 'no rounds in this range'}
        </span>
        <span>Arrow keys move an end by a week · Shift for a month</span>
      </div>
    </section>
  );
}

/** The axis for a set of rounds and seasons: from the earliest of them to a few weeks past the clock. */
export function axisOf(env: ScopeEnv, now: string): { from: string; to: string } {
  const starts = [...env.seasons.map((s) => s.start), ...env.rounds.map((r) => r.date)].sort();
  const first = starts[0] ?? now.slice(0, 10);
  const horizon = iso(at(now.slice(0, 10)) + 28 * DAY);
  const days = daysUntil(first, horizon);
  return { from: first, to: days > 0 ? horizon : iso(at(first) + 28 * DAY) };
}
