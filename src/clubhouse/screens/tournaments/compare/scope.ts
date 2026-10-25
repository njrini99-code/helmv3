/**
 * A comparison's two sides (P016 Compare). A side is a `ChTourScope` (who, which rounds, which period, how refined) and lives
 * in the URL as a token: `p:ava.ctx:events.per:season`, parsed and printed here. Pure; client-safe.
 *
 * Grammar. Parts joined by "." (a "." or ":" inside a value is percent-encoded), each `key:value`:
 *   who      `p:<playerId>` | `team` | `matched` | `lineup:<eventId>` | `group:<id>` | `field:<eventId>`
 *   rounds   `ctx:all` | `ctx:events` | `ctx:qual` | `ctx:practice` | `ctx:event:<eventId>[:<n>,<n>]` | `ctx:course:<courseId>`
 *   period   `per:season` | `per:last` | `per:l10` | `per:l20` | `per:<yyyy-mm-dd>_<yyyy-mm-dd>`
 *   refine   `x:18d` | `x:36d` | `x:count` | `x:shot` | `x:excl:<roundId>` (repeatable)
 * A token with no `who` is not a scope. Missing `ctx` is all rounds and missing `per` is this season.
 */
import type { ChTourCompareRound, ChTourEvent, ChTourPlayer, ChTourScope, ChTourScopeContext, ChTourScopePeriod, ChTourScopeRefine, ChTourScopeSubject, ChTourSeason } from '../types';

const esc = (s: string) => encodeURIComponent(s).replace(/\./g, '%2E');
const unesc = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function printScope(s: ChTourScope): string {
  const who =
    s.subject.kind === 'player'
      ? `p:${esc(s.subject.id)}`
      : s.subject.kind === 'team' || s.subject.kind === 'matched'
        ? s.subject.kind
        : s.subject.kind === 'group'
          ? `group:${esc(s.subject.id)}`
          : `${s.subject.kind}:${esc(s.subject.eventId)}`;
  const c = s.context;
  const ctx =
    c.kind === 'all' || c.kind === 'events' || c.kind === 'practice'
      ? `ctx:${c.kind}`
      : c.kind === 'qual'
        ? 'ctx:qual'
        : c.kind === 'event'
          ? `ctx:event:${esc(c.id)}${c.rounds?.length ? `:${c.rounds.join(',')}` : ''}`
          : `ctx:course:${esc(c.id)}`;
  const p = s.period;
  const per = p.kind === 'range' ? `per:${p.from}_${p.to}` : `per:${p.kind === 'last-season' ? 'last' : p.kind}`;
  const x = s.refine.map((r) => (r.kind === 'exclude' ? `x:excl:${esc(r.roundId)}` : `x:${r.kind}`));
  return [who, ctx, per, ...x].join('.');
}

