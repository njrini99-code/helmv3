import { formatFixed } from '../lib/format';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ChReadCalls } from './coachhelm-read-calls';
import type { ChDeepDive, ChDeepInsight, ChDiveHole, ChDivePlan, ChDiveRound, ChDiveTheme } from './coachhelm-dive-shape';
import { areaOf as diveAreaOf, DIVE_AREAS } from './coachhelm-dive-shape';
import type { ChBoardMissing, ChInsight, ChHelmWeek } from './coachhelm-shape';
import type { ChEngineVerdict } from './coachhelm-engine-shape';

/** The CoachHelm read as its own view, pure and client-safe (coachhelm-read 02-PLAN 3.5). Every field is nullable: a card draws only when its data is on the read. */
export interface ChBenchmarkLadder {
  you: { label: string; value: number; display: string };
  lines: Array<{ source: string; label: string; value: number; display: string; note: string | null }>;
  min: number;
  max: number;
}

export interface ChFunnelStep {
  label: string;
  n: number | null;
  statement: string;
}

export type ChReadCause =
  | { state: 'counted'; track: 2; path: string[]; count: string; eventStrokes: number | null; holes: ChDiveHole[] }
  | { state: 'likely'; track: 1; arms: Array<{ label: string; failures: number; n: number }>; verdict: string | null; range: string | null }
  | {
      state: 'not_traced';
      track: 0;
      gap: { have: number; need: number; text: string } | null;
      countDown: { haveEvents: number; needEvents: number; haveRounds: number; needRounds: number } | null;
      reason: string | null;
      text: string | null;
    };

export interface ChReadDetail {
  insight: ChInsight;
  stance: string;
  headline: {
    title: string;
    lede: string;
    value: string;
    valueNote: string | null;
    ladder: ChBenchmarkLadder | null;
    worth: { strokes: string; to: 'team' | 'tour' | 'self'; estimated: boolean } | null;
    foot: { sample: string; firm: string | null; rung: string | null; through: string | null };
    stale: string | null;
  };
  funnel: { steps: ChFunnelStep[]; stopped: boolean } | null;
  cause: ChReadCause | null;
  /** A row stored before the engine wrote a cause: today's drivers, in the card's markup. */
  legacy: ChDeepInsight['diagnosis'];
  sure: { word: string | null; rows: Array<{ k: 'Sample' | 'Recent' | 'Shot record'; have: number; need: number; text: string }>; checked: string[]; rung: { word: string; range: string | null } | null };
  moved: { from: number; to: number; text: string; tone: string; ref: { label: string; value: number } | null; theme: ChDiveTheme | null; through: string | null } | null;
  rounds: { total: number; list: Array<ChDiveRound & { counted: number }> };
  todo: { drill: ChHelmWeek | null; worth: string | null; startsFrom: string | null; verdict: ChEngineVerdict | null; plan: ChDivePlan };
}

export interface ChReadsRailRow {
  id: string;
  title: string;
  sub: string;
  value: string;
  tone: 'warn' | 'good' | 'plain';
}

