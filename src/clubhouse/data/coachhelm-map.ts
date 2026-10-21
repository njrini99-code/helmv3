import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence, InsightUnit } from '@/lib/coachhelm/v2/insights/types';
import { confidenceLabel, confidenceTier, type ConfidenceTier } from '@/lib/coachhelm/confidence-label';
import { buildInsightUnit, fmtShortDate } from '@/components/golf/coachhelm/home/buildPlayerHubViewModel';
import { MINUS } from '../lib/format';
import { COLLEGE_NO_TOUR, COLLEGE_SOURCES, dayOf, drawnComparison, kindOf, refreshedDay, staleSince } from './coachhelm-classify';
import { isMeasuredZero, withoutZeroImpact } from './coachhelm-strokes';
import { TOUR_LABEL, type ChHelmAssigned, type ChHelmBar, type ChHelmEvidence, type ChHelmGauge, type ChHelmLifecycle, type ChHelmPri, type ChHelmWeek, type ChInsight, type ChKind, type ChStale, type ChTourBaseline } from './coachhelm-shape';
import { readTextFor, speak, type ChViewer } from './coachhelm-voice';
import { pathLineFor } from './coachhelm-path';
import { withoutPlaceholderCause } from '@/lib/coachhelm/reads/placeholder-cause';
import { anyEngineFlag, auditOf, causeOf, isEmptyEngine, supportOf, verdictOf, type ChEngineFlags, type ChEngineLifecycle, type ChReadEngine, type ChVerdictRow } from './coachhelm-engine-shape';

/**
 * Generator output to what the CoachHelm screens draw (Clubhouse P013). Pure:
 * an `EvidenceInsight` from the delivery actions (`getInsightsForPlayer`,
 * `getTopInsightsForPlayers`) in, a `ChInsight` out. The loader, the preview
 * fixtures and the tests all run this one function.
 *
 * Polarity (which way a number is good) is the one table in
 * `isNegativePolarityMetric`; the drill is the legacy hub's (`buildInsightUnit`),
 * and the confidence read uses the one set of words every surface uses
 * (`lib/coachhelm/confidence-label.ts`), so one insight reads the same everywhere.
 * What a card states (a finding, a strength or a note) and whether it is current
 * are `data/coachhelm-classify.ts`; whose voice its text is in is `data/coachhelm-voice.ts`.
 */

/** The one generator whose evidence is two make rates side by side (putt-slope-bias.ts). */
export const SLOPE_METRIC = 'putt_slope_downhill_penalty_pct';

/** The text generator-base writes when a generator has no sharper action: a placeholder, not a drill. */
const GENERIC_ACTION = /^Target .+ in the next practice block\.?$/i;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** The focus-area type a category files under, as every other place that promotes an insight guesses it. */
export function areaTypeFor(category: string | null | undefined): string {
  switch (category) {
    case 'putting':
      return 'putting';
    case 'tee':
      return 'driving';
    case 'approach':
      return 'iron_play';
    case 'short_game':
      return 'short_game';
    case 'pressure':
    case 'course_management':
      return 'mental_game';
    default:
      return 'other';
  }
}

/** Sentences end at . ! or ? before a capital, digit or opening mark, so "1.1" and "~0.6." stay whole. */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z0-9("“'])/;

/** The first sentence, and the rest as one paragraph. */
export function splitContent(content: string | null | undefined): { lede: string; why: string | null } {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { lede: '', why: null };
  const [lede = '', ...rest] = text.split(SENTENCE_BREAK);
  const why = rest.join(' ').trim();
  return { lede, why: why || null };
}

/**
 * The generators' "College players in our data average ~0.6." sentence is the prose twin of the "College cohort avg" comparison, and
 * like it is not drawn (Q-88: the Tour is the only benchmark, never a college one). The generators' other college mentions
 * (a cold-start "top college teams stay under 0.5") are the shared generators' to reword, not this page's.
 */
const COLLEGE_AVERAGE = /^College players in our data average\b/;

/**
 * The slope read's "(n=31 downhill / 44 level)" aside, in rows stored before putt-slope-bias.ts stopped writing it: the sample the
 * evidence line already states. Only that read's: another generator's aside (putt-bias's per-side counts) says what nothing else does.
 */
export function withoutSampleAside(content: string | null | undefined, metric: string | null | undefined): string {
  const text = content ?? '';
  return metric === SLOPE_METRIC ? text.replace(/\s*\(n=[^)]*\)/g, '') : text;
}
export function withoutCollegeAverage(content: string | null | undefined): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  return text
    .split(SENTENCE_BREAK)
    .filter((s) => !COLLEGE_AVERAGE.test(s))
    .join(' ');
}

