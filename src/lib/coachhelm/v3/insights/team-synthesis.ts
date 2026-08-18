/**
 * Roster-wide signals for the Team bucket that has always been empty.
 *
 * `groupSignals` buckets by `playerId ?? '__team__'` and PINS the team bucket
 * first — the surface was built for this. Measured against production
 * 2026-08-18: of 615 rows in `golf_coach_insights`, `player_id IS NULL` on
 * ZERO and `category = 'team_trend'` on ZERO. Nothing has ever filled it.
 *
 * ── WHAT A TEAM SIGNAL IS NOT ───────────────────────────────────────────────
 *
 * "Several players share this insight" is the obvious synthesis and it is
 * noise. All 12 Guilford players carry an `approach_proximity_175_plus_ft`
 * insight, because the generator emits one per player whether or not it found
 * a leak. Shared PRESENCE measures generator coverage, not a team pattern, and
 * a card saying "12 of 12 players have an approach insight" tells a coach
 * nothing he can act on.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 *
 * Shared RECOVERABLE STROKES. Grouping active insights by metric and summing
 * |strokes_impact| across the roster:
 *
 *     Guilford, active insights          players   combined strokes/round
 *     practice_tournament_delta              4            18.01
 *     putts_made_3_5ft_pct                   6             9.95
 *     scrambling_pct_sand                    5             6.27
 *     putts_made_5_10ft_pct                  6             5.09
 *
 * "Six of your twelve are leaking a combined 9.95 strokes a round inside five
 * feet" is a practice-block decision, and no per-player card makes it.
 *
 * Derived in the read path from the signals already fetched — no new table, no
 * migration, no cron. Same reasoning as the causal chains: a team card can
 * then only ever cite leaks the coach can also open individually. It composes
 * with `readStrokeImpact`; before that fix every sum here would have been zero.
 */

import type { GroupedSignal, SignalSeverity } from '@/lib/coachhelm/signal-grouping';

/**
 * How many DISTINCT players must carry a measured leak on the same metric
 * before it is a team pattern rather than a coincidence. Two players sharing a
 * weakness is a pairing; three is a practice block.
 */
export const TEAM_SIGNAL_MIN_PLAYERS = 3;

/** Combined strokes/round → severity. Grounded in the measured spread above:
 *  Guilford's largest real cluster is 18 strokes and its smallest reportable
 *  one is ~5, so the bands sit inside the range the data actually produces
 *  rather than at invented round numbers. */
function severityForCombined(combined: number): SignalSeverity {
  if (combined >= 12) return 'urgent';
  if (combined >= 6) return 'high';
  if (combined >= 3) return 'medium';
  return 'low';
}

function metricOf(signal: GroupedSignal): { id: string; label: string } | null {
  const ev = signal.evidence;
  if (!ev || typeof ev !== 'object') return null;
  const rec = ev as Record<string, unknown>;
  const id = rec.metric;
  if (typeof id !== 'string' || id.length === 0) return null;
  const label = typeof rec.metric_label === 'string' && rec.metric_label.length > 0 ? rec.metric_label : id;
  return { id, label };
}

/**
 * Synthesize team-scoped signals from a roster's per-player signals.
 *
 * Only PLAYER-scoped signals carrying a non-zero measured impact participate:
 * an already-team-scoped row is skipped so a second pass can never fold this
 * function's own output back into itself, and a null/zero impact is not a leak
 * to pool. A player carrying the same metric twice counts once.
 */
export function synthesizeTeamSignals(signals: GroupedSignal[]): GroupedSignal[] {
  const byMetric = new Map<
    string,
    { label: string; playerImpact: Map<string, number> }
  >();

  for (const s of signals) {
    if (s.playerId === null) continue;
    if (s.strokeImpact === null || !Number.isFinite(s.strokeImpact)) continue;
    const impact = Math.abs(s.strokeImpact);
    if (impact <= 0) continue;
    const metric = metricOf(s);
    if (!metric) continue;

    const entry = byMetric.get(metric.id) ?? { label: metric.label, playerImpact: new Map() };
    // Same player, same metric, twice → keep the larger reading rather than
    // double-counting one player into the roster total.
    const held = entry.playerImpact.get(s.playerId);
    entry.playerImpact.set(s.playerId, held === undefined ? impact : Math.max(held, impact));
    byMetric.set(metric.id, entry);
  }

  const out: GroupedSignal[] = [];
  for (const [metricId, entry] of byMetric) {
    const players = entry.playerImpact.size;
    if (players < TEAM_SIGNAL_MIN_PLAYERS) continue;

    const combined = [...entry.playerImpact.values()].reduce((a, b) => a + b, 0);
    const rounded = Math.round(combined * 100) / 100;

    out.push({
      id: `team:${metricId}`,
      // NOT 'insight'. There is no row behind this and its impact is a sum of
      // rows already in the list — see the `kind` docs in signal-grouping.ts.
      kind: 'team_synthesis',
      category: metricId,
      severity: severityForCombined(rounded),
      title: `Team leak: ${entry.label}`,
      claim:
        `${players} players are losing a combined ${rounded.toFixed(2)} strokes per round on ` +
        `${entry.label}. Each is listed on their own card below — this is the roster total, ` +
        `and the size of the practice block it would take to close.`,
      // A synthesis has no detection date of its own; it is as current as the
      // signals it was built from, which the surface already dates.
      ageDays: 0,
      status: 'active',
      strokeImpact: rounded,
      playerId: null,
      supersededCount: 0,
      evidence: {
        metric: metricId,
        metric_label: entry.label,
        strokes_impact: rounded,
        players_affected: players,
      },
    });
  }

  // Biggest combined leak first — the same "most recoverable first" rule the
  // per-player list now follows.
  return out.sort((a, b) => (b.strokeImpact ?? 0) - (a.strokeImpact ?? 0));
}