export interface ChReadView {
  head: { playerId: string | null; name: string; first: string };
  area: string;
  read: ChReadDetail | null;
  rail: Array<{ label: string; rows: ChReadsRailRow[] }>;
  counts: { insights: number; needs: number };
  missing?: ChBoardMissing;
  failed: { rounds: boolean; plans: boolean; themes: boolean };
  calls: ChReadCalls;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The narrowing's counts live only in the engine's statement text (02-PLAN 10 row 1): "16 of 28 approaches from 175+ yd missed…", "12 of 16 misses
 * came on long par 4s", "on long par 4s 12 of 20 …". The first "n of m" is the step's own. A statement that doesn't parse draws text with no bar.
 */
export function funnelOf(narrowing: { steps?: Array<{ passed: boolean; label: string | null; statement: string }>; stopped_at?: string | null } | null | undefined): ChReadDetail['funnel'] {
  const steps = narrowing?.steps ?? [];
  if (!steps.length) return null;
  const out: ChFunnelStep[] = [];
  for (const s of steps) {
    if (!s.passed) continue;
    const m = s.statement.match(/(\d+) of (\d+)/);
    out.push({ label: s.label ?? 'Step', n: m ? Number(m[1]) : null, statement: s.statement });
  }
  return out.length ? { steps: out, stopped: narrowing?.stopped_at != null } : null;
}

/** The ladder: the player's figure and each stored comparison; a team line only as call 3 allows, and never a college line (Q-88). */
export function benchmarkLadder(ev: Record<string, unknown> | null | undefined, who: string, calls: ChReadCalls): ChBenchmarkLadder | null {
  const you = num(ev?.your_value);
  if (you == null) return null;
  const comparison = ev?.comparison as { lines?: Array<Record<string, unknown>>; primary?: Record<string, unknown> } | undefined;
  const unit = ev?.unit === 'percent' ? '%' : '';
  const fmt = (v: number) => (unit ? `${Math.round(v)}%` : formatFixed(v, Math.abs(v) < 10 ? 1 : 0));
  const all = comparison?.lines ?? (comparison?.primary ? [comparison.primary] : []);
  const lines = all
    .filter((l) => num(l.value) != null && (l.source !== 'team_pool' || (calls.teamPool && calls.teamPoolOnLadder === 'when-flag-on')))
    .map((l) => {
      const value = l.value as number;
      const n = num(l.n);
      const players = num(l.players);
      return {
        source: String(l.source ?? ''),
        label: String(l.label ?? 'Tour'),
        value,
        display: fmt(value),
        note: n == null ? null : [`${n} ${String(l.n_noun ?? l.n_unit ?? '')}`.trim(), players ? `${players} teammates` : null].filter(Boolean).join(' · '),
      };
    });
  if (!lines.length) return null;
  const vals = [you, ...lines.map((l) => l.value)];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.15;
  return { you: { label: who, value: you, display: fmt(you) }, lines, min: lo - pad, max: hi + pad };
}

/** The cause, by viewer. A player's likely cause is never built: no arms, verdict or range reach a player's client (Q3, CR0). */
export function readCauseOf(cause: Record<string, unknown> | null | undefined, where: ChDeepInsight['where'], role: 'coach' | 'player', supportRange: string | null = null): ChReadCause | null {
  if (!cause) return null;
  const state = cause.state as string;
  if (state === 'observed_sequence' || state === 'counted') {
    const path = (cause.path as string[] | null) ?? [];
    const occ = num(cause.occurrences);
    const den = num(cause.denominator);
    return { state: 'counted', track: 2, path, count: where?.counted ?? (occ != null && den != null ? `${occ} of ${den}` : `${occ ?? ''}`), eventStrokes: num(cause.event_strokes), holes: where?.holes ?? [] };
  }
  if ((state === 'inferred_hypothesis' || state === 'likely') && role === 'coach') {
    const alt = ((cause.alternatives as Array<Record<string, unknown>> | undefined) ?? [])[0];
    const arm = (a: unknown, label: string) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const n = num(x.n);
      const f = num(x.failures);
      return n != null && f != null ? { label, failures: f, n } : null;
    };
    const slice = String(alt?.label ?? 'This slice');
    const arms = [arm(alt?.arm_a, slice), arm(alt?.arm_b, 'Everywhere else')].filter((x): x is { label: string; failures: number; n: number } => !!x);
    const lift = num(alt?.lift);
    return { state: 'likely', track: 1, arms, verdict: lift != null ? `${slice} misses ${formatFixed(lift, 1)} times as often as everywhere else.` : null, range: supportRange };
  }
  const gap = cause.data_gap as Record<string, unknown> | null | undefined;
  const cd = cause.count_down as Record<string, number> | undefined;
  const have = num(gap?.have_count);
  const target = num(gap?.target_count);
  return {
    state: 'not_traced',
    track: 0,
    gap: have != null && target != null ? { have, need: have + target, text: String(gap?.prompt ?? '') } : null,
    countDown: cd ? { haveEvents: cd.have_events ?? 0, needEvents: cd.need_events ?? 0, haveRounds: cd.have_rounds ?? 0, needRounds: cd.need_rounds ?? 0 } : null,
    reason: (cause.not_traced_reason as string | undefined) ?? null,
    text: cause.not_traced_reason === 'load_failed' ? 'Shot records could not be read this run' : null,
  };
}