/** A comparison number in its unit. Counts keep one decimal (0.6 penalties, not "1"), unlike `formatValue`. */
export function formatComparison(v: number, unit: InsightUnit): string {
  switch (unit) {
    case 'percent': {
      const pct = Math.abs(v) <= 1 ? v * 100 : v;
      return `${Number(pct.toFixed(1))}%`;
    }
    case 'strokes': {
      const r = Number(v.toFixed(1));
      return r > 0 ? `+${r}` : r < 0 ? `${MINUS}${Math.abs(r)}` : '0';
    }
    case 'yards':
      return `${Math.round(v)} yd`;
    case 'feet':
      return `${Math.round(v)} ft`;
    default:
      return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1)));
  }
}

/** A comparison's label + its value ("Your right-to-left make % 51%"); a label that already carries numbers ("… your level putts 81%") stands alone. */
function labelled(label: string | undefined, v: number, unit: InsightUnit): string {
  const l = (label ?? '').trim();
  if (!l) return formatComparison(v, unit);
  return /\d/.test(l) ? l : `${l} ${formatComparison(v, unit)}`;
}

/** The units a generator names its sample in (`evidence.detail.sample_unit`, par-type.ts), as the chat's provenance names them. */
const SAMPLE_UNITS: ReadonlySet<string> = new Set(['rounds', 'shots', 'attempts', 'holes', 'events', 'players']);

function nounFor(ev: InsightEvidence, n: number): string {
  const one = n === 1;
  // The generator's own unit beats a guess from the metric's name.
  const unit = ev.detail?.sample_unit;
  if (typeof unit === 'string' && SAMPLE_UNITS.has(unit)) return one ? unit.replace(/s$/, '') : unit;
  if (ev.window_basis === 'lifetime') return one ? 'round' : 'rounds';
  const m = ev.metric ?? '';
  if (/putt/i.test(m)) return one ? 'putt' : 'putts';
  if (/approach/i.test(m)) return one ? 'approach' : 'approaches';
  if (/tee|drive/i.test(m)) return one ? 'tee shot' : 'tee shots';
  if (/scramb/i.test(m)) return one ? 'attempt' : 'attempts';
  if (/round/i.test(m)) return one ? 'round' : 'rounds';
  return one ? 'observation' : 'observations';
}

function windowFor(ev: InsightEvidence): string | null {
  // A lifetime value is not windowed: its window_days is only the span between the first and last round.
  if (ev.window_basis === 'lifetime' || ev.detail?.window_kind === 'lifetime') return 'All rounds';
  const days = num(ev.window_days);
  return days != null && days > 0 ? `${days} days` : null;
}

function barsFor(ev: InsightEvidence): ChHelmBar[] | null {
  if (ev.metric !== SLOPE_METRIC) return null;
  const d = ev.detail ?? {};
  const down = num(d.downhill_pct);
  const level = num(d.level_pct);
  if (down == null || level == null) return null;
  return [
    { label: 'Downhill', pct: clamp(down), weak: true },
    { label: 'Level', pct: clamp(level), weak: false },
  ];
}

