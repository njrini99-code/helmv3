import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { LADDER_RUNGS, type LadderRung } from '@/lib/coachhelm/v3/support/ladder';
import { shapeLifecycle, shortDate, type LifecycleWord, type ShapeableRead } from '@/lib/coachhelm/v3/lifecycle/delivery-shape';
import type { LifecycleEvidence } from '@/lib/coachhelm/v3/lifecycle/types';
import { coachVerdictLine, playerVerdictLine } from '@/lib/coachhelm/v3/verdicts/verdict-copy';
import type { FocusAreaVerdict, VerdictWord } from '@/lib/coachhelm/v3/verdicts/verdict';
import type { ChViewer } from './coachhelm-voice';

/**
 * What the engine now knows about a read, as the Clubhouse coach surfaces draw it (CoachHelm surfaces A; supercharge 04 §3
 * examples 2, 3, 5, 6, 7, 11, §4 and §6 layouts 2, 5 and 6). Four engine slices write these fields and, until now, nothing drew
 * them: the support pass (`evidence.support`, `ladder`, `what_ladder`, `ladder_reasons`; flag `coachhelm_support_v1`), the honest
 * root cause (`evidence.cause`; `coachhelm_root_cause_diagnosis`), the recheck step (`evidence.recheck`, `conflict`,
 * `under_review`; `coachhelm_recheck_v1`) and the verdict step (`golf_player_focus_areas.verdict`, `criterion`, `horizon`;
 * `coachhelm_verdicts_v1`).
 *
 * Each piece is drawn only when the loader says its flag is on (`ChEngineFlags`, read on the server), and only from a field the
 * row really carries: a row written before a slice existed, or with its flag off, has none, and the card is exactly what it was.
 * Pure: evidence in, words out. Nothing here computes a statistic; every number is one the engine stored.
 *
 * Rules kept here (00-overview decisions, supercharge open questions with their defaults):
 *   - confidence is a word, never a percent; the range is said in the gap's own unit (points, a round), never as a percent;
 *   - a player never sees the support pass (it is the coach's audit material, `delivery/player-projection.ts`, and the player feed
 *     drops it), nor an inferred cause (Q3, "hide"), nor Contradicted or Got worse before the coach has had a day (Q5);
 *   - the Tour is the only external benchmark (Q-88); otherwise the comparison is teammates or the player's own other side.
 */

export interface ChEngineFlags {
  support: boolean;
  cause: boolean;
  recheck: boolean;
  verdicts: boolean;
}

export const ENGINE_OFF: ChEngineFlags = {
  support: false,
  cause: false,
  recheck: false,
  verdicts: false,
};

export const anyEngineFlag = (f: ChEngineFlags | null | undefined): boolean => !!f && (f.support || f.cause || f.recheck || f.verdicts);

/** The claim ladder (02 §6) as a coach reads it: a word and how sure, never the q value. */
export interface ChEngineSupport {
  rung: LadderRung;
  word: string;
  /** "Somewhere between 3 and 43 points worse." Null when the read was not tested. */
  range: string | null;
  /** Not enough yet: what the read is waiting for, as a count-down. Null at any other rung. */
  watching: string | null;
}

/** The three cause states (03 §3.2) as the read's Why line draws them. */
export interface ChEngineCause {
  state: 'counted' | 'likely' | 'not_traced';
  /** "Counted", "Likely, from the totals", "Not traced yet", "Data gap". */
  word: string;
  line: string;
}

export interface ChEngineLifecycle {
  word: LifecycleWord;
  /** The line under the read (it stands in for the When line's freshness sentence). */
  line: string | null;
  /** A Contradicted pair drawn as one item (04 example 7): its lines and the other read's title. */
  pair: { lines: string[]; with: string } | null;
}

export type ChVerdictTone = 'good' | 'warn' | 'plain';

