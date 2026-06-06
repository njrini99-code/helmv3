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

/**
 * Absolute-skill floor (PDC-1).
 *
 * `team_pct` is 0 for the worst/only row on a tiny team, so an elite putter
 * gets flagged "weak" on team rank alone. Putt make-% is `higher_better`, so
 * only flag when make-% is also below the PGA baseline. Falls back to the
 * team gate when no usable `pga_value` exists (legacy/0).
 */
function belowPgaFloor(i: EvidenceInsight): boolean {
  const standing = i.evidence.standing;
  if (!standing) return true;
  const pga = standing.pga_value;
  if (typeof pga !== 'number' || pga <= 0) return true;
  const player = standing.player_value;
  if (typeof player !== 'number') return true;
  return player < pga - 1;
}

function isWeakShortPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  if (!i.signature.includes('3_5ft') && !i.signature.includes('5_10ft')) return false;
  // Player at or below team avg AND below the PGA absolute floor.
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 50 && belowPgaFloor(i);
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
    // Recoverable strokes = gap ABOVE the typical ~0.5-stroke pressure gap
    // (everyone plays a touch worse under pressure), discounted by a
    // closability factor — the domain doc calls the college 2-5 stroke gap
    // "typical / slow-to-close", so the full delta is NOT all recoverable.
    const PRESSURE_REFERENCE = 0.5;
    const PRESSURE_CLOSABILITY = 0.5;
    const recoverablePerRound = Math.max(
      0,
      (pressureDelta - PRESSURE_REFERENCE) * PRESSURE_CLOSABILITY,
    );
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
        strokes_impact: recoverablePerRound,
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
