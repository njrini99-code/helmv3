import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { teamPoolLine } from '@/lib/coachhelm/reads/team-pool-line';
import type { ChInsight } from './coachhelm-shape';
import type { ChViewer } from './coachhelm-voice';
import { formatFixed } from '../lib/format';

/**
 * The Read (Clubhouse P013, the player's Deep dive): one insight as four fixed lines, What, Why, Next and When, each answering
 * one question, from fields the row already carries. Pure, so the shaper, the page and the tests run this one function. Nothing
 * here computes a statistic: a count is said only when the stored rate times its sample is that whole number, a stroke figure only
 * when the row carries a real estimate, a benchmark only when it has a name, and the cause only when the row states one.
 *
 * Voice: the lines are written in the player's second person and every piece goes through `say` (`coachhelm-voice.ts speak`), so a
 * coach's rendering of the same read has the same numbers about the player by first name. No line says "because" or "caused".
 * Only the cause differs by role: a player never sees an inferred cause (Why reads "Not traced yet"); a coach sees it marked.
 */

/** The cause, in one of two states the record supports today, or not traced. */
export interface ChReadWhy {
  /** `observed`: seen in a shot sequence. `hypothesis`: inferred, never to be read as fact (a coach's only). Null: none shown. */
  level: 'observed' | 'hypothesis' | null;
  /** "Measured in your shots", "Likely, not measured"; null when not traced. */
  basis: string | null;
  /** The cause with its counts ("... (31 and 44 counted)."), or that the record does not say why yet. */
  text: string;
}

export interface ChReadNext {
  /** The attached drill's name; null when the next step is the row's own recommended action, or there is none. */
  drill: string | null;
  /** "12 min · intermediate". */
  meta: string | null;
  /** The drill's description, or the recommended action. */
  text: string | null;
  /** "No drill assigned." when there is no drill and no real action (the generator's placeholder is not a next step). */
  none: string | null;
}

export interface ChReadStrokes {
  /** Strokes a round, one decimal, never zero. */
  value: string;
  /** What the gap is closed to: the team's average, the Tour, or unnamed (the row's own estimate). */
  anchor: 'team' | 'tour' | null;
}

export interface ChRead {
  what: {
    /** The metric's label ("Make rate, downhill vs level, same distance"). */
    subject: string;
    /** The player's value and what it counts ("23 pts gap", "1.1 a round"); empty when the row has none. */
    value: string;
    /** "18 of 31 putts" when the stored rate times its sample is that count, else the sample ("75 putts"); null with none. */
    sample: string | null;
    /** "Compared with the Tour 0.3", or the team line "Team pool 72% (240 putts)": never a bare number; null when the card draws none. */
    benchmark: string | null;
    /** Null when the row carries no real stroke estimate, or it rounds to zero: never "0.0 strokes". */
    strokes: ChReadStrokes | null;
    /** The confidence word (`lib/coachhelm/confidence-label.ts`): "Solid read", "Thin read, n=8". */
    word: string | null;
  };
  why: ChReadWhy;
  next: ChReadNext;
  when: {
    /** "Through Sep 28": the newest round listed under the read, else the end of its window, else its "As of" day; null with none. */
    through: string | null;
    /** The out-of-date sentence when a newer round is not in the read; null when it is current or cannot be told. */
    stale: string | null;
  };
}

/** What `toChRead` reads beside the Board's card: the cause the dive shaper kept, the cascade's stroke figure and the newest listed round. */
export interface ChReadInputs {
  /** The cause as the dive shaper keeps it (`diagnosisFor`); null when the row states none (and, after PR #2213, for the generators' placeholder). */
  diagnosis: { cause: string; level: 'observed' | 'hypothesis'; drivers: ReadonlyArray<{ n: number | null }> } | null;
  /** What closing the gap is worth from the cascade (`closesFor`), which names what it is closed to. */
  closes: { strokes: string; anchor: 'team' | 'tour' } | null;
  /** The day of the newest round listed under the read ("Sep 28"); null when none is listed. */
  newestListed: string | null;
  /** The day the read's window ended ("Oct 1"); null when the row has none. */
  windowEnd: string | null;
  /**
   * Whose read it is (`ChViewer.role`, the same viewer the Board's card and `say` were made for). A player never sees an inferred
   * cause (supercharge open question 3, decided "hide"): their Why line is not traced yet; a coach sees it marked Likely, not measured.
   */
  role: ChViewer['role'];
}

/** The two methods whose `strokes_impact` is an estimate of strokes a round; a rough estimate is a priority seed, not a number to say. */
const ESTIMATED: ReadonlySet<string> = new Set(['sg_baseline', 'peer_delta']);

/** The nouns a rate's sample is counted in, where "18 of 31" is the rate's own numerator. Rounds and holes are not: a rate of holes over rounds is not a count of rounds. */
const ATTEMPT_NOUN = /^(putts?|approach(?:es)?|tee shots?|attempts?|shots?)$/;

