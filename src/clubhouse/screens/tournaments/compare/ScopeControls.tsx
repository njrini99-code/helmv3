'use client';

import { Avatar, AVATAR_SIZES } from '../../../ui/Avatar';
import { pluralWord } from '../../../lib/plural';
import { Segmented } from '../../../ui/Segmented';
import { Select } from '../../../ui/Select';
import { NO_DATA, plural, tourDay } from '../format';
import type { ChTourEvent, ChTourPlayer, ChTourScope, ChTourScopeContext, ChTourScopePeriod, ChTourScopeSubject } from '../types';
import { contextWords, subjectName, type ScopeNames, type ScopeSummary } from './scope';

const day = (iso: string) => tourDay(iso, { month: 'short', day: 'numeric' });
const dayYear = (iso: string) => tourDay(iso, { month: 'short', day: 'numeric', year: 'numeric' });

/** The person (or people) a side is about, as faces: a stack for a pooled side, one portrait for a player. */
export function Face({ scope, side, names }: { scope: ChTourScope; side: 'a' | 'b'; names: ScopeNames }) {
  const s = scope.subject;
  const who = s.kind === 'player' ? [subjectName(s, names)] : names.players.filter((p) => !p.alumni).slice(0, 3).map((p) => p.name);
  const stack = who.length > 1;
  return (
    <span className={'ch-tour-cmp-face' + (stack ? ' is-stack' : '')} style={{ ['--ch-tour-cmp-face' as string]: `${AVATAR_SIZES.lg}px` }} aria-hidden="true">
      {who.map((n) => (stack ? <Avatar key={n} name={n} size="sm" /> : <Avatar key={n} name={n} size="lg" />))}
      <i className={'ch-tour-cmp-face__tag' + (side === 'b' ? ' is-b' : '')}>{side.toUpperCase()}</i>
    </span>
  );
}

/** How a side's rounds read in a line: "11 rounds + 2 nine-hole · Aug 26 – Oct 7, 2026 · 3 courses · 8 of 11 with shot data". */
export function SummaryLine({ summary, side }: { summary: ScopeSummary; side: 'a' | 'b' }) {
  if (!summary.n)
    return (
      <div className="ch-tour-cmp-sum" data-ch-code="CH-16350">
        <span className="is-warn">No rounds in this sample</span>
        <span className="ch-sr-only"> for side {side.toUpperCase()}</span>
      </div>
    );
  return (
    <div className="ch-tour-cmp-sum">
      <span>
        <b>{summary.full}</b> {pluralWord(summary.full, 'round')}
        {summary.nine ? ` + ${summary.nine} nine-hole` : ''}
      </span>
      <span>
        {day(summary.from ?? '')} – {dayYear(summary.to ?? '')}
      </span>
      <span>{plural(summary.courses, 'course')}</span>
      {summary.players > 1 && <span>{summary.players} players</span>}
      <span className={summary.shot < summary.full ? 'is-warn' : undefined}>
        {summary.shot} of {summary.full} with shot data
      </span>
    </div>
  );
}

type PeriodChoice = 'season' | 'last-season' | 'l10' | 'event' | 'range';
const periodChoice = (s: ChTourScope): PeriodChoice => (s.context.kind === 'event' ? 'event' : s.period.kind === 'l20' ? 'l10' : s.period.kind);
type CtxChoice = 'events' | 'qual' | 'practice';
const ctxChoice = (c: ChTourScopeContext): CtxChoice => (c.kind === 'qual' ? 'qual' : c.kind === 'practice' ? 'practice' : 'events');

/**
 * One side's controls (the board's scope card): who, the period, the context, and for one event which event and rounds.
 * Every change hands back a whole scope; the caller keeps it and puts it in the URL.
 */