/** A focus area's verdict at its horizon (layout 5, example 11), or how far it has to go. */
export interface ChEngineVerdict {
  word: string;
  tone: ChVerdictTone;
  /** The copy helper's line, both numbers and the regression line (`verdicts/verdict-copy.ts`); null while too early. */
  line: string | null;
  /** "Target: 70% or better over 40 putts." Null when the focus area carries no criterion. */
  target: string | null;
}

export interface ChAuditLine {
  k: string;
  v: string;
}

/** What a card draws beside its own read. Every part is absent unless its flag is on and its field is on the row. */
export interface ChReadEngine {
  support?: ChEngineSupport;
  cause?: ChEngineCause;
  lifecycle?: ChEngineLifecycle;
  verdict?: ChEngineVerdict;
  /** "Why do you think so?" (layout 6): the read's audit lines, from the stored evidence. */
  audit?: ChAuditLine[];
}

export const LADDER_WORD: Record<LadderRung, string> = {
  seen_repeatedly: 'Seen repeatedly',
  observed: 'Observed',
  likely: 'Likely',
  working_hypothesis: 'Working hypothesis',
  not_enough_yet: 'Not enough yet',
};

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isRung = (v: unknown): v is LadderRung => typeof v === 'string' && (LADDER_RUNGS as readonly string[]).includes(v);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A count unit in words ("tee_shots" is "tee shots"). */
const SINGULAR: Record<string, string> = {
  approaches: 'approach',
  opportunities: 'opportunity',
};
const unitWords = (u: string | null, n: number): string => {
  const w = (u ?? 'attempts').replace(/_/g, ' ');
  if (n !== 1) return w;
  return SINGULAR[w] ?? w.replace(/s$/, '');
};

/** "3", "0.21", "1.4": a gap said to the precision it is worth. */
function amount(v: number, unit: string): string {
  if (unit === 'pct_points') return String(Math.round(Math.abs(v) * 100));
  const a = Math.abs(v);
  return a >= 10 ? String(Math.round(a)) : a.toFixed(2).replace(/0$/, '');
}

const UNIT_SUFFIX: Record<string, string> = {
  pct_points: ' points',
  per_round: ' a round',
  metric_unit: '',
};

/**
 * The 95% range in words, in the gap's own unit (02 §2: positive is worse than the benchmark). A range on one side says which side;
 * one that crosses zero says it may be no gap at all. Never a percent and never the q value.
 */
export function rangeWords(s: Record<string, unknown>): string | null {
  const lo = num(s.range_lo);
  const hi = num(s.range_hi);
  const unit = str(s.gap_unit) ?? 'metric_unit';
  if (lo == null || hi == null) return null;
  const suffix = UNIT_SUFFIX[unit] ?? '';
  const side = (v: number) => (v > 0 ? 'worse' : 'better');
  if (lo > 0 || hi < 0) {
    const [a, b] = lo > 0 ? [lo, hi] : [Math.abs(hi), Math.abs(lo)];
    return `Somewhere between ${amount(a, unit)} and ${amount(b, unit)}${suffix} ${side(lo > 0 ? 1 : -1)} than the comparison.`;
  }
  return `Somewhere between ${amount(lo, unit)}${suffix} better and ${amount(hi, unit)}${suffix} worse, so it may be no gap at all.`;
}

/**
 * Not enough yet, as a count-down (04 example 2, the Watching line): what the read has, what it needs and how many more. The
 * family's floor and the countable rounds are stored with the support; a read held back for another reason says that reason.
 */
export function watchingLine(s: Record<string, unknown>, reasons: readonly string[]): string {
  const n = num(s.n);
  const floor = num(s.floor);
  const unit = str(s.n_unit);
  const rounds = num(s.rounds_n);
  const roundFloor = num(s.round_floor);
  if (s.testable === false || reasons[0]?.startsWith('untestable')) return 'Watching: this read could not be tested yet, so it says nothing until it can.';
  if (n != null && floor != null && n < floor) {
    const more = Math.ceil(floor - n);
    return `Watching: ${n} ${unitWords(unit, n)} so far. ${more} more and this read can say something.`;
  }
  if (roundFloor != null && (rounds == null || rounds < roundFloor)) {
    if (rounds == null) return `Watching: the rounds behind this read are not known, and it needs ${roundFloor}.`;
    return `Watching: ${plural(rounds, 'round')} so far. ${roundFloor - rounds} more and this read can say something.`;
  }
  if (reasons.includes('below_strokes_floor')) return 'Watching: real, but worth under 0.3 strokes a round, so it is not a read yet.';
  return 'Watching: it does not hold up yet across everything checked this run.';
}

