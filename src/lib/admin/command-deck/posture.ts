/**
 * Helm Command Deck — the posture sentence (brief §10, §46 "triage in ~5s").
 *
 * One derived read model, pure and server-side, that answers the operator's
 * first five questions in one scannable line: overall posture, release
 * state, the highest-impact incident, whether self-heal is acting, whether
 * evidence is blind anywhere, and whether a decision is waiting.
 *
 * `tone` NEVER defaults to `'healthy'`. Every branch below is written so a
 * missing or unreadable input degrades the tone toward `'unknown'` or
 * `'degraded'`, never silently toward `'healthy'` — the caller's
 * `all-unknown` fixture (`__tests__/posture.test.ts`) exists specifically to
 * pin that a fully-unreadable input can never produce `tone: 'healthy'`.
 *
 * This is a composition layer over models that already exist and are
 * canonical elsewhere on the page — `selectAttention` (`incidents/attention.ts`)
 * for "what needs attention", `canClaimAllClear` (`incidents/sources.ts`) for
 * "can we claim nothing is wrong" — never a second incident or attention
 * model (brief §44).
 */

import type { IncidentSourceName } from '@/lib/admin/incidents/types';
import type { AttentionRow } from '@/lib/admin/incidents/attention';
import type { ReleaseWatchState } from '@/lib/admin/incidents/release-context';
import type { PostureTone } from './types';

export interface PostureInput {
  /** First row of `selectAttention`, or null when the queue is genuinely
   *  empty (not merely unread — an unread queue must still surface via
   *  `canClaimAllClear`/`evidenceBlind`, not by leaving this null). */
  topAttention: AttentionRow | null;
  /** `selectAttention(..., Number.MAX_SAFE_INTEGER).length` — every row, not
   *  just the page's displayed slice. */
  attentionTotal: number;
  /** Whether the incident board can claim "nothing is wrong" this refresh —
   *  `canClaimAllClear(coverage) && no degraded briefing checks`, exactly the
   *  same boolean `AttentionPanel` already computes. */
  canClaimAllClear: boolean;
  evidenceBlind: boolean;
  blindSources: readonly IncidentSourceName[];
  /** Null when the self-heal board itself failed to read — distinct from
   *  `false`, which means it read fine and nothing is currently flowing. */
  selfHealActing: boolean | null;
  releaseWatch: ReleaseWatchState | 'unknown';
  releaseSha: string | null;
  /** Null when the decision-inbox source itself failed to read — distinct
   *  from `0`, which means it read fine and nothing is waiting. Same split
   *  as `selfHealActing` above, for the same reason: a caller's default `0`
   *  from an unread source must never read as a confirmed calm inbox. */
  decisionCount: number | null;
  now: number;
}

export interface PostureSentence {
  tone: PostureTone;
  /** The single scannable line — clauses joined with " · ", never a
   *  multi-paragraph summary. */
  headline: string;
  releaseWatch: ReleaseWatchState | 'unknown';
  releaseSha: string | null;
  topIncident: AttentionRow | null;
  selfHealActing: boolean | 'unknown';
  evidenceBlind: boolean;
  blindSources: readonly IncidentSourceName[];
  decisionWaiting: boolean;
  computedAt: string;
}

const CRITICAL_REASONS: ReadonlySet<AttentionRow['reason']> = new Set([
  'regression',
  'critical',
  'stage-dead',
  'repair-ci-failed',
]);

function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

function derivePostureTone(input: PostureInput): PostureTone {
  // A blind/unreadable source can never resolve to `'healthy'` even when
  // nothing else is flagged — an empty attention queue over incomplete
  // evidence is a claim we cannot make, not a calm morning.
  if (input.topAttention) {
    if (input.topAttention.reason === 'source-blind') return 'unknown';
    if (CRITICAL_REASONS.has(input.topAttention.reason)) return 'critical';
    return 'degraded';
  }
  if (input.evidenceBlind || !input.canClaimAllClear) {
    return input.evidenceBlind ? 'unknown' : 'degraded';
  }
  return 'healthy';
}

function releaseClause(releaseWatch: ReleaseWatchState | 'unknown', releaseSha: string | null): string {
  const sha = shortSha(releaseSha);
  if (releaseWatch === 'unknown') return 'Release state unknown';
  const label = releaseWatch.replace(/_/g, ' ');
  return sha ? `Release ${sha} — ${label}` : `Release — ${label}`;
}

function selfHealClause(acting: boolean | 'unknown'): string {
  if (acting === 'unknown') return 'Self-heal status unknown';
  return acting ? 'Repair is already running' : 'No repair currently running';
}

function evidenceClause(blind: boolean, sources: readonly IncidentSourceName[]): string | null {
  if (!blind) return null;
  if (sources.length === 0) return 'Evidence is blind somewhere';
  return `Evidence blind: ${sources.join(', ')}`;
}

function decisionClause(count: number | null): string {
  if (count === null) return 'Decisions unknown';
  if (count === 0) return 'No decisions waiting on you';
  return count === 1 ? '1 decision needs you' : `${count} decisions need you`;
}

function topIncidentClause(row: AttentionRow | null, total: number): string | null {
  if (!row) return null;
  return total > 1 ? `${row.headline} (+${total - 1} more)` : row.headline;
}

/** Pure. Never throws — every input is already the caller's honest read of
 *  its own failure modes (null/false/'unknown' rather than a thrown error). */
export function derivePostureSentence(input: PostureInput): PostureSentence {
  const tone = derivePostureTone(input);
  const selfHealActing: boolean | 'unknown' = input.selfHealActing === null ? 'unknown' : input.selfHealActing;

  const clauses: string[] = [];
  if (tone === 'healthy') {
    clauses.push('Production healthy');
  } else if (tone === 'unknown') {
    clauses.push('Production posture unknown');
  } else {
    clauses.push(tone === 'critical' ? 'Production degraded' : 'Production watch');
  }
  clauses.push(releaseClause(input.releaseWatch, input.releaseSha));
  const topClause = topIncidentClause(input.topAttention, input.attentionTotal);
  if (topClause) clauses.push(topClause);
  clauses.push(selfHealClause(selfHealActing));
  const evidence = evidenceClause(input.evidenceBlind, input.blindSources);
  if (evidence) clauses.push(evidence);
  clauses.push(decisionClause(input.decisionCount));

  return {
    tone,
    headline: clauses.join(' · '),
    releaseWatch: input.releaseWatch,
    releaseSha: input.releaseSha,
    topIncident: input.topAttention,
    selfHealActing,
    evidenceBlind: input.evidenceBlind,
    blindSources: input.blindSources,
    decisionWaiting: input.decisionCount !== null && input.decisionCount > 0,
    computedAt: new Date(input.now).toISOString(),
  };
}
