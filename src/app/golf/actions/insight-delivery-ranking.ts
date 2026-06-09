import { scoreInsight, type CoachWeights } from '@/lib/coachhelm/v3/ranking/score';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type {
  InsightCategory,
  InsightEvidence,
  InsightMovement,
} from '@/lib/coachhelm/v2/insights/types';

export interface RankableEvidenceInsight {
  id: string;
  player_id: string;
  category: InsightCategory | null;
  insight_type?: string | null;
  title: string;
  content: string;
  signature: string | null;
  evidence: InsightEvidence;
  metadata: (Record<string, unknown> & { movement?: InsightMovement }) | null;
  lifecycle_state: 'tentative' | 'detected' | 'matured' | 'addressed' | 'resolved' | 'archived';
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  acknowledged_at: string | null;
  resolved_at: string | null;
  outcome_status?: 'improved' | 'no_change' | 'worsened' | null;
  outcome_measured_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normalize a metric id to a canonical *subject* key so cross-version aliases
 * collapse to one row in dedupe.
 */
function canonicalMetricSubject(metric: string | null | undefined): string {
  if (!metric) return '';
  const m = metric.toLowerCase();
  const v2Par = m.match(/^par_scoring_par(\d)$/);
  if (v2Par) return `scoring_par_${v2Par[1]}`;
  return m;
}

function feedRankScore(
  insight: RankableEvidenceInsight,
  weights: CoachWeights = {},
  goals: Goal[] = [],
): number {
  return scoreInsight(
    {
      insight_type: insight.insight_type ?? insight.category ?? 'unknown',
      strokes_impact: insight.evidence?.strokes_impact ?? 0,
      confidence: insight.evidence?.confidence ?? 0,
      metric: insight.evidence?.metric,
      category: insight.category ?? undefined,
      priority: insight.priority,
      sample_n: insight.evidence?.sample_n,
    },
    weights,
    goals,
  );
}

/**
 * Sort a mapped insight list by the shared composite, newest-first on ties.
 */
export function rankEvidenceInsights<T extends RankableEvidenceInsight>(
  insights: T[],
  weights: CoachWeights = {},
  goals: Goal[] = [],
): T[] {
  return insights
    .map((insight) => ({ insight, score: feedRankScore(insight, weights, goals) }))
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return (b.insight.created_at ?? '').localeCompare(a.insight.created_at ?? '');
    })
    .map((row) => row.insight);
}

/**
 * Cross-surface dedupe by `(player_id:category:metric-subject)`.
 */
export function dedupeBySubject<T extends RankableEvidenceInsight>(insights: T[]): T[] {
  const seenSignatures = new Set<string>();
  return insights.filter((insight) => {
    const subject = canonicalMetricSubject(insight.evidence?.metric) || insight.title;
    const sig = `${insight.player_id}:${insight.category}:${subject}`;
    if (seenSignatures.has(sig)) return false;
    seenSignatures.add(sig);
    return true;
  });
}

/**
 * Collapse the 3 separate par_scoring rows into one "Scoring by par type" card
 * per player.
 */
export function collapseParScoring<T extends RankableEvidenceInsight>(insights: T[]): T[] {
  const PAR_METRICS = new Set(['scoring_par_3', 'scoring_par_4', 'scoring_par_5']);
  const out: T[] = [];
  const byPlayer = new Map<string, T[]>();
  for (const ins of insights) {
    const m = ins.evidence?.metric ?? '';
    if (PAR_METRICS.has(m)) {
      const arr = byPlayer.get(ins.player_id) ?? [];
      arr.push(ins);
      byPlayer.set(ins.player_id, arr);
    } else {
      out.push(ins);
    }
  }
  for (const [, rows] of byPlayer) {
    const ordered = rows
      .slice()
      .sort((a, b) => parNum(a) - parNum(b));
    const survivor = ordered[0];
    if (!survivor) continue;
    const r1 = (x: unknown) =>
      typeof x === 'number' ? (Math.round(x * 10) / 10).toString() : '-';
    const lines = ordered.map((r) => {
      const par = parNum(r);
      const d = (r.evidence as InsightEvidence & { detail?: Record<string, unknown> })?.detail ?? {};
      const avg = r.evidence?.your_value;
      return (
        `Par ${par}: ${typeof avg === 'number' ? avg.toFixed(2) : '-'} ` +
        `(${r1(d.bogey_rate)}% bogey, ${r1(d.double_plus_rate)}% double+)`
      );
    });
    out.push({
      ...survivor,
      title: 'Scoring by par type',
      content: lines.join(' · '),
    });
  }
  return out;
}

function parNum(ins: RankableEvidenceInsight): number {
  const m = ins.evidence?.metric ?? '';
  const hit = m.match(/scoring_par_(\d)/);
  return hit ? Number(hit[1]) : 99;
}