/** The support pass's words for a coach. A player never sees them (and the player feed drops the fields). */
export function supportOf(ev: unknown, viewer: ChViewer | undefined): ChEngineSupport | null {
  if (viewer?.role !== 'coach') return null;
  const e = rec(ev);
  const s = rec(e?.support);
  const rung = e?.ladder;
  if (!s || !isRung(rung)) return null;
  const reasons = Array.isArray(e?.ladder_reasons) ? (e.ladder_reasons as unknown[]).filter((r): r is string => typeof r === 'string') : [];
  return {
    rung,
    word: LADDER_WORD[rung],
    range: s.testable === false ? null : rangeWords(s),
    watching: rung === 'not_enough_yet' ? watchingLine(s, reasons) : null,
  };
}

const GAP_FIELD: Record<string, string> = {
  miss_direction: 'the miss side',
  distance_to_hole_after: 'where the ball finished',
};

/**
 * The cause state the root-cause pass stored (`evidence.cause`), as the Why line says it. A counted path is a sequence ("preceded
 * by"), never a mechanism; a likely cause prints both arms with their counts; not traced says exactly why. A player is never shown
 * an inferred cause (Q3): theirs reads as not traced.
 */
export function causeOf(ev: Pick<InsightEvidence, 'cause'> | null | undefined, viewer: ChViewer | undefined): ChEngineCause | null {
  const c = ev?.cause;
  if (!c || (c.state !== 'observed_sequence' && c.state !== 'inferred_hypothesis' && c.state !== 'not_traced')) return null;
  const pop = str(c.population) ?? 'misses';
  if (c.state === 'observed_sequence') {
    const path = (c.path ?? []).filter(Boolean).join(', then ');
    const counts = c.occurrences != null && c.denominator != null ? `${c.occurrences} of ${c.denominator} ${pop}` : pop;
    const rounds = c.distinct_rounds != null ? `, across ${plural(c.distinct_rounds, 'round')}` : '';
    return {
      state: 'counted',
      word: 'Counted',
      line: path ? `${counts} went ${path}${rounds}.` : `${counts}${rounds}.`,
    };
  }
  if (c.state === 'inferred_hypothesis' && viewer?.role === 'coach') {
    const alt = c.alternatives?.[0];
    if (alt) {
      const pct = (r: number) => `${Math.round(r * 100)}%`;
      return {
        state: 'likely',
        word: 'Likely, from the totals',
        line: `${alt.label}: ${alt.arm_a.failures} of ${alt.arm_a.n} (${pct(alt.arm_a.rate)}) against ${alt.arm_b.failures} of ${alt.arm_b.n} (${pct(alt.arm_b.rate)}) otherwise. Not yet a counted sequence.`,
      };
    }
  }
  return { state: 'not_traced', ...notTracedSaid(c, pop) };
}