export function parseScope(token: string | null | undefined): ChTourScope | null {
  if (!token) return null;
  let subject: ChTourScopeSubject | null = null;
  let context: ChTourScopeContext = { kind: 'all' };
  let period: ChTourScopePeriod = { kind: 'season' };
  const refine: ChTourScopeRefine[] = [];
  for (const part of token.split('.')) {
    const [key, ...rest] = part.split(':');
    const val = rest.map(unesc);
    if (key === 'team') subject = { kind: 'team' };
    else if (key === 'matched') subject = { kind: 'matched' };
    else if (key === 'p' && val[0]) subject = { kind: 'player', id: val[0] };
    else if (key === 'group' && val[0]) subject = { kind: 'group', id: val[0] };
    else if ((key === 'lineup' || key === 'field') && val[0]) subject = { kind: key, eventId: val[0] };
    else if (key === 'ctx') {
      const [k, a, b] = val;
      if (k === 'all' || k === 'events' || k === 'qual' || k === 'practice') context = { kind: k };
      else if (k === 'event' && a) {
        const rounds = (b ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
        context = { kind: 'event', id: a, rounds: rounds.length ? rounds : null };
      } else if (k === 'course' && a) context = { kind: 'course', id: a };
    } else if (key === 'per') {
      const v = val[0] ?? '';
      const range = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(v);
      if (v === 'season' || v === 'l10' || v === 'l20') period = { kind: v };
      else if (v === 'last') period = { kind: 'last-season' };
      else if (range) period = { kind: 'range', from: range[1]!, to: range[2]! };
    } else if (key === 'x') {
      const [k, a] = val;
      if (k === '18d' || k === '36d' || k === 'count' || k === 'shot') refine.push({ kind: k });
      else if (k === 'excl' && a) refine.push({ kind: 'exclude', roundId: a });
    }
  }
  return subject ? { subject, context, period, refine } : null;
}

export const sameScope = (a: ChTourScope, b: ChTourScope) => printScope(a) === printScope(b);

/** What a scope reads from: the loaded rounds and the facts to place them (seasons, events, who is returning). */
export interface ScopeEnv {
  rounds: readonly ChTourCompareRound[];
  seasons: readonly ChTourSeason[];
  events: readonly ChTourEvent[];
  matchedPlayers: readonly string[];
}

const sorted = (rs: ChTourCompareRound[]) => [...rs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

/** The rounds a scope selects, oldest first. Nine-hole rounds stay in: the metrics leave them out of 18-hole figures by name. */
export function selectRounds(scope: ChTourScope, env: ScopeEnv): ChTourCompareRound[] {
  const s = scope.subject;
  let rs = [...env.rounds];
  if (s.kind === 'player') rs = rs.filter((r) => r.playerId === s.id);
  else if (s.kind === 'team') rs = rs.filter((r) => !r.individual);
  else if (s.kind === 'matched') rs = rs.filter((r) => !r.individual && env.matchedPlayers.includes(r.playerId));
  else if (s.kind === 'lineup') {
    const ids = new Set(env.events.find((e) => e.id === s.eventId)?.entries.filter((x) => x.role === 'lineup').map((x) => x.playerId) ?? []);
    rs = rs.filter((r) => !r.individual && ids.has(r.playerId));
  } else return [];
  const c = scope.context;
  if (c.kind === 'events') rs = rs.filter((r) => r.context === 'event');
  else if (c.kind === 'qual') rs = rs.filter((r) => r.context === 'qualifier');
  else if (c.kind === 'practice') rs = rs.filter((r) => r.context === 'practice');
  else if (c.kind === 'event') rs = rs.filter((r) => r.eventId === c.id && (!c.rounds || (r.roundNumber != null && c.rounds.includes(r.roundNumber))));
  else if (c.kind === 'course') rs = rs.filter((r) => r.courseId === c.id);
  const p: ChTourScopePeriod = c.kind === 'event' ? { kind: 'range', from: '0000-01-01', to: '9999-12-31' } : scope.period;
  const [cur, prev] = env.seasons;
  if (p.kind === 'season' && cur) rs = rs.filter((r) => r.date >= cur.start && r.date <= cur.end);
  else if (p.kind === 'last-season' && prev) rs = rs.filter((r) => r.date >= prev.start && r.date <= prev.end);
  else if (p.kind === 'range') rs = rs.filter((r) => r.date >= p.from && r.date <= p.to);
  else if (p.kind === 'l10' || p.kind === 'l20') {
    // The last N rounds of each player in the scope, so a pooled side is N rounds a player, not N rounds in all.
    const n = p.kind === 'l10' ? 10 : 20;
    const keep = new Set<string>();
    const byPlayer = new Map<string, ChTourCompareRound[]>();
    for (const r of sorted(rs)) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);
    for (const list of byPlayer.values()) for (const r of list.slice(-n)) keep.add(r.id);
    rs = rs.filter((r) => keep.has(r.id));
  }
  for (const f of scope.refine) {
    if (f.kind === '18d') rs = rs.filter((r) => r.holes === 18);
    else if (f.kind === 'count') rs = rs.filter((r) => r.counting != null);
    else if (f.kind === 'shot') rs = rs.filter((r) => r.sg != null);
    else if (f.kind === 'exclude') rs = rs.filter((r) => r.id !== f.roundId);
    else if (f.kind === '36d') {
      const days = new Set(env.events.flatMap((e) => e.rounds.filter((x) => x.thirtySix).map((x) => x.roundEventId)));
      rs = rs.filter((r) => r.roundEventId != null && days.has(r.roundEventId));
    }
  }
  return sorted(rs);
}

/** How a side's rounds read in a line: counts, dates, courses, players, shot data. */
export interface ScopeSummary {
  n: number;
  full: number;
  nine: number;
  shot: number;
  from: string | null;
  to: string | null;
  courses: number;
  players: number;
  events: number;
}

export function summarize(rs: readonly ChTourCompareRound[]): ScopeSummary {
  const dates = rs.map((r) => r.date).sort();
  const full = rs.filter((r) => r.holes === 18);
  return {
    n: rs.length,
    full: full.length,
    nine: rs.filter((r) => r.holes === 9).length,
    shot: full.filter((r) => r.sg != null).length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    courses: new Set(rs.map((r) => r.courseId)).size,
    players: new Set(rs.map((r) => r.playerId)).size,
    events: new Set(rs.filter((r) => r.eventId).map((r) => r.eventId)).size,
  };
}

/** Names the words need. */
export interface ScopeNames {
  players: readonly ChTourPlayer[];
  events: readonly ChTourEvent[];
  seasons: readonly ChTourSeason[];
  courses: Record<string, { name: string }>;
}

const CTX_WORD = { all: 'All rounds', events: 'Tournaments', qual: 'Qualifiers', practice: 'Practice rounds' } as const;

export function subjectName(s: ChTourScopeSubject, n: ScopeNames): string {
  if (s.kind === 'team') return 'Team';
  if (s.kind === 'matched') return 'Returning players';
  if (s.kind === 'player') return n.players.find((p) => p.id === s.id)?.name ?? 'Player';
  if (s.kind === 'lineup') return `${n.events.find((e) => e.id === s.eventId)?.short ?? 'Event'} lineup`;
  if (s.kind === 'field') return `${n.events.find((e) => e.id === s.eventId)?.short ?? 'Event'} field`;
  return 'Group';
}

export function periodWords(p: ChTourScopePeriod, shortDay: (iso: string) => string): string {
  if (p.kind === 'season') return `This season`;
  if (p.kind === 'last-season') return 'Last season';
  if (p.kind === 'l10') return 'Last 10 rounds';
  if (p.kind === 'l20') return 'Last 20 rounds';
  return `${shortDay(p.from)} – ${shortDay(p.to)}`;
}

/** "Tournaments · this season", "Oakmont Fall Classic · all rounds", "Practice rounds · last season". */
export function contextWords(s: ChTourScope, n: ScopeNames, shortDay: (iso: string) => string): string {
  const c = s.context;
  if (c.kind === 'event') {
    const e = n.events.find((x) => x.id === c.id);
    return `${e?.name ?? 'Event'} · ${c.rounds?.length === 1 ? `Round ${c.rounds[0]}` : c.rounds?.length ? `Rounds ${c.rounds.join(', ')}` : 'all rounds'}`;
  }
  const what = c.kind === 'course' ? (n.courses[c.id]?.name ?? 'Course') : CTX_WORD[c.kind];
  return `${what} · ${periodWords(s.period, shortDay).toLowerCase()}`;
}

/** A short label for one side that tells it from the other: the player, else the event, else the context, else the period. */
export function sideLabel(a: ChTourScope, b: ChTourScope, n: ScopeNames, shortDay: (iso: string) => string): string {
  const first = (name: string) => (a.subject.kind === 'player' ? name.split(' ')[0]! : name);
  if (printSubject(a) !== printSubject(b)) return first(subjectName(a.subject, n));
  if (a.context.kind === 'event') {
    const id = a.context.id;
    if (b.context.kind !== 'event' || id !== b.context.id) return n.events.find((e) => e.id === id)?.short ?? 'Event';
    return a.context.rounds?.length === 1 ? `Round ${a.context.rounds[0]}` : 'All rounds';
  }
  if (a.context.kind !== b.context.kind || (a.context.kind === 'course' && b.context.kind === 'course' && a.context.id !== b.context.id)) return a.context.kind === 'course' ? (n.courses[a.context.id]?.name ?? 'Course') : CTX_WORD[a.context.kind as keyof typeof CTX_WORD];
  return periodWords(a.period, shortDay);
}

function printSubject(s: ChTourScope): string {
  return printScope({ ...s, context: { kind: 'all' }, period: { kind: 'season' }, refine: [] }).split('.')[0]!;
}

/** The board's six presets, as scopes. `ids` are the fixture's event and player ids the board names. */
export interface ComparePreset {
  key: string;
  label: string;
  a: ChTourScope;
  b: ChTourScope;
}

const sc = (subject: ChTourScopeSubject, context: ChTourScopeContext, period: ChTourScopePeriod): ChTourScope => ({ subject, context, period, refine: [] });

/**
 * Presets drawn from the data in hand: only those whose players and events exist are offered, so a preset never opens an
 * empty side. Player presets name the first two returning players; event presets the latest two finished events.
 */
export function presetsFor(env: ScopeEnv, n: ScopeNames): ComparePreset[] {
  const out: ComparePreset[] = [];
  const player = (id: string) => n.players.find((p) => p.id === id);
  const returning = env.matchedPlayers.map(player).filter((p): p is ChTourPlayer => !!p);
  const done = env.events.filter((e) => e.status === 'complete' && e.seasonId === env.seasons[0]?.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const season = { kind: 'season' } as const;
  const last = { kind: 'last-season' } as const;
  const first = returning[0];
  if (first) {
    const who = { kind: 'player', id: first.id } as const;
    out.push({ key: 'tq', label: `${first.first} · tournaments vs qualifiers`, a: sc(who, { kind: 'events' }, season), b: sc(who, { kind: 'qual' }, season) });
    out.push({ key: 'tp', label: `${first.first} · tournaments vs practice`, a: sc(who, { kind: 'events' }, season), b: sc(who, { kind: 'practice' }, last) });
  }
  const [e1, e2] = done;
  if (e1 && e2) out.push({ key: 'ee', label: `${e1.short} vs ${e2.short}`, a: sc({ kind: 'team' }, { kind: 'event', id: e1.id, rounds: null }, season), b: sc({ kind: 'team' }, { kind: 'event', id: e2.id, rounds: null }, season) });
  if (e1 && e1.rounds.length > 1) out.push({ key: 'rr', label: `${e1.short} · R1 vs R${e1.rounds.length}`, a: sc({ kind: 'team' }, { kind: 'event', id: e1.id, rounds: [1] }, season), b: sc({ kind: 'team' }, { kind: 'event', id: e1.id, rounds: [e1.rounds.length] }, season) });
  const second = returning[3] ?? returning[1];
  if (first && second) out.push({ key: 'pp', label: `${first.first} vs ${second.first} · this season`, a: sc({ kind: 'player', id: first.id }, { kind: 'events' }, season), b: sc({ kind: 'player', id: second.id }, { kind: 'events' }, season) });
  if (env.matchedPlayers.length) out.push({ key: 'ss', label: 'Returning players · this season vs last', a: sc({ kind: 'matched' }, { kind: 'events' }, season), b: sc({ kind: 'matched' }, { kind: 'events' }, last) });
  return out;
}
