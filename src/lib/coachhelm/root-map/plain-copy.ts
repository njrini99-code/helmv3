/**
 * ============================================================================
 * Root map: plain copy for stored metric ids and templated diagnoses
 * ----------------------------------------------------------------------------
 * CLIENT-SAFE and pure. Stored evidence carries raw metric ids
 * (`scrambling_pct_sand`) and, on rows written before the root-cause
 * resolver existed, a templated diagnosis ("Sand Save % is off its benchmark
 * — likely cause inferred from the aggregate, not a measured shot
 * sequence"). The generators that wrote them are not changed here; this
 * module only rewrites them for display, so the map, the chain and the Why
 * view all read the same plain words. Nothing new is claimed: the rewrite
 * keeps the honesty label ({@link INFERRED_LABEL}).
 * ========================================================================== */

import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';

/** The honesty label an inferred (aggregate-only) cause always carries. */
export const INFERRED_LABEL = 'Likely, not yet seen in shot sequences';

const BAND_YD: Record<string, string> = { '50_125ft': '50–125 yd', '125_175ft': '125–175 yd', '175_plus_ft': '175+ yd' };

/** Plain names for the metric ids that reach the root map. */
const PLAIN_METRIC_LABEL: Record<string, string> = {
  scrambling_pct_sand: 'Sand saves',
  scrambling_pct_rough: 'Up-and-downs from the rough',
  scrambling_pct_fairway: 'Up-and-downs from tight lies',
  big_number_rate: 'Double bogey or worse',
  penalty_rate_per_round: 'Penalty strokes a round',
  opening_hole_delta: 'First-hole gap',
  scoring_par_3: 'Par 3 scoring',
  scoring_par_4: 'Par 4 scoring',
  scoring_par_5: 'Par 5 scoring',
  gir_pct: 'Greens in regulation',
  sg_ott: 'Off the tee',
  sg_approach: 'Approach',
  sg_around_green: 'Around the green',
  sg_putting: 'Putting',
  putt_miss_bias_left_pct: 'Left-to-right breaks made',
  putt_miss_bias_right_pct: 'Right-to-left breaks made',
  putt_slope_downhill_penalty_pct: 'Downhill putts',
  short_side_proximity: 'Short-side recoveries',
};

/**
 * A readable label for a stored metric id: a known plain name, then the
 * registry's display label, then the id turned into words. Never the raw id.
 */
export function plainMetricLabel(metric: string): string {
  const known = PLAIN_METRIC_LABEL[metric];
  if (known) return known;
  const putts = /^putts_made_(\d+)_(\d+|plus)_?ft_pct$/.exec(metric);
  if (putts) return putts[2] === 'plus' ? `Putts made from ${putts[1]}+ ft` : `Putts made from ${putts[1]}–${putts[2]} ft`;
  const band = /^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/.exec(metric);
  if (band?.[1]) return `Approach from ${BAND_YD[band[1]]}`;
  const cfg = (METRIC_RENDER_CONFIG as Record<string, { display_label: string } | undefined>)[metric];
  if (cfg?.display_label) return cfg.display_label;
  const words = metric.replace(/_pct$/, ' %').replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TEMPLATE = /^(.+?) is off its benchmark\s*[—–-]\s*likely cause inferred from the aggregate,? not a measured shot sequence\.?$/i;

/** True for the old templated "X is off its benchmark — …" diagnosis. */
export function isTemplatedRootCause(rootCause: string | null | undefined): boolean {
  return typeof rootCause === 'string' && TEMPLATE.test(rootCause.trim());
}

/**
 * The templated diagnosis in plain coach language; any other root cause is
 * returned as stored. The inferred status is not dropped: callers show
 * {@link INFERRED_LABEL} beside it.
 */
export function plainRootCause(rootCause: string | null | undefined, metric?: string | null): string | null {
  if (typeof rootCause !== 'string' || rootCause.trim().length === 0) return null;
  const m = TEMPLATE.exec(rootCause.trim());
  if (!m?.[1]) return rootCause.trim();
  const subject = typeof metric === 'string' && metric.length > 0 ? plainMetricLabel(metric) : m[1].trim();
  return `${subject}: below the benchmark. The likely cause comes from the round totals; it has not been traced shot by shot yet.`;
}

/** Sentences that explain a cause (not the stat line, not the drill). */
const CAUSAL = /\b(the driver is|driven by|trace[sd]? to|comes? from|because|it's the|is the problem|not the|not a|fine\b|but you)/i;
/** Acronyms kept upper-case when a shouted word ("ESCAPE") is lowered. */
const KEEP_CAPS = new Set(['PGA', 'LPGA', 'GIR', 'NCAA', 'OTT', 'USGA']);
const PRESCRIPTIVE = /^(drill|the fix|work\b|practice\b|keep\b|pick\b|hit balls|data through|try\b)/i;

/**
 * The stored insight text's explanatory sentences, when they say more than
 * the templated diagnosis: at most two sentences that name a cause, never
 * the prescription (that stays in "What to work on"). Null when the text has
 * no such sentence. Only reorders stored words; nothing is generated.
 */
export function richWhySentence(content: string | null | undefined): string | null {
  if (typeof content !== 'string') return null;
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;
  // Split on sentence ends that are followed by a capital (keeps "~0.9." and
  // "§4" intact enough for display; a stored text is short).
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
  const picked = sentences.filter((s) => CAUSAL.test(s) && !PRESCRIPTIVE.test(s)).slice(0, 2);
  if (picked.length === 0) return null;
  // A stored text is sometimes cut mid-sentence; never show a fragment.
  const whole = picked.filter((s) => /[.!?)]$/.test(s));
  if (whole.length === 0) return null;
  return whole.join(' ').replace(/\b([A-Z]{3,})\b/g, (w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase()));
}