function notTracedSaid(c: NonNullable<InsightEvidence['cause']>, pop: string): { word: string; line: string } {
  const gap = c.data_gap;
  if (c.not_traced_reason === 'data_gap' && gap) {
    // The gap stores the tagged count and the tags to go, not the population's size, so the line says only those two.
    const field = GAP_FIELD[gap.field] ?? `the ${gap.field.replace(/_/g, ' ')}`;
    const said = field.charAt(0).toUpperCase() + field.slice(1);
    return {
      word: 'Data gap',
      line: `${said} is recorded on only ${gap.have_count} of the ${pop}. Tag it on the next ${gap.target_count} and the why is checked again.`,
    };
  }
  const cd = c.count_down;
  if (c.not_traced_reason === 'count_down' && cd) {
    const ev = Math.max(0, cd.need_events - cd.have_events);
    const rd = Math.max(0, cd.need_rounds - cd.have_rounds);
    const more = [ev > 0 && `${ev} more ${pop}`, rd > 0 && plural(rd, 'more round', 'more rounds')].filter(Boolean).join(' and ');
    return {
      word: 'Not traced yet',
      line: `${cd.have_events} of the ${cd.need_events} ${pop} it needs${more ? `; ${more} and the why is checked` : ''}.`,
    };
  }
  const line: Record<string, string> = {
    no_leading_path: `The ${pop} take several routes, and no one of them leads yet.`,
    pattern_only: 'A path repeats, but this kind of read does not claim a counted cause.',
    no_shot_path: 'No recorded shot path measures this, so the why is not traced.',
    no_window: 'This read has no window to check, so the why is not traced.',
    load_failed: 'The shot records did not load on this run, so the why is checked again next time.',
  };
  return {
    word: 'Not traced yet',
    line: line[c.not_traced_reason ?? ''] ?? 'The record does not say why yet.',
  };
}

/** One day: how long Contradicted and Got worse are the coach's alone (03 §9 rule 4, Q5). */
export const COACH_FIRST_MS = 24 * 60 * 60 * 1000;

export interface ChVerdictRow {
  id: string;
  from_insight_id: string | null;
  baseline_value: number | null;
  baseline_n?: number | null;
  criterion?: unknown;
  horizon?: unknown;
  verdict?: unknown;
}

const VERDICT_WORD: Record<VerdictWord, { word: string; tone: ChVerdictTone }> = {
  worked: { word: 'Worked', tone: 'good' },
  moved: { word: 'Moved', tone: 'good' },
  did_not_move: { word: 'Did not move', tone: 'plain' },
  got_worse: { word: 'Got worse', tone: 'warn' },
  too_early: { word: 'Too early', tone: 'plain' },
  cant_tell: { word: 'Can’t tell', tone: 'plain' },
};

/** A stored verdict, when it has the shape the verdict step writes. */
function storedVerdict(v: unknown): FocusAreaVerdict | null {
  const r = rec(v);
  const post = rec(r?.post);
  if (!r || !post || typeof r.word !== 'string' || !(r.word in VERDICT_WORD)) return null;
  if (num(r.expected_without_coaching) == null || num(r.threshold) == null || num(post.n) == null || num(post.made) == null) return null;
  return r as unknown as FocusAreaVerdict;
}

const pctOf = (v: number) => `${Math.round(v * 100)}%`;
/** A rate stored as a fraction or as a percent, as a fraction. */
const asRate = (v: number | null) => (v == null ? null : Math.abs(v) > 1 ? v / 100 : v);

/** "Target: 70% or better over 40 putts." */
export function targetLine(criterion: unknown, horizon: unknown, noun: string): string | null {
  const c = rec(criterion);
  const t = num(c?.threshold);
  if (!c || t == null) return null;
  const h = rec(horizon);
  const attempts = num(h?.attempts);
  const rounds = num(h?.rounds);
  const over = attempts ? ` over ${attempts} ${noun}` : rounds ? ` over ${plural(rounds, 'round')}` : '';
  return `Target: ${pctOf(t)} or ${c.direction === 'lower' ? 'lower' : 'better'}${over}.`;
}

/**
 * The verdict on the focus area made from a read (example 11), in the viewer's voice, from the Slice 4 copy helpers. A focus area
 * with a criterion and no verdict yet is Too early with its target. Got worse reaches the coach a day before the player (03 §9).
 */
