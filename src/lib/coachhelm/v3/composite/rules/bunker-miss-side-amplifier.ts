/**
 * Composite rule: bunker_miss_side_amplifier.
 *
 * Fires when the player has:
 *   1. A weak sand_save scrambling insight (below team_pct 50%)
 *   2. A putt-bias insight showing they leave putts on one specific side
 *
 * The combination = bunker shots are leaking on the same miss-side as
 * the putt-bias, amplifying the cost. Research doc §5: sand shots are
 * predictable when the green-side is right; when miss-side and putt-
 * bias overlap, the player is "short-siding themselves" repeatedly.
 *
 * DORMANT (BLOCKED on putt-bias revival): this rule needs a `putt_bias`
 * insight, but gen:putt-bias never emits today (break-direction cache
 * cols are 100% NULL — audit §5). `detect()` already no-ops correctly
 * when no putt_bias insight is present (the isPuttBias guard below), so
 * the rule fails safe rather than silently mis-firing. It will revive
 * automatically once putt-bias produces rows; no logic change needed
 * here. Tracked as a cross-file dependency on the putt-bias generator.
 */

import type { CompositeRule, EvidenceInsight, CompositeMatch, CompositeContent } from '../types';

/** A leave beyond this many feet is a mishit/data error, not a recovery-proximity
 *  datum — Grace's 25-yd sand shot recorded a 43-yd (×3 = 129 ft) leave that
 *  survives the loader's 40-yd START filter. 75 ft = 25 yd (the loader's own
 *  greenside ceiling), so anything above it is dropped. */
const MAX_RECOVERY_LEAVE_FT = 75;

/** Share the two leaks co-occur on the SAME holes (Jaccard of their hole-sets).
 *  0 when either set is empty — we never claim co-occurrence we can't show. */
export function coOccurrenceShare(holesA: number[], holesB: number[]): number {
  if (holesA.length === 0 || holesB.length === 0) return 0;
  const a = new Set(holesA);
  const b = new Set(holesB);
  let inter = 0;
  for (const h of a) if (b.has(h)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

/** Clamp a per-shot recovery leave (feet): drop implausible outliers (return
 *  null so the caller excludes them from the average), keep plausible leaves. */
export function clampRecoveryLeaveFt(ft: number): number | null {
  if (!Number.isFinite(ft) || ft < 0) return null;
  return ft > MAX_RECOVERY_LEAVE_FT ? null : ft;
}

/** Below this same-hole overlap we cannot honestly say the leaks "compound". */
const COOCCURRENCE_THRESHOLD = 0.3;

function isWeakSandSave(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'scrambling') return false;
  if (!i.signature.includes(':sand')) return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 50;
}

function isPuttBias(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_bias') return false;
  return i.signature.includes(':left') || i.signature.includes(':right');
}

const rule: CompositeRule = {
  id: 'bunker_miss_side_amplifier',
  name: 'Bunker miss-side amplifier',
  priority: 'high',
  category: 'short_game',

  detect(insights: EvidenceInsight[]): CompositeMatch | null {
    const sandWeak = insights.find(isWeakSandSave);
    const puttBias = insights.find(isPuttBias);
    if (!sandWeak || !puttBias) return null;
    const biasDir = puttBias.signature.includes(':left') ? 'left' : 'right';
    return {
      source_insight_ids: [sandWeak.id, puttBias.id],
      signals: {
        sand_save_pct: Number(sandWeak.evidence.your_value ?? 0),
        bias_direction: biasDir,
        same_hole_share: 0,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const sandPct = Math.round(Number(match.signals.sand_save_pct ?? 0));
    const dir = String(match.signals.bias_direction ?? 'left');
    const share = Number(match.signals.same_hole_share ?? 0);
    const proven = share >= COOCCURRENCE_THRESHOLD;
    const title = proven
      ? `Bunker + ${dir}-bias putt pattern is compounding`
      : `Bunker save and ${dir}-bias putts both need work`;
    const content = proven
      ? `Two short-game leaks are stacking on the same holes: ${sandPct}% sand save ` +
        `AND a tendency to miss ${dir} on break putts (overlapping on ` +
        `${Math.round(share * 100)}% of the holes where either shows up). When the ` +
        `bunker miss-side matches the putt-bias you short-side yourself twice. Work ` +
        `bunker distance control to a ${dir}-tucked pin, then the ${dir}-break read.`
      : `Two separate short-game leaks are showing up this window: ${sandPct}% sand ` +
        `save AND a tendency to miss ${dir} on break putts. They're different skills ` +
        `— splash-out distance control vs green-reading — and we can't yet confirm ` +
        `they overlap on the same scoring holes, so treat them as a combined session: ` +
        `bunker distance control plus ${dir}-break read work, not a single compound fault.`;
    return {
      title,
      content,
      signature: `bunker_${dir}_bias_amp`,
      evidence: {
        metric: 'scrambling_pct_sand',
        metric_label: 'Bunker miss-side amplifier',
        unit: 'percent',
        your_value: sandPct,
        your_value_display: `${sandPct}%`,
        comparison_value: 50,
        comparison_label: 'PGA Tour sand save',
        comparison_source: 'pga_baseline',
        sample_n: 5,
        window_days: 30,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0.6,
        confidence_factors: {
          sample_adequacy: 0.7,
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  },
};

export default rule;