function gaugeFor(ev: InsightEvidence, tour: ChTourBaseline | null): ChHelmGauge | null {
  const you = num(ev.your_value);
  if (you == null) return null;
  if (COLLEGE_NO_TOUR.has(ev.comparison_source)) return null;
  // A college comparison becomes the Tour's value for this metric (the LPGA's for a women's team), and the Tour tick the generator
  // carried beside it is the same thing, so it is not drawn twice. Where the tour has no value there is no comparison and no gauge.
  // The same comparison decides whether the card is a strength (`drawnComparison`), so the card never says Working beside a gauge that says behind.
  const college = COLLEGE_SOURCES.has(ev.comparison_source);
  const cmp = drawnComparison(ev, tour);
  if (cmp == null) return null;
  const secRaw = college ? null : num(ev.secondary_value);
  const sec = secRaw != null && secRaw !== cmp ? secRaw : null;
  return {
    you: ev.your_value_display?.trim() || formatComparison(you, ev.unit),
    cmp: college && tour ? `${TOUR_LABEL[tour.tour]} ${formatComparison(cmp, ev.unit)}` : labelled(ev.comparison_label, cmp, ev.unit),
    sec: sec != null ? labelled(ev.secondary_label ?? 'Tour', sec, ev.unit) : null,
  };
}

const READ_LEVEL: Record<ConfidenceTier, 1 | 2 | 3> = { solid: 3, early: 2, thin: 1 };

/**
 * The confidence read in the canonical words (Solid, Early, Thin read; the sample on a thin one), never the hub's Strong, Fair and
 * Early. Most v3 rows are `factors_measured: false`: their confidence is the sample ramp alone, which is what "Solid read" means
 * everywhere else (confidence-label.ts), so a read here is never stronger than the same row's on any other surface.
 */
function readFor(ev: InsightEvidence): ChHelmEvidence['read'] {
  const tier = confidenceTier(ev.confidence);
  const word = confidenceLabel(ev.confidence, ev.sample_n);
  return tier && word ? { level: READ_LEVEL[tier], word } : null;
}

/** "As of Sep 30": the day the read was last refreshed, else the day its window ended (UTC dates, so the server and the browser agree). */
function asOfFor(ins: EvidenceInsight): string | null {
  const day = refreshedDay(ins) ?? dayOf(ins.evidence.window_end);
  const label = day ? fmtShortDate(day) : null;
  return label ? `As of ${label}` : null;
}

/** Names kept capitalised when a generator's Title Case label is set in sentence case. */
const PROPER = new Set(['Tour', 'PGA', 'LPGA', 'SG', 'GIR', 'OB']);

/** "Penalties per Round" to "Penalties per round": a generator's Title Case label in the house's sentence case (P013 D12). Words with
 *  more than one capital (an acronym) and proper names keep theirs. */