function checkedLabels(lines: readonly string[] | undefined): string[] {
  // The engine's lines start with a level ("length: 16 of 28 …"); the card names what was looked at, and drops the family codes ("A5 …").
  const out: string[] = [];
  for (const l of lines ?? []) {
    if (/^A\d+\b/.test(l)) continue;
    const key = l.match(/^(\w+):/)?.[1];
    out.push(key === 'length' ? 'Length of the approach' : key === 'par' ? 'Par and length of the hole' : key === 'shape' ? 'Which side the miss finished' : l);
  }
  return [...new Set(out)];
}

const WORTH_TO: Record<string, 'team' | 'tour'> = { team: 'team', tour: 'tour' };

export function toChReadDetail(raw: EvidenceInsight, deep: ChDeepInsight, role: 'coach' | 'player', first: string, calls: ChReadCalls, themes: Record<string, ChDiveTheme>): ChReadDetail {
  const ev = raw.evidence as unknown as Record<string, unknown>;
  const base = deep.base;
  const cause = ev.cause as Record<string, unknown> | null | undefined;
  const diagnosis = ev.diagnosis as { basis?: { narrowing?: Parameters<typeof funnelOf>[0]; checked?: string[] } } | null | undefined;
  const support = base.engine?.support as { word?: string; range?: string | null } | undefined;
  const sampleN = num(ev.sample_n);
  const factors = ev.confidence_factors as { sample_adequacy?: number } | undefined;
  const rows: ChReadDetail['sure']['rows'] = [];
  if (sampleN != null && factors?.sample_adequacy != null && factors.sample_adequacy > 0) {
    const need = Math.round(sampleN / Math.min(1, factors.sample_adequacy));
    rows.push({ k: 'Sample', have: sampleN, need, text: `${sampleN} of the ${need} it needs` });
  }
  const checked = cause?.checked as { holes_with_full_record?: number; of?: number; fields_missing?: string[] } | undefined;
  if (checked?.of) {
    const miss = checked.of - (checked.holes_with_full_record ?? 0);
    rows.push({ k: 'Shot record', have: checked.holes_with_full_record ?? 0, need: checked.of, text: `${checked.holes_with_full_record ?? 0} of ${checked.of} holes${miss > 0 && checked.fields_missing?.[0] ? `, ${checked.fields_missing[0]} missing on ${miss}` : ''}` });
  }
  const movement = (raw.metadata as { movement?: { from: number; to: number } } | null)?.movement;
  const tourLine = (ev.comparison as { lines?: Array<{ source?: string; label?: string; value?: number }> } | undefined)?.lines?.find((l) => l.source === 'tour');
  const theme = themes[deep.cat] ?? null;
  const funnelAllowed = role === 'coach' || calls.playerFunnel;
  return {
    insight: base,
    stance: deep.stance.word,
    headline: {
      title: base.title,
      lede: base.lede,
      value: base.value,
      valueNote: base.valueUnit,
      ladder: calls.pictures ? benchmarkLadder(ev, role === 'coach' ? first : 'You', calls) : null,
      worth: deep.closes ? { strokes: deep.closes.strokes, to: WORTH_TO[deep.closes.anchor] ?? 'self', estimated: base.stakes != null } : null,
      foot: { sample: base.evidence.sample, firm: base.evidence.read?.word ?? null, rung: role === 'coach' ? (support?.word ?? null) : null, through: base.evidence.asOf },
      stale: base.stale ? `A newer round (${base.stale.newestRound}) is not in this read yet. It is re-read overnight.` : null,
    },
    funnel: funnelAllowed ? funnelOf(diagnosis?.basis?.narrowing) : null,
    cause: readCauseOf(cause, deep.where, role, support?.range ?? null),
    legacy: cause ? null : deep.diagnosis,
    sure: {
      word: base.evidence.read?.word ?? null,
      rows,
      checked: checkedLabels(diagnosis?.basis?.checked),
      rung: role === 'coach' && support?.word ? { word: support.word, range: support.range ?? null } : null,
    },
    moved: movement && deep.movement ? { from: movement.from, to: movement.to, text: deep.movement.text, tone: String(deep.movement.tone), ref: tourLine?.value != null ? { label: tourLine.label ?? 'Tour', value: tourLine.value } : null, theme, through: base.evidence.asOf } : null,
    rounds: {
      total: deep.rounds.total,
      list: deep.rounds.list.map((r) => ({ ...r, counted: (deep.where?.holes ?? []).filter((h) => h.key.startsWith(r.id)).length })),
    },
    todo: { drill: base.week, worth: deep.closes?.strokes ?? null, startsFrom: base.value || null, verdict: (base.engine?.verdict as ChEngineVerdict | undefined) ?? null, plan: deep.plan },
  };
}

