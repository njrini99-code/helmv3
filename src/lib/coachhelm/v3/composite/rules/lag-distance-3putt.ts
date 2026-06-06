/**
 * Composite rule: lag_distance_3putt (W30.5).
 *
 * Fires when the player has BOTH a weak long-putt insight (15+ ft
 * lag distance — putts that should leave a tap-in) AND a weak short-
 * putt insight (3-5 ft — where the "tap-in" actually has to be made).
 * Classic 3-putt cascade: bad lag → 6-foot comebacker → miss.
 *
 * Uses existing Tier-1 putt_distance insights for two buckets; no ctx.
 */

import type { CompositeRule, CompositeMatch, CompositeContent, EvidenceInsight } from '../types';

/**
 * Absolute-skill floor (lag3putt-2 / PDC-1).
 *
 * `team_pct = PERCENT_RANK()` is 0 for the only/worst row on a tiny team,
 * so a 94.8%-from-3-5ft putter on a team of two gets flagged "weak" on
 * team rank alone. Putt make-% metrics are `higher_better`, so a player
 * is only genuinely weak when their make-% is also below the PGA baseline.
 * Require `player_value < pga_value` (with a small tolerance) so a putter
 * who already beats Tour isn't dragged into a 3-putt-cascade card by a
 * degenerate team percentile. When `pga_value` is missing (legacy/0), fall
 * back to the team-rank gate alone — no regression vs prior behavior.
 */
function belowPgaFloor(i: EvidenceInsight): boolean {
  const standing = i.evidence.standing;
  if (!standing) return true; // no baseline to compare → defer to team gate
  const pga = standing.pga_value;
  if (typeof pga !== 'number' || pga <= 0) return true; // unset baseline
  const player = standing.player_value;
  if (typeof player !== 'number') return true;
  // higher_better: weak means make-% below Tour (1 pt tolerance for noise).
  return player < pga - 1;
}

function isWeakLagPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  // Long buckets: anything 15+ ft (the v3 generator ships 15_25ft/25_plus_ft;
  // legacy v2 used 15_20ft/20_plus_ft — accept any of these).
  const sig = i.signature;
  const isLong =
    sig.includes('15_25ft') ||
    sig.includes('25_plus_ft') ||
    sig.includes('15_20ft') ||
    sig.includes('20_plus_ft');
  if (!isLong) return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 40 && belowPgaFloor(i);
}

function isWeakShortPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  if (!i.signature.includes('3_5ft')) return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 50 && belowPgaFloor(i);
}

const rule: CompositeRule = {
  id: 'lag_distance_3putt',
  name: 'Lag-distance → 3-putt cascade',
  priority: 'urgent',
  category: 'putting',

  detect(insights) {
    const lag = insights.find(isWeakLagPutt);
    const short = insights.find(isWeakShortPutt);
    if (!lag || !short) return null;
    return {
      source_insight_ids: [lag.id, short.id],
      signals: {
        lag_signature: lag.signature,
        lag_value: Number(lag.evidence.your_value ?? 0),
        short_value: Number(short.evidence.your_value ?? 0),
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const lagPct = Math.round(Number(match.signals.lag_value ?? 0));
    const shortPct = Math.round(Number(match.signals.short_value ?? 0));
    return {
      title: 'Lag putts → 3-putt cascade',
      content:
        `Your long putts (15+ ft) are leaving makeable comebackers — ` +
        `${lagPct}% conversion isn't the problem, distance control is. ` +
        `Combined with ${shortPct}% from 3-5 ft, you're paying twice for ` +
        `each long miss. Practice 30-foot lag drills with a 3-foot ` +
        `circle around the cup; the goal is leave-distance, not make rate.`,
      signature: 'lag_distance_3putt',
      evidence: {
        metric: 'three_putt_chain',
        metric_label: 'Lag → 3-putt cascade',
        unit: 'percent',
        your_value: shortPct,
        your_value_display: `${shortPct}% from 3-5 ft`,
        comparison_value: 85,
        comparison_label: 'Tour ~85%',
        comparison_source: 'pga_baseline',
        sample_n: 5,
        window_days: 30,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0.7,
        confidence_factors: { sample_adequacy: 0.8, recency: 1.0, variance: 0.5 },
      },
    };
  },
};

export default rule;