export function verdictOf(
  row: ChVerdictRow | null | undefined,
  label: string,
  noun: string,
  viewer: ChViewer | undefined,
  nowIso: string,
): ChEngineVerdict | null {
  if (!row) return null;
  const target = targetLine(row.criterion, row.horizon, noun);
  const v = storedVerdict(row.verdict);
  if (!v) return target ? { ...VERDICT_WORD.too_early, line: null, target } : null;
  if (viewer?.role !== 'coach' && v.word === 'got_worse') {
    const at = Date.parse(v.computed_at);
    if (!Number.isFinite(at) || Date.parse(nowIso) - at < COACH_FIRST_MS) return target ? { ...VERDICT_WORD.too_early, line: null, target } : null;
  }
  const base = asRate(num(row.baseline_value));
  const input = {
    label,
    attemptNoun: noun,
    verdict: v,
    baseline: base == null ? null : { value: base, n: num(row.baseline_n) },
  };
  return {
    ...VERDICT_WORD[v.word],
    line: viewer?.role === 'coach' ? coachVerdictLine(input) : playerVerdictLine(input),
    target,
  };
}

const SOURCE_WORD: Record<string, string> = {
  team: 'Teammates: the team’s average',
  cohort: 'Players at the same level',
  tour: 'The Tour',
  target: 'A fixed target',
  self: 'Their own other side',
};

const TEST_WORD: Record<string, string> = {
  exact_binomial: 'Make rate against the comparison',
  pooled_z: 'Two rates side by side',
  t: 'Difference of averages',
  exact_poisson: 'Count a round against the comparison',
  conditional_binomial: 'Two counts a round side by side',
};

const REASON_WORD: Record<string, string> = {
  one_window_only: 'Seen in one window so far; a second that agrees makes it Seen repeatedly.',
  below_clear_n: 'It holds up, but on fewer than twice the attempts it needs to be called Observed.',
  range_includes_zero: 'It holds up, but the range still includes no gap.',
  thin_support: 'Only just over the attempts it needs.',
  no_strokes_estimate: 'The strokes at stake were never estimated.',
  uncorroborated_cause: 'The cause is a guess, so the read stops at Working hypothesis.',
  cause_inferred_from_totals: 'The cause is inferred from the totals, so the read stops at Likely.',
  cause_path_one_window: 'The counted path is from one window.',
  not_supported: 'It does not hold up across everything checked this run.',
  below_strokes_floor: 'Worth under 0.3 strokes a round.',
};

/** "Jul 5 to Oct 1", from the evidence's own window. */
function windowSaid(e: Record<string, unknown> | null): string | null {
  const a = shortDate(str(e?.window_start));
  const b = shortDate(str(e?.window_end));
  return a && b ? `${a} to ${b}` : b ? `Through ${b}` : null;
}

/**
 * "Why do you think so?" (layout 6): the read's audit lines from what is stored, in a plain list. A coach's list carries the test,
 * the rung and the run it was checked in (the support pass); a player's is what their own feed carries: what was counted, the
 * rounds, what it is compared with and the cause path. A line whose field the row does not carry is left out, never guessed.
 */
export function auditOf(
  ev: unknown,
  viewer: ChViewer | undefined,
  extra: {
    sample: string | null;
    comparison: string | null;
    cause: ChEngineCause | null;
  },
): ChAuditLine[] {
  const e = rec(ev);
  const coach = viewer?.role === 'coach';
  const s = coach ? rec(e?.support) : null;
  const out: ChAuditLine[] = [];
  const n = num(s?.n);
  out.push(...(n != null ? [{ k: 'Counted', v: `${n} ${unitWords(str(s?.n_unit), n)}` }] : extra.sample ? [{ k: 'Counted', v: extra.sample }] : []));
  const rounds = num(s?.rounds_n) ?? num(e?.rounds_n);
  const win = windowSaid(e);
  if (rounds != null || win)
    out.push({
      k: 'Rounds',
      v: [rounds != null ? plural(rounds, 'round') : null, win].filter(Boolean).join(', '),
    });
  const src = str(rec(s?.benchmark)?.source);
  const cmp = [src && SOURCE_WORD[src] ? (coach ? SOURCE_WORD[src] : SOURCE_WORD[src].replace('Their own', 'Your own')) : null, extra.comparison]
    .filter(Boolean)
    .join(' · ');
  if (cmp) out.push({ k: 'Compared with', v: cmp });
  if (s) {
    const test = str(s.test);
    const range = s.testable === false ? null : rangeWords(s);
    const m = num(s.tests_in_run);
    const q = num(s.q_adj);
    const held = q == null ? null : q <= 0.1 ? 'It holds up' : 'It does not hold up';
    const parts = [
      test && TEST_WORD[test] ? `${TEST_WORD[test]}.` : null,
      range,
      held && m != null ? `${held} after checking ${plural(m, 'thing')} this run.` : null,
      s.testable === false ? 'Not tested: too little to test yet.' : null,
    ];
    const said = parts.filter(Boolean).join(' ');
    if (said) out.push({ k: 'Test', v: said });
    const rung = e?.ladder;
    if (isRung(rung)) {
      const first = Array.isArray(e?.ladder_reasons)
        ? (e.ladder_reasons as unknown[]).find((r): r is string => typeof r === 'string' && r in REASON_WORD)
        : undefined;
      out.push({
        k: 'How sure',
        v: [LADDER_WORD[rung] + '.', first ? REASON_WORD[first] : null].filter(Boolean).join(' '),
      });
    }
  }
  if (extra.cause) out.push({ k: 'Why', v: `${extra.cause.word}: ${extra.cause.line}` });
  const checked = shortDate(str(s?.run_at));
  if (checked) out.push({ k: 'Checked', v: checked });
  return out;
}