const NOT_TRACED = 'Not traced yet: the record does not say why.';
const NO_DRILL = 'No drill assigned.';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A sentence ends in its stop; a closing bracket or quote is not one unless a stop is inside it ("(17 counted)" takes one). */
const stop = (t: string): string => (/[.!?…][”"’)]?$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/** "31", "31 and 44", "17, 6 and 4". */
function listed(ns: readonly number[]): string {
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : String(ns[0] ?? '');
}

/**
 * Comparisons whose `sample_n` counts both arms, not the rate's own putts: the player's other side (putt-bias stores the weak
 * side's rate over weak + strong putts) or a fixed target over two groups (putt-slope-bias: downhill + level).
 */
const BOTH_ARMS: ReadonlySet<InsightEvidence['comparison_source']> = new Set(['your_baseline', 'absolute_target']);

/**
 * "18 of 31 putts" when the stored rate times its sample is that whole number (the rate's own numerator), else the sample as the
 * Board says it ("59 putts"). A rate stored rounded, a gap in points, a rate of holes over rounds, or a sample that counts both
 * arms of a comparison is never turned into a count.
 */
export function sampleOf(
  ev: Pick<InsightEvidence, 'unit' | 'your_value' | 'your_value_display' | 'sample_n'> & Partial<Pick<InsightEvidence, 'comparison_source'>>,
  sample: string,
): string | null {
  const said = sample.trim();
  if (!said) return null;
  if (ev.comparison_source && BOTH_ARMS.has(ev.comparison_source)) return said;
  const n = num(ev.sample_n);
  const v = num(ev.your_value);
  const noun = said.replace(/^\d+\s+/, '');
  const shown = /^(\d+(?:\.\d+)?)%$/.exec(ev.your_value_display?.trim() ?? '');
  if (ev.unit !== 'percent' || !shown || n == null || n <= 0 || v == null || !ATTEMPT_NOUN.test(noun)) return said;
  // A fraction (0.58) or a percent (58): the display says which.
  const pct = Number(shown[1]);
  const rate = Math.abs(v) <= 1 && Math.abs(v * 100 - pct) < 1 ? v : v / 100;
  const made = rate * n;
  const whole = Math.round(made);
  return Math.abs(made - whole) < 0.01 && whole >= 0 && whole <= n ? `${whole} of ${said}` : said;
}

/** The generator labels that open a comparison in lower case after "Compared with" ("your right-to-left make %", "no downhill penalty"). */
const LOWER_START = /^(Your|No|Non)\b/;

/** A sentence that states or guesses a cause ("It's consistent with a pace-control pattern", "That's driven by", "the classic under-read"). */
const CAUSAL = /\b(?:consistent with|looks like|points? to|suggests?|likely|because|due to|caused by|driven by|stems? from|the classic)\b/i;

/**
 * The generator's write-up as this viewer reads it. When the Why line is not traced for them (no cause, or an inferred one a
 * player is not shown: supercharge Q3, "hide"), the sentences that state or guess a cause are left out, so the page never says
 * what the Why line holds back. A cause the viewer is shown keeps the write-up whole. Null when nothing is left.
 */
export function writeUpFor(text: string, traced: boolean): string | null {
  const kept = traced ? [text] : text.split(/(?<=[.!?])\s+/).filter((s) => !CAUSAL.test(s));
  return kept.join(' ').trim() || null;
}

/**
 * "Compared with the Tour 0.3": the comparison the card draws (the gauge's, or the slope read's own label), only when it has a name.
 * A read carrying a team pool as its primary comparison (written only with `coachhelm_team_pool_v1` on) says the team line instead,
 * "Team pool 72% (240 putts)": one pooled number and its count, never a teammate.
 */
function benchmarkOf(raw: EvidenceInsight, base: ChInsight, say: (t: string) => string): string | null {
  const team = teamPoolLine(raw.evidence);
  if (team) return team;
  const g = base.evidence.gauge;
  const parts = g ? [g.cmp, g.sec].filter((x): x is string => !!x && /[a-z]/i.test(x)) : base.evidence.bars ? [say(raw.evidence.comparison_label ?? '').trim()].filter((x) => /[a-z]/i.test(x)) : [];
  if (parts.length === 0) return null;
  const said = parts.map((p, i) => (i === 0 && LOWER_START.test(p) ? p.charAt(0).toLowerCase() + p.slice(1) : p)).join('; ');
  return `Compared with ${said}`;
}

/** Strokes a round: the cascade's figure (it names what it is closed to), else the row's own estimate when it is one; never a zero. */
function strokesOf(ev: InsightEvidence, closes: ChReadInputs['closes']): ChReadStrokes | null {
  if (closes && Number(closes.strokes) > 0) return { value: closes.strokes, anchor: closes.anchor };
  const v = num(ev.strokes_impact);
  if (v == null || !ESTIMATED.has(ev.strokes_impact_method)) return null;
  const r = formatFixed(Math.abs(v), 1);
  return Number(r) > 0 ? { value: r, anchor: null } : null;
}

/** Whether a viewer sees a cause at this level: an observed one everyone does; an inferred one only a coach (players: "hide"). */
export function causeShown(level: 'observed' | 'hypothesis', role: ChViewer['role']): boolean {
  return level === 'observed' || role === 'coach';
}

/** The generators' stock confidence reason ("sample adequate", generator-base.ts buildConfidenceReason) says nothing worth a line. */
export function meaningfulReason(reason: string | null | undefined): string | null {
  const r = reason?.trim() ?? '';
  return r && !/^sample adequate\.?$/i.test(r) ? r : null;
}

function whyOf(d: ChReadInputs['diagnosis'], role: ChViewer['role'], say: (t: string) => string): ChReadWhy {
  const cause = d?.cause.trim();
  if (!d || !cause || !causeShown(d.level, role)) return { level: null, basis: null, text: NOT_TRACED };
  const counts = d.drivers.map((x) => x.n).filter((n): n is number => n != null && n > 0);
  const body = cause.replace(/\.+$/, '');
  return {
    level: d.level,
    basis: say(d.level === 'observed' ? 'Measured in your shots' : 'Likely, not measured'),
    text: stop(counts.length > 0 ? `${body} (${listed(counts)} counted)` : body),
  };
}

function nextOf(base: ChInsight): ChReadNext {
  const w = base.week;
  if (w?.title) return { drill: w.title, meta: w.meta, text: w.text, none: null };
  if (w?.text) return { drill: null, meta: null, text: w.text, none: null };
  return { drill: null, meta: null, text: null, none: NO_DRILL };
}

/**
 * The four lines of one insight. `base` is the Board's own card for the row (`toChInsight`, already in the viewer's voice), so the
 * value, the sample, the comparison, the confidence word, the drill and whether it is out of date are the Board's; `say` puts the
 * lines' own words in the same voice.
 */
export function toChRead(raw: EvidenceInsight, base: ChInsight, inputs: ChReadInputs, say: (t: string) => string = (t) => t): ChRead {
  const ev = raw.evidence;
  const value = [base.value, base.value ? base.valueUnit : null].filter(Boolean).join(' ');
  const through = inputs.newestListed ?? inputs.windowEnd;
  return {
    what: {
      subject: base.evidence.label || say(ev.metric_label),
      value,
      sample: sampleOf(ev, base.evidence.sample),
      benchmark: benchmarkOf(raw, base, say),
      strokes: strokesOf(ev, inputs.closes),
      word: base.evidence.read?.word ?? null,
    },
    why: whyOf(inputs.diagnosis, inputs.role, say),
    next: nextOf(base),
    when: {
      through: through ? `Through ${through}` : base.evidence.asOf,
      stale: base.stale ? `Out of date: a round played ${base.stale.newestRound} isn’t in this read yet, so it may not match the rounds posted since.` : null,
    },
  };
}

/**
 * The stroke sentence, with what the gap is closed to named: the team's average, the Tour by name, or the row's own estimate. `role`:
 * a coach's page names the team's average in no one's voice (spec A); the player's reads "your team’s average" as before.
 */
export function strokesLine(s: ChReadStrokes, tour: string, say: (t: string) => string = (t) => t, role: ChViewer['role'] = 'player'): string {
  if (s.anchor === 'team' && role === 'coach') return `Closing the gap to the team’s average is worth about ${s.value} strokes a round.`;
  if (s.anchor === 'team') return say(`Closing the gap to your team’s average is worth about ${s.value} strokes a round.`);
  if (s.anchor === 'tour') return `Closing the gap to the ${tour} is worth about ${s.value} strokes a round.`;
  return `Worth about ${s.value} strokes a round.`;
}

/** The four lines as text, in the order they are read. `tour`: the Tour the page names ("Tour", "LPGA Tour"). `role`: whose page. */
export function readLines(read: ChRead, tour: string, say: (t: string) => string = (t) => t, role: ChViewer['role'] = 'player'): { what: string; why: string; next: string; when: string } {
  const w = read.what;
  const head = w.value ? `${w.subject}: ${w.value}` : w.subject;
  const what = [stop(w.sample ? `${head} (${w.sample})` : head), w.benchmark && stop(w.benchmark), w.strokes && strokesLine(w.strokes, tour, say, role), w.word && stop(w.word)].filter(Boolean).join(' ');
  const why = read.why.basis ? `${read.why.basis}: ${read.why.text}` : read.why.text;
  const n = read.next;
  const next = n.none ?? [n.drill && stop(n.meta ? `${n.drill} · ${n.meta}` : n.drill), n.text && stop(n.text)].filter(Boolean).join(' ');
  const when = [read.when.through && stop(read.when.through), read.when.stale].filter(Boolean).join(' ') || '—';
  return { what, why, next, when };
}