export function sentenceCase(label: string): string {
  return label
    .split(' ')
    .map((w, i) => (i === 0 || PROPER.has(w) || !/^[A-Z][a-z]+[,:;]?$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

function evidenceFor(ins: EvidenceInsight, kind: ChKind, tour: ChTourBaseline | null, say: (text: string) => string): ChHelmEvidence {
  const ev = ins.evidence;
  const asOf = asOfFor(ins);
  // A note states no finding, so it draws none of the number behind it: the collapsed par card is three standings under one title,
  // and its evidence is the par 3 row's alone.
  if (kind === 'note') return { label: '', bars: null, gauge: null, sample: '', window: null, read: null, asOf };
  const n = num(ev.sample_n);
  const bars = barsFor(ev);
  const gauge = bars ? null : gaugeFor(ev, tour);
  return {
    label: sentenceCase(say(ev.metric_label)),
    bars,
    // The bars say it for the slope finding; a gauge of its penalty (23 points against none) would say it twice.
    gauge: gauge ? { ...gauge, cmp: say(gauge.cmp), sec: gauge.sec != null ? say(gauge.sec) : null } : null,
    sample: n != null && n > 0 ? `${n} ${nounFor(ev, n)}` : '',
    window: windowFor(ev),
    read: readFor(ev),
    asOf,
  };
}

function weekFor(ins: EvidenceInsight, unit: ReturnType<typeof buildInsightUnit>, drillText: string | null | undefined, say: (text: string) => string): ChHelmWeek | null {
  const drill = ins.drills?.[0];
  if (drill) {
    const minutes = num(drill.duration_min);
    const meta = [minutes != null && minutes > 0 ? `${minutes} min` : null, drill.difficulty?.trim() || null].filter(Boolean).join(' · ');
    const text = drillText?.trim();
    return { title: drill.title, text: text ? say(text) : null, meta: meta || null };
  }
  const action = unit.action?.trim();
  return action && !GENERIC_ACTION.test(action) ? { title: null, text: say(action), meta: null } : null;
}

/** The no-break spaces `speak` sets, back to plain ones, for text that is saved rather than drawn. */
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

/**
 * What a list row's bare number counts, from the evidence's own unit and metric: a points gap ("23 pts") is a gap, a rate ("36%") a
 * rate, and "1.1" alone is said to be a round's. A number that already carries its unit, or a metric this cannot name, adds nothing.
 */
export function valueUnitFor(ev: InsightEvidence): string | null {
  const shown = ev.your_value_display?.trim() ?? '';
  if (/\bpts?$/.test(shown)) return 'gap';
  if (ev.unit === 'count' && /per_round$/.test(ev.metric ?? '')) return 'a round';
  if (ev.unit === 'percent' && ev.metric === 'big_number_rate') return 'of holes';
  if (ev.unit === 'percent' && /\bmake\b/i.test(ev.metric_label ?? '')) return 'made';
  return null;
}

const LIFECYCLES: readonly string[] = ['detected', 'matured', 'addressed', 'resolved'];

/**
 * One insight, ready to draw. `drillText`: the attached drill's description
 * (`golf_drills.description`, which the delivery shape does not carry), read
 * by the loader; `assigned`: a focus area already made from this insight;
 * `tour`: the team's Tour values (Q-88), which a college comparison is drawn as;
 * `newestRound`: the day of the player's newest completed countable round, which a
 * read from before it is marked out of date against; `viewer`: whose voice the text
 * is in (the player's first name for a coach, the player's own for the player; none leaves it as stored).
 * A strength is better than the comparison the card draws, not than a stored one the page does not show.
 */
export function toChInsight(
  ins: EvidenceInsight,
  extra: { drillText?: string | null; assigned?: ChHelmAssigned | null; declined?: boolean; tour?: ChTourBaseline | null; newestRound?: string | null; viewer?: ChViewer; engine?: ChEngineInputs } = {},
): ChInsight {
  const ev = ins.evidence;
  const unit = buildInsightUnit(ins);
  const tour = extra.tour ?? null;
  const say = (text: string) => speak(text, extra.viewer);
  // chs-40: a coach's card is spoken from the stored coach copy when the row has it (numbers identical), else the row's own text.
  const voiced = readTextFor(ins, (extra.engine?.viewer ?? extra.viewer)?.role === 'coach');
  const priority: ChHelmPri = ins.priority === 'urgent' ? 'high' : ins.priority === 'high' || ins.priority === 'medium' ? ins.priority : 'low';
  const you = num(ev.your_value);
  const kind = kindOf(ins, tour);
  const staleDay = staleSince(ins, extra.newestRound ?? null);
  const stale: ChStale | null = staleDay ? { newestRound: fmtShortDate(staleDay) ?? staleDay } : null;
  // A "Projected impact: ~0.00 strokes per round." sentence says nothing, so it is not drawn (coachhelm-strokes.ts).
  // The generators' placeholder cause states no cause, so no line of the card prints it (design call §4, "Both worlds").
  const parts = (content: string) => splitContent(withoutCollegeAverage(withoutSampleAside(withoutPlaceholderCause(withoutZeroImpact(content, ev)), ev.metric)));
  const { lede, why } = parts(voiced.content);
  const claim = lede || ev.diagnosis?.symptom?.trim() || '';
  // The focus area is saved with the player's own claim, so with the coach copy drawn it is split from the row's own content.
  const playerClaim = voiced.coachCopy.content ? parts(ins.content).lede || ev.diagnosis?.symptom?.trim() || '' : claim;
  const evidence = evidenceFor(ins, kind, tour, say);
  const engine = kind === 'note' ? null : engineFor(ins, evidence, extra.engine, extra.engine?.viewer ?? extra.viewer);
  return {
    id: ins.id,
    playerId: ins.player_id,
    category: unit.category,
    priority,
    strength: kind === 'strength',
    kind,
    stale,
    acknowledged: ins.status === 'acknowledged',
    title: say(voiced.title),
    // Typeset as the player reads it, with ordinary spaces: the focus area is saved, and Fairway draws it too. Always the player's
    // own text, never the coach copy.
    assignAs: { title: plain(speak(ins.title, { role: 'player' })), description: plain(speak(playerClaim, { role: 'player' }) || ins.title) },
    lede: say(claim),
    why: why ? say(why) : null,
    // A note has no number of its own: the par card's value is one of three standings under a title for all of them.
    value: kind === 'note' ? '' : ev.your_value_display?.trim() || (you != null ? formatComparison(you, ev.unit) : ''),
    valueUnit: kind === 'note' ? null : valueUnitFor(ev),
    evidence,
    path: pathLineFor(ev, {
      viewer: extra.engine?.viewer ?? extra.viewer,
      sample: evidence.sample,
      measured: [evidence.label, ev.your_value_display?.trim()].filter(Boolean).join(': '),
      stale: !!stale,
      note: kind === 'note',
      // The generators' Title Case label in the symptom is set in sentence case first, then in the viewer's voice.
      say: (text: string) => say(sentenceCase(text)),
    }),
    week: kind === 'note' ? null : weekFor(ins, unit, extra.drillText, say),
    lifecycle: (LIFECYCLES.includes(ins.lifecycle_state) ? ins.lifecycle_state : 'detected') as ChHelmLifecycle,
    metric: ev.metric,
    current: kind === 'note' ? null : you,
    areaType: areaTypeFor(ins.category),
    assigned: extra.assigned ?? null,
    declined: !extra.assigned && (extra.declined ?? false),
    // Set only when true, so every other card is the shape it was.
    ...(isMeasuredZero(ev) ? { measuredZero: true } : {}),
    // Absent unless an engine flag is on and the row carries what it draws (coachhelm-engine-shape.ts).
    ...(engine ? { engine } : {}),
  };
}

/** What the loader read beside a row for the engine's states: the flags (server-side), its lifecycle item and its focus area. */
export interface ChEngineInputs {
  flags: ChEngineFlags;
  lifecycle?: ChEngineLifecycle | null;
  /** The focus area made from this read, with its prescription and verdict columns (read only with the verdicts flag on). */
  focus?: ChVerdictRow | null;
  /** ISO now, for the coach-first day; the loader's clock. */
  now: string;
  /** Whose surface it is, when the text's voice is not told (a coach's card for a player with no name on file). */
  viewer?: ChViewer;
}

/** The card's engine states, each behind its flag; null when none applies (the card is then exactly what it was). */
function engineFor(ins: EvidenceInsight, evidence: ChHelmEvidence, inputs: ChEngineInputs | undefined, viewer: ChViewer | undefined): ChReadEngine | null {
  if (!inputs || !anyEngineFlag(inputs.flags)) return null;
  const { flags } = inputs;
  const ev = ins.evidence;
  const out: ChReadEngine = {};
  const cause = flags.cause ? causeOf(ev, viewer) : null;
  if (flags.support) {
    const s = supportOf(ev, viewer);
    if (s) out.support = s;
  }
  if (cause) out.cause = cause;
  if (flags.recheck && inputs.lifecycle) out.lifecycle = inputs.lifecycle;
  if (flags.verdicts) {
    const label = evidence.label || ev.metric_label || ins.title;
    const noun = (ev.sample_unit ?? 'attempts').replace(/_/g, ' ');
    const v = verdictOf(inputs.focus, label, noun, viewer, inputs.now);
    if (v) out.verdict = v;
  }
  if (flags.support) {
    const comparison = evidence.gauge?.cmp ?? (ev.comparison_label?.trim() || null);
    const audit = auditOf(ev, viewer, { sample: evidence.sample || null, comparison, cause });
    if (audit.length > 0) out.audit = audit;
  }
  return isEmptyEngine(out) ? null : out;
}