/** A read shaped for its lifecycle, kept in the list or not. */
export interface ChLifecycleShaped<T> {
  /** The reads still drawn, in their order: a Cleared one and the older of a retired pair are gone, a pair is its first read. */
  kept: T[];
  /** The lifecycle word and line of each read that has one (a Cleared read too, though it left `kept`). */
  byId: Map<string, ChEngineLifecycle>;
  /** The Cleared lines, in the list's order (04 example 5): shown until the step archives them. */
  cleared: string[];
}

/**
 * The recheck step's states over a ranked list (`lifecycle/delivery-shape.ts shapeLifecycle`): Cleared reads leave the open list
 * for one line each, a retired read is not drawn beside the one that replaced it, an opposing pair is one Contradicted item in the
 * slot of its higher-ranked read, and Under review marks a read without hiding it. With the flag off the list is untouched.
 */
export function shapeReadsLifecycle<
  T extends {
    id: string;
    title: string;
    lifecycle_state?: string | null;
    evidence: unknown;
  },
>(ranked: readonly T[], on: boolean, viewer: ChViewer | undefined, nowIso: string): ChLifecycleShaped<T> {
  if (!on) return { kept: [...ranked], byId: new Map(), cleared: [] };
  const voice = viewer?.role === 'coach' ? 'coach' : 'player';
  const reads: Array<ShapeableRead & { src: T }> = ranked.map((r) => ({
    id: r.id,
    title: r.title,
    lifecycle_state: r.lifecycle_state ?? null,
    evidence: (rec(r.evidence) as LifecycleEvidence | null) ?? null,
    src: r,
  }));
  const shaped = shapeLifecycle(reads, voice, nowIso);
  const kept: T[] = [];
  const byId = new Map<string, ChEngineLifecycle>();
  for (const item of shaped.items) {
    if (item.kind === 'contradicted') {
      const [first, other] = item.reads;
      kept.push(first.src);
      byId.set(first.id, {
        word: 'Contradicted',
        line: null,
        pair: { lines: item.lines, with: other.title ?? 'Another read' },
      });
      continue;
    }
    kept.push(item.read.src);
    if (item.word) byId.set(item.read.id, { word: item.word, line: item.line, pair: null });
  }
  // A Cleared read is out of the list, but a surface that draws it anyway (the coach's one card a player) says Cleared.
  for (const c of shaped.cleared) byId.set(c.read.id, { word: 'Cleared', line: c.line, pair: null });
  return { kept, byId, cleared: shaped.cleared.map((c) => c.line) };
}

/** True when nothing is set: the card draws exactly what it drew before. */
export const isEmptyEngine = (e: ChReadEngine | null | undefined): boolean => !e || Object.values(e).every((v) => v == null);
