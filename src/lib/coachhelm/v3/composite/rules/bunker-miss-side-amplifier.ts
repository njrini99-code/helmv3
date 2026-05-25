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
 */

import type { CompositeRule, EvidenceInsight, CompositeMatch, CompositeContent } from '../types';

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
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const sandPct = Math.round(Number(match.signals.sand_save_pct ?? 0));
    const dir = String(match.signals.bias_direction ?? 'left');
    return {
      title: `Bunker + ${dir}-bias putt pattern is compounding`,
      content:
        `You're at ${sandPct}% sand save AND consistently missing ${dir} on ` +
        `break putts. When bunker shots leak ${dir}-of-pin and your putts ` +
        `tend to miss ${dir}, you're effectively short-siding yourself ` +
        `twice in a row. Worth a session focused on splash-out distance ` +
        `control so the bunker shot stops setting up the bias.`,
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
