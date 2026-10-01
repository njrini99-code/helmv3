import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence, InsightUnit } from '@/lib/coachhelm/v2/insights/types';
import { confidenceLabel, confidenceTier, type ConfidenceTier } from '@/lib/coachhelm/confidence-label';
import { buildInsightUnit, fmtShortDate } from '@/components/golf/coachhelm/home/buildPlayerHubViewModel';
import { MINUS } from '../lib/format';
import { COLLEGE_NO_TOUR, COLLEGE_SOURCES, dayOf, drawnComparison, kindOf, refreshedDay, staleSince } from './coachhelm-classify';
import { TOUR_LABEL, type ChHelmAssigned, type ChHelmBar, type ChHelmEvidence, type ChHelmGauge, type ChHelmLifecycle, type ChHelmPri, type ChHelmWeek, type ChInsight, type ChKind, type ChStale, type ChTourBaseline } from './coachhelm-shape';
import { speak, type ChViewer } from './coachhelm-voice';

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
export function withoutCollegeAverage(content: string | null | undefined): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  return text
    .split(SENTENCE_BREAK)
    .filter((s) => !COLLEGE_AVERAGE.test(s))
    .join(' ');
}

/** A round display ceiling for the gauge's track, a step above the largest value (a scale, never a shown number). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const target = v * 1.25;
  const base = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * base >= target - 1e-9) return m * base;
  return 10 * base;
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

function gaugeFor(ev: InsightEvidence, good: boolean, tour: ChTourBaseline | null): ChHelmGauge | null {
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
  const values = [you, cmp, ...(sec != null ? [sec] : [])];
  const fromZero = values.every((v) => v >= 0);
  let min = 0;
  let max: number;
  if (fromZero) {
    max = niceMax(Math.max(...values));
    // A percent track never runs past 100 (or past 1 when the values are fractions).
    if (ev.unit === 'percent') max = Math.min(max, values.every((v) => v <= 1) ? 1 : 100);
  } else {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = hi === lo ? 1 : (hi - lo) * 0.15;
    min = lo - pad;
    max = hi + pad;
  }
  const pos = (v: number) => clamp(((v - min) / (max - min || 1)) * 100);
  return {
    youPct: pos(you),
    cmpPct: pos(cmp),
    secPct: sec != null ? pos(sec) : null,
    you: ev.your_value_display?.trim() || formatComparison(you, ev.unit),
    cmp: college && tour ? `${TOUR_LABEL[tour.tour]} ${formatComparison(cmp, ev.unit)}` : labelled(ev.comparison_label, cmp, ev.unit),
    sec: sec != null ? labelled(ev.secondary_label ?? 'Tour', sec, ev.unit) : null,
    good,
    fromZero,
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

function evidenceFor(ins: EvidenceInsight, kind: ChKind, tour: ChTourBaseline | null, say: (text: string) => string): ChHelmEvidence {
  const ev = ins.evidence;
  const asOf = asOfFor(ins);
  // A note states no finding, so it draws none of the number behind it: the collapsed par card is three standings under one title,
  // and its evidence is the par 3 row's alone.
  if (kind === 'note') return { label: '', bars: null, gauge: null, sample: '', window: null, read: null, asOf };
  const n = num(ev.sample_n);
  const bars = barsFor(ev);
  const gauge = bars ? null : gaugeFor(ev, kind === 'strength', tour);
  return {
    label: say(ev.metric_label),
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
  extra: { drillText?: string | null; assigned?: ChHelmAssigned | null; declined?: boolean; tour?: ChTourBaseline | null; newestRound?: string | null; viewer?: ChViewer } = {},
): ChInsight {
  const ev = ins.evidence;
  const unit = buildInsightUnit(ins);
  const tour = extra.tour ?? null;
  const say = (text: string) => speak(text, extra.viewer);
  const priority: ChHelmPri = ins.priority === 'urgent' ? 'high' : ins.priority === 'high' || ins.priority === 'medium' ? ins.priority : 'low';
  const you = num(ev.your_value);
  const kind = kindOf(ins, tour);
  const staleDay = staleSince(ins, extra.newestRound ?? null);
  const stale: ChStale | null = staleDay ? { newestRound: fmtShortDate(staleDay) ?? staleDay } : null;
  const { lede, why } = splitContent(withoutCollegeAverage(ins.content));
  const claim = lede || ev.diagnosis?.symptom?.trim() || '';
  return {
    id: ins.id,
    playerId: ins.player_id,
    category: unit.category,
    priority,
    strength: kind === 'strength',
    kind,
    stale,
    acknowledged: ins.status === 'acknowledged',
    title: say(ins.title),
    assignAs: { title: ins.title, description: speak(claim, { role: 'player' }) || ins.title },
    lede: say(claim),
    why: why ? say(why) : null,
    // A note has no number of its own: the par card's value is one of three standings under a title for all of them.
    value: kind === 'note' ? '' : ev.your_value_display?.trim() || (you != null ? formatComparison(you, ev.unit) : ''),
    evidence: evidenceFor(ins, kind, tour, say),
    week: kind === 'note' ? null : weekFor(ins, unit, extra.drillText, say),
    lifecycle: (LIFECYCLES.includes(ins.lifecycle_state) ? ins.lifecycle_state : 'detected') as ChHelmLifecycle,
    metric: ev.metric,
    current: kind === 'note' ? null : you,
    areaType: areaTypeFor(ins.category),
    assigned: extra.assigned ?? null,
    declined: !extra.assigned && (extra.declined ?? false),
  };
}
