/**
 * Composite rule: pressure_decel_chain.
 *
 * Fires when the player has BOTH a pressure-gap insight (worse in
 * tournaments than practice) AND a short-putt weakness — short putts
 * are the canonical "decel under pressure" failure mode per Research
 * doc §9 (Pope & Schweitzer loss-aversion; Hickman & Metz pressure data).
 *
 * Source insights: pressure_gap + putt_distance(3-5ft OR 5-10ft) with
 * standing.team_pct in the bottom half.
 */

import type { CompositeRule, EvidenceInsight, CompositeMatch, CompositeContent } from '../types';

function isPressureGap(i: EvidenceInsight): boolean {
  return i.insight_type === 'pressure_gap' && Number(i.evidence.your_value ?? 0) > 0.3;
}

function isWeakShortPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  if (!i.signature.includes('3_5ft') && !i.signature.includes('5_10ft')) return false;
  // Player at or below team avg = worth flagging in a chain
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 50;
}

const rule: CompositeRule = {
  id: 'pressure_decel_chain',
  name: 'Pressure decel chain',
  priority: 'urgent',
  category: 'pressure',

  detect(insights: EvidenceInsight[]): CompositeMatch | null {
    const pressure = insights.find(isPressureGap);
    const shortPutt = insights.find(isWeakShortPutt);
    if (!pressure || !shortPutt) return null;
    return {
      source_insight_ids: [pressure.id, shortPutt.id],
      signals: {
        pressure_delta: Number(pressure.evidence.your_value ?? 0),
        short_putt_signature: shortPutt.signature,
        short_putt_value: Number(shortPutt.evidence.your_value ?? 0),
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const pressureDelta = Number(match.signals.pressure_delta ?? 0);
    const shortPuttPct = Math.round(Number(match.signals.short_putt_value ?? 0));
    const sigParts = String(match.signals.short_putt_signature ?? '').split(':');
    const bucket = sigParts[sigParts.length - 1] === '3_5ft' ? '3-5 ft' : '5-10 ft';
    return {
      title: `Pressure shows up in your short putts`,
      content:
        `You're playing +${pressureDelta.toFixed(1)} strokes worse in ` +
        `tournaments vs practice AND making only ${shortPuttPct}% from ${bucket}. ` +
        `Short putts are the canonical "decel under pressure" failure mode — ` +
        `Tour data shows knee-knockers (4-8 ft) collapse first when nerves ` +
        `tighten the grip (Research doc §9). Practice the routine, not the ` +
        `stroke: same alignment, same number of looks, same trigger.`,
      signature: `pressure_decel:${bucket.replace('-', '_').replace(' ft', 'ft')}`,
      evidence: {
        metric: 'practice_tournament_delta',
        metric_label: 'Pressure decel chain',
        unit: 'strokes',
        your_value: pressureDelta,
        your_value_display: `+${pressureDelta.toFixed(1)}`,
        comparison_value: 0.5,
        comparison_label: 'PGA Tour pressure gap',
        comparison_source: 'pga_baseline',
        sample_n: 5,
        window_days: 30,
        window_start: '',
        window_end: '',
        strokes_impact: pressureDelta,
        strokes_impact_method: 'peer_delta',
        confidence: 0.7,
        confidence_factors: {
          sample_adequacy: 0.8,
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  },
};

export default rule;
