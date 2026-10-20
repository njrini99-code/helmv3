import {
  scoreInsightFactors,
  type CoachWeights,
  type RankScoreFactors,
} from '@/lib/coachhelm/v3/ranking/score';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { sanitizeProse } from '@/lib/coachhelm/v3/themes/assemble';
import type {
  InsightCategory,
  InsightEvidence,
  InsightMovement,
} from '@/lib/coachhelm/v2/insights/types';
import type { FoldedRead } from './insight-delivery-reads';

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
  /**
   * The database `updated_at` as stored (null when the row has none). The
   * mappers fill `updated_at` with "now" when the column is null, so recency
   * comparisons read this field first (`dedupeBySubject`).
   */
  source_updated_at?: string | null;
  /** Reads folded into this one at delivery (`foldOverlappingReads`, flag `coachhelm_reads_v1_copy`). */
  also?: FoldedRead[];
}

/**
 * A2/A6 top-N audit — the minimal raw `golf_coach_insights` row shape any
 * reader needs to produce a {@link RankableEvidenceInsight}, independent of
 * the heavier `EvidenceInsight` (drills, sanitized content) that
 * `insight-delivery.ts`'s 'use server' actions assemble. Exported so a
 * reader outside that file (e.g. a chat tool) can route through the SAME
 * canonical rank -> collapse -> dedupe pipeline without duplicating it, or
 * depending on insight-delivery.ts's module-private mapper.
 */