export function railOf(list: readonly ChDeepInsight[], role: 'coach' | 'player'): ChReadView['rail'] {
  return DIVE_AREAS.map((a) => ({
    label: a.label,
    rows: list
      .filter((i) => i.area === a.id)
      .map((i) => ({
        id: i.base.id,
        title: i.base.title,
        sub: [typeof i.stance === "object" ? i.stance.word : i.stance, role === 'coach' ? i.firmness : null].filter(Boolean).join(' · '),
        value: i.base.value,
        tone: i.base.strength ? ('good' as const) : i.base.stale ? ('plain' as const) : ('warn' as const),
      })),
  })).filter((g) => g.rows.length > 0);
}

export function toChReadView(dive: ChDeepDive, raw: ReadonlyMap<string, EvidenceInsight>, insightId: string, role: 'coach' | 'player', head: ChReadView['head'], calls: ChReadCalls): ChReadView {
  const deep = dive.list.find((i) => i.base.id === insightId) ?? null;
  const row = raw.get(insightId) ?? null;
  const areaLabel = deep ? (DIVE_AREAS.find((a) => a.id === diveAreaOf(deep.cat))?.label ?? '') : '';
  return {
    head,
    area: areaLabel,
    read: deep && row ? toChReadDetail(row, deep, role, head.first, calls, dive.themes) : null,
    rail: railOf(dive.list, role),
    counts: { insights: dive.counts.insights ?? dive.list.length, needs: dive.counts.needs ?? 0 },
    ...(dive.missing ? { missing: dive.missing } : {}),
    failed: { rounds: dive.roundsFailed, plans: dive.plansFailed, themes: dive.themesFailed },
    calls,
  };
}

export type AssignState = 'dismissed' | 'note' | 'assigned' | 'unknown' | 'stale' | 'declined' | 'open';
/** The same gating `FocusActions` runs, branch by branch, as one pure answer. */
export function assignStateOf(ins: ChInsight, flags: { dismissed: boolean; assigned: boolean; missing?: ChBoardMissing }): AssignState {
  if (flags.dismissed) return 'dismissed';
  if (ins.kind === 'note') return 'note';
  if (flags.assigned) return 'assigned';
  if (flags.missing?.assigned || flags.missing?.declined || flags.missing?.newest) return 'unknown';
  if (ins.stale) return 'stale';
  return ins.declined ? 'declined' : 'open';
}

/** The Board's card for one read (S-READ-BOARD; lanes Team and Lenses import it): the headline with the cause in one line. */
export interface ChReadSummary {
  id: string;
  area: string;
  stance: string;
  title: string;
  value: string;
  valueNote: string | null;
  ladder: ChBenchmarkLadder | null;
  tier: { kind: 'counted' | 'likely' | 'plain'; word: string };
  causeLine: string;
  worth: string | null;
  foot: string;
  stale: string | null;
}

export function toChReadSummary(d: ChReadDetail, area: string, role: 'coach' | 'player'): ChReadSummary {
  const c = d.cause;
  const tier: ChReadSummary['tier'] = c?.state === 'counted' ? { kind: 'counted', word: role === 'coach' ? 'Counted' : 'Seen in your shots' } : c?.state === 'likely' && role === 'coach' ? { kind: 'likely', word: 'Likely' } : { kind: 'plain', word: 'Not traced' };
  const causeLine = c?.state === 'counted' ? c.path.join(' to ') : c?.state === 'likely' ? (c.verdict ?? '') : d.funnel ? d.funnel.steps.map((s) => s.label).join(' · ') : 'CoachHelm says why once one repeats in the shots.';
  return {
    id: d.insight.id,
    area,
    stance: d.stance,
    title: d.headline.title,
    value: d.headline.value,
    valueNote: d.headline.valueNote,
    ladder: d.headline.ladder,
    tier,
    causeLine,
    worth: d.headline.worth?.strokes ?? null,
    foot: [d.headline.foot.sample, d.headline.foot.firm].filter(Boolean).join(' · '),
    stale: d.headline.stale,
  };
}