export function ScopeControls({
  side,
  scope,
  onChange,
  players,
  finished,
  range,
  phone,
}: {
  side: 'a' | 'b';
  scope: ChTourScope;
  onChange: (next: ChTourScope) => void;
  players: readonly ChTourPlayer[];
  finished: readonly ChTourEvent[];
  /** The dates a custom range starts from when it is first chosen. */
  range: { from: string; to: string };
  phone: boolean;
}) {
  const S = side.toUpperCase();
  const subjectValue = scope.subject.kind === 'player' ? `p:${scope.subject.id}` : scope.subject.kind === 'matched' ? 'matched' : 'team';
  const listed = players.filter((p) => !p.alumni || (scope.subject.kind === 'player' && scope.subject.id === p.id));
  const subjectOptions = [
    { value: 'team', label: 'Team · pooled' },
    { value: 'matched', label: 'Returning players' },
    ...listed.map((p) => ({ value: `p:${p.id}`, label: p.name })),
  ];
  const setSubject = (v: string) => {
    const subject: ChTourScopeSubject = v === 'team' ? { kind: 'team' } : v === 'matched' ? { kind: 'matched' } : { kind: 'player', id: v.slice(2) };
    onChange({ ...scope, subject });
  };
  const choice = periodChoice(scope);
  const setPeriod = (v: PeriodChoice) => {
    if (v === 'event') {
      const e = finished[0];
      if (e) onChange({ ...scope, context: { kind: 'event', id: e.id, rounds: null } });
      return;
    }
    const context: ChTourScopeContext = scope.context.kind === 'event' ? { kind: 'events' } : scope.context;
    const period: ChTourScopePeriod = v === 'range' ? { kind: 'range', from: range.from, to: range.to } : v === 'last-season' ? { kind: 'last-season' } : { kind: v };
    onChange({ ...scope, context, period });
  };
  const setCtx = (v: CtxChoice) => onChange({ ...scope, context: { kind: v }, period: scope.context.kind === 'event' ? { kind: 'season' } : scope.period });
  const periodOptions: Array<{ value: PeriodChoice; label: string }> = [
    { value: 'season', label: 'This season' },
    { value: 'last-season', label: 'Last season' },
    { value: 'l10', label: 'Last 10 rounds' },
    ...(finished.length ? [{ value: 'event' as const, label: 'One event' }] : []),
    { value: 'range', label: 'Custom range' },
  ];
  const ev = scope.context.kind === 'event' ? scope.context : null;
  const picked = ev ? finished.find((e) => e.id === ev.id) : undefined;

  return (
    <div className={'ch-tour-cmp-ctls' + (phone ? ' is-phone' : '')}>
      <div className="ch-tour-cmp-ctls__row">
        <Select label={`Player ${S}`} value={subjectValue} options={subjectOptions} onChange={setSubject} />
        <Select label={`Period ${S}`} value={choice} options={periodOptions} onChange={setPeriod} />
      </div>
      <Segmented
        size="sm"
        label={`Context ${S}`}
        block
        value={ctxChoice(scope.context)}
        onChange={setCtx}
        options={[
          { value: 'events', label: 'Tournaments' },
          { value: 'qual', label: 'Qualifiers' },
          { value: 'practice', label: 'Practice' },
        ]}
      />
      {ev && (
        <div className="ch-tour-cmp-ctls__row is-event">
          <Select
            label={`Event ${S}`}
            value={ev.id}
            options={finished.map((e) => ({ value: e.id, label: `${e.name} · ${tourDay(e.startDate, { month: 'short', year: 'numeric' })}` }))}
            onChange={(id) => onChange({ ...scope, context: { kind: 'event', id, rounds: null } })}
          />
          <Segmented
            size="sm"
            label={`Rounds ${S}`}
            value={ev.rounds?.length === 1 ? `r${ev.rounds[0]}` : 'all'}
            onChange={(v) => onChange({ ...scope, context: { kind: 'event', id: ev.id, rounds: v === 'all' ? null : [Number(v.slice(1))] } })}
            options={[{ value: 'all', label: 'All' }, ...(picked?.rounds ?? []).map((r) => ({ value: `r${r.number}`, label: `R${r.number}` }))]}
          />
        </div>
      )}
      {scope.period.kind === 'range' && !ev && (
        <div className="ch-tour-cmp-ctls__dates">
          <label>
            <span>From</span>
            <input type="date" value={scope.period.from} max={scope.period.to} onChange={(e) => e.target.value && onChange({ ...scope, period: { kind: 'range', from: e.target.value, to: (scope.period as { to: string }).to } })} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={scope.period.to} min={scope.period.from} onChange={(e) => e.target.value && onChange({ ...scope, period: { kind: 'range', from: (scope.period as { from: string }).from, to: e.target.value } })} />
          </label>
        </div>
      )}
    </div>
  );
}

/** "Jonah Okafor" over "Tournaments · this season" (the board's scope title). */
export function ScopeTitle({ scope, names }: { scope: ChTourScope; names: ScopeNames }) {
  return (
    <span className="ch-tour-cmp-title">
      <span className="ch-tour-cmp-title__n">{subjectName(scope.subject, names)}</span>
      <span className="ch-tour-cmp-title__t">{contextWords(scope, names, day) || NO_DATA}</span>
    </span>
  );
}