export interface RawInsightRowForRanking {
  id: string | null;
  player_id: string | null;
  category: string | null;
  insight_type?: string | null;
  title: string | null;
  content: string | null;
  signature: string | null;
  evidence: unknown;
  metadata: unknown;
  lifecycle_state: string | null;
  status: string | null;
  priority: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Maps a raw row to the canonical ranker's input shape, applying the SAME
 * eligibility floor `insight-delivery.ts`'s `mapRowToEvidenceInsight` applies:
 * a row without a numeric `evidence.strokes_impact`/`confidence` or a string
 * `evidence.metric` is invisible to every ranked surface (the feed can't
 * score it either), so it must be invisible here too — otherwise a row the
 * feed would never show could still surface as a chat tool's "leading"
 * insight, breaking cross-surface agreement (A6).
 */
export function mapRowToRankable(row: RawInsightRowForRanking): RankableEvidenceInsight | null {
  if (!row.id || !row.player_id || !row.title) return null;
  if (!row.evidence || typeof row.evidence !== 'object') return null;
  const evidence = row.evidence as InsightEvidence;
  if (typeof evidence.strokes_impact !== 'number') return null;
  if (typeof evidence.confidence !== 'number') return null;
  if (typeof evidence.metric !== 'string') return null;

  return {
    id: row.id,
    player_id: row.player_id,
    category: (row.category as InsightCategory | null) ?? null,
    insight_type: row.insight_type ?? null,
    title: row.title,
    // Strip authoring artifacts ("(Research doc §N)" citations, the dangling
    // "standing card below" sentence) the same way every other reader does
    // (insight-delivery.ts's mapRowToEvidenceInsight, themes/assemble.ts) —
    // older stored rows still carry them, and this is the chat tool's only
    // mapper, so skipping it would let a coach see raw authoring copy.
    content: sanitizeProse(row.content),
    signature: row.signature ?? null,
    evidence,
    metadata: (row.metadata ?? null) as RankableEvidenceInsight['metadata'],
    lifecycle_state:
      (row.lifecycle_state as RankableEvidenceInsight['lifecycle_state']) ?? 'detected',
    status: (row.status as RankableEvidenceInsight['status']) ?? 'active',
    priority: (row.priority as RankableEvidenceInsight['priority']) ?? 'medium',
    acknowledged_at: row.acknowledged_at ?? null,
    resolved_at: row.resolved_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    source_updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
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

function feedRankFactors(
  insight: RankableEvidenceInsight,
  weights: CoachWeights = {},
  goals: Goal[] = [],
): RankScoreFactors {
  return scoreInsightFactors(
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
 *
 * Confidence is the generator's raw support score: calibration is a
 * documented no-op (see `scoreInsightWithCalibration` in ranking/score.ts), so
 * `_sb` is accepted for caller compatibility and not read. Each row carries
 * its score and the factors behind it so a surface can record both.
 */
export async function rankEvidenceInsightsScored<T extends RankableEvidenceInsight>(
  insights: T[],
  weights: CoachWeights = {},
  goals: Goal[] = [],
  _sb?: SupabaseClient<Database>,
): Promise<Array<{ insight: T; score: number; factors: RankScoreFactors }>> {
  return insights
    .map((insight) => {
      const factors = feedRankFactors(insight, weights, goals);
      return { insight, score: factors.score, factors };
    })
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return (b.insight.created_at ?? '').localeCompare(a.insight.created_at ?? '');
    });
}

/**
 * Ranked insights, score discarded — the shape every caller of the ordering
 * wants. Delegates to `rankEvidenceInsightsScored` so there is exactly one
 * ranking implementation.
 */
export async function rankEvidenceInsights<T extends RankableEvidenceInsight>(
  insights: T[],
  weights: CoachWeights = {},
  goals: Goal[] = [],
  sb?: SupabaseClient<Database>,
): Promise<T[]> {
  const scored = await rankEvidenceInsightsScored(insights, weights, goals, sb);
  return scored.map((row) => row.insight);
}

/** The issue key one card per issue collapses on: `(player_id:category:metric-subject)`. */
export function issueSubjectKey(insight: RankableEvidenceInsight): string {
  const subject = canonicalMetricSubject(insight.evidence?.metric) || insight.title;
  return `${insight.player_id}:${insight.category}:${subject}`;
}

/** The stored `updated_at`; a mapper's "now" stand-in for a missing one never counts as fresh. */
function storedUpdatedAt(insight: RankableEvidenceInsight): string {
  if (insight.source_updated_at !== undefined) return insight.source_updated_at ?? '';
  return insight.updated_at ?? '';
}

/**
 * Whether `a` is newer evidence than `b`: the later stored `updated_at`, then
 * the later newest round in the window (`evidence.window_end`), then the later
 * `created_at`. Equal on all three is not newer, so rank order decides.
 */
function isNewerEvidence(a: RankableEvidenceInsight, b: RankableEvidenceInsight): boolean {
  const keys = (i: RankableEvidenceInsight): string[] => [
    storedUpdatedAt(i),
    typeof i.evidence?.window_end === 'string' ? i.evidence.window_end : '',
    i.created_at ?? '',
  ];
  const ka = keys(a);
  const kb = keys(b);
  for (let k = 0; k < ka.length; k += 1) {
    const cmp = (ka[k] ?? '').localeCompare(kb[k] ?? '');
    if (cmp !== 0) return cmp > 0;
  }
  return false;
}

/** The generator that wrote the row: two rows of one generator on one subject are one read written twice. */
function readFamily(insight: RankableEvidenceInsight): string {
  return insight.insight_type ?? '';
}

/**
 * Cross-surface collapse: one card per issue, keyed on
 * `(player_id:category:metric-subject)` (`issueSubjectKey`). Shared by every
 * Fairway feed, the Clubhouse loaders and the coach chat tool.
 *
 * The key deliberately ignores `coach_id`, `team_id` and the signature
 * suffix. In production the duplicates are the same issue written twice:
 * - once coach-scoped and once as a coach_id-NULL orphan, or
 * - under two signatures for one metric (tee_strategy sharp vs
 *   inconclusive, for example).
 *
 * Newest wins (PR #2073; CoachHelm Slice 0): among the rows that the group's
 * highest-ranked row's own generator wrote, the one with the NEWEST evidence
 * survives (`isNewerEvidence`: stored `updated_at`, then the newest round in
 * the window, then `created_at`; a full tie keeps rank order), so a stale
 * copy never stands in for the current reading. A row another generator
 * wrote on the same subject (a composite on its base metric) is a different
 * read, not a twin: as before, the highest-ranked row's generator holds the
 * slot, so this only ever changes which of two copies of one read is shown.
 *
 * The survivor stays at ITS OWN position in the ranked input, so it is
 * ranked by its own score and never inherits a stale sibling's higher one.
 *
 * Why not A6 `groupIssues`? It keys on shot-id overlap, and its contract
 * forbids inferring overlap from metric or label. Insight rows carry no
 * shot ids, so this row-level key is the honest grouping for the read path.
 */
export function dedupeBySubject<T extends RankableEvidenceInsight>(insights: T[]): T[] {
  const winner = new Map<string, T>();
  for (const insight of insights) {
    const key = issueSubjectKey(insight);
    const current = winner.get(key);
    if (!current) {
      winner.set(key, insight);
    } else if (readFamily(insight) === readFamily(current) && isNewerEvidence(insight, current)) {
      winner.set(key, insight);
    }
  }
  return insights.filter((insight) => winner.get(issueSubjectKey(insight)) === insight);
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
