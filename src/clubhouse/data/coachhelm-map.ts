import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence, InsightUnit } from '@/lib/coachhelm/v2/insights/types';
import { buildInsightUnit, readQuality } from '@/components/golf/coachhelm/home/buildPlayerHubViewModel';
import { deriveTone, isNegativePolarityMetric } from '@/components/golf/coachhelm/insight-card/tone-derivation';
import { MINUS } from '../lib/format';
import type { ChHelmAssigned, ChHelmBar, ChHelmEvidence, ChHelmGauge, ChHelmLifecycle, ChHelmPri, ChHelmWeek, ChInsight } from './coachhelm-shape';

/**
 * Generator output to what the CoachHelm screens draw (Clubhouse P013). Pure:
 * an `EvidenceInsight` from the delivery actions (`getInsightsForPlayer`,
 * `getTopInsightsForPlayers`) in, a `ChInsight` out. The loader, the preview
 * fixtures and the tests all run this one function.
 *
 * Polarity (which way a number is good) is the one table in
 * `isNegativePolarityMetric`; the confidence read and the drill are the legacy
 * hub's (`buildInsightUnit`), so one insight reads the same on every surface.
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

/** The first sentence, and the rest as one paragraph. Sentences end at . ! or ? before a capital, digit or opening mark, so "1.1" and "~0.6." stay whole. */
export function splitContent(content: string | null | undefined): { lede: string; why: string | null } {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { lede: '', why: null };
  const [lede = '', ...rest] = text.split(/(?<=[.!?])\s+(?=[A-Z0-9("“'])/);
  const why = rest.join(' ').trim();
  return { lede, why: why || null };
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

/** "College cohort avg" + its value; a label that already carries numbers ("… your level putts 81%") stands alone. */
function labelled(label: string | undefined, v: number, unit: InsightUnit): string {
  const l = (label ?? '').trim();
  if (!l) return formatComparison(v, unit);
  return /\d/.test(l) ? l : `${l} ${formatComparison(v, unit)}`;
}

function nounFor(ev: InsightEvidence, n: number): string {
  const one = n === 1;
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
  if (ev.window_basis === 'lifetime') return 'All rounds';
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

function gaugeFor(ev: InsightEvidence, good: boolean): ChHelmGauge | null {
  const you = num(ev.your_value);
  const cmp = num(ev.comparison_value);
  if (you == null || cmp == null) return null;
  const secRaw = num(ev.secondary_value);
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
    cmp: labelled(ev.comparison_label, cmp, ev.unit),
    sec: sec != null ? labelled(ev.secondary_label ?? 'Tour', sec, ev.unit) : null,
    good,
    fromZero,
  };
}

function evidenceFor(ins: EvidenceInsight, strength: boolean): ChHelmEvidence {
  const ev = ins.evidence;
  const n = num(ev.sample_n);
  const read = readQuality(ev.confidence);
  const bars = barsFor(ev);
  return {
    label: ev.metric_label,
    bars,
    // The bars say it for the slope finding; a gauge of its penalty (23 points against none) would say it twice.
    gauge: bars ? null : gaugeFor(ev, strength),
    sample: n != null && n > 0 ? `${n} ${nounFor(ev, n)}` : '',
    window: windowFor(ev),
    read: read ? { level: read.level, word: read.word } : null,
  };
}

function weekFor(ins: EvidenceInsight, unit: ReturnType<typeof buildInsightUnit>, drillText: string | null | undefined): ChHelmWeek | null {
  const drill = ins.drills?.[0];
  if (drill) {
    const minutes = num(drill.duration_min);
    const meta = [minutes != null && minutes > 0 ? `${minutes} min` : null, drill.difficulty?.trim() || null].filter(Boolean).join(' · ');
    return { title: drill.title, text: drillText?.trim() || null, meta: meta || null };
  }
  const action = unit.action?.trim();
  return action && !GENERIC_ACTION.test(action) ? { title: null, text: action, meta: null } : null;
}

const LIFECYCLES: readonly string[] = ['detected', 'matured', 'addressed', 'resolved'];

/**
 * One insight, ready to draw. `drillText`: the attached drill's description
 * (`golf_drills.description`, which the delivery shape does not carry), read
 * by the loader; `assigned`: a focus area already made from this insight.
 */
export function toChInsight(ins: EvidenceInsight, extra: { drillText?: string | null; assigned?: ChHelmAssigned | null } = {}): ChInsight {
  const ev = ins.evidence;
  const unit = buildInsightUnit(ins);
  const lowerIsBetter = isNegativePolarityMetric(ev.metric ?? '', ev);
  const priority: ChHelmPri = ins.priority === 'urgent' ? 'high' : ins.priority === 'high' || ins.priority === 'medium' ? ins.priority : 'low';
  const you = num(ev.your_value);
  const cmp = num(ev.comparison_value);
  const better = you != null && cmp != null && (lowerIsBetter ? you < cmp : you > cmp);
  const tone = deriveTone(ins);
  // What is working: resolved or encouraging, or ahead of its comparison at low priority.
  const strength = tone === 'celebratory' || tone === 'encouraging' || (better && priority === 'low');
  const { lede, why } = splitContent(ins.content);
  return {
    id: ins.id,
    playerId: ins.player_id,
    category: unit.category,
    priority,
    strength,
    title: ins.title,
    lede: lede || ev.diagnosis?.symptom?.trim() || '',
    why,
    value: ev.your_value_display?.trim() || (you != null ? formatComparison(you, ev.unit) : ''),
    evidence: evidenceFor(ins, strength),
    week: weekFor(ins, unit, extra.drillText),
    lifecycle: (LIFECYCLES.includes(ins.lifecycle_state) ? ins.lifecycle_state : 'detected') as ChHelmLifecycle,
    metric: ev.metric,
    areaType: areaTypeFor(ins.category),
    assigned: extra.assigned ?? null,
  };
}
