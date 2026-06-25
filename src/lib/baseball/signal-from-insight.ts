// =============================================================================
// src/lib/baseball/signal-from-insight.ts
//
// Packet: signal-inbox (completeness fix) — the MISSING first link of the V9
// "Core Product Loop" (v9_cross_subsystem_data_signal_action_map.md):
//
//   "4. Updated object may create a SIGNAL.
//    5. Signal is reviewed, owned, or converted to action."
//
// Before this module the engine wrote only baseball_coach_insights and NOTHING
// ever inserted baseball_signals, so the Signal Inbox + signal->action->timeline
// loop (signals.ts / signal-inbox.ts / Staff Decision Room) was permanently
// empty. This PURE mapper promotes the engine's ranked insight candidates into
// source-backed baseball_signals rows. The action layer (coachhelm.ts) upserts
// them by the engine's own dedupe_key so a re-run REFRESHES the open signal
// instead of cloning it (non-destructive).
//
// HONESTY (binding — recalibrated for 12-25 player rosters + box-score samples):
//   * Severity is derived ONLY from the already-gated priority. The generators
//     run enforcePriorityConfidenceGate + clampThinSample, so a thin-sample
//     candidate can never arrive as 'high' — and this mapper never re-inflates.
//   * A sub-threshold sample sets disposition='sample_too_small' (FIRST-CLASS):
//     the inbox shows it but never as authoritative.
//   * source_refs are carried VERBATIM from the insight's evidence (the real
//     tables/columns the generator read) PLUS a citation back to the insight
//     itself, so every signal is source-backed and signal->insight is traceable.
//   * confidence/sample_n/visibility/generated_at all flow through — no AI
//     output without source refs + stored confidence + visibility.
//
// PURE: no DB, no Supabase, no side effects. Safe on server + in unit tests.
// =============================================================================

import type {
  BaseballInsightCandidate,
} from '@/lib/coachhelm/baseball/generators';
import type { InsightPriority } from '@/lib/coachhelm/shared/evidence-types';
import type {
  BaseballSignalInsert,
  BaseballSignalSeverity,
  BaseballSignalCategory,
  BaseballSignalDisposition,
  BaseballSignalVisibility,
  BaseballRecommendedActionType,
  BaseballSignalSourceRef,
  BaseballJson,
} from '@/lib/types/baseball-signals';
import {
  decideAiOutput,
  applyGuardrails,
  DEFAULT_AI_POLICY,
  type AiPolicy,
  type AiVisibility,
  type AiWithholdReason,
} from '@/lib/baseball/ai-policy';

// -----------------------------------------------------------------------------
// Tuning — must stay in lock-step with the read model's honesty floor.
// signal-inbox.ts treats a numeric signal with sample_n < this as sample-too-
// small even if the generator forgot the disposition; we set it HERE explicitly.
// -----------------------------------------------------------------------------

/** Below this many observations a numeric signal is not authoritative. */
export const SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD = 6;

/**
 * Only candidates at/above this priority are promoted to the Signal Inbox. The
 * inbox is a triage workspace, not a dump of every diagnostic insight — 'low'
 * insights still live in baseball_coach_insights (the engine store) and surface
 * in the Daily Brief, but they do not create triage work. This keeps a 25-player
 * roster's inbox actionable, not noisy.
 */
const PROMOTE_PRIORITIES: ReadonlySet<InsightPriority> = new Set([
  'medium',
  'high',
  'urgent',
]);

// -----------------------------------------------------------------------------
// Mappings
// -----------------------------------------------------------------------------

/** Gated priority -> V10 Signal Stack severity bucket. Never inflates. */
function priorityToSeverity(priority: InsightPriority): BaseballSignalSeverity {
  switch (priority) {
    case 'urgent':
      return 'critical';
    case 'high':
      return 'warning';
    case 'medium':
    case 'low':
    default:
      return 'info';
  }
}

/**
 * Generator id -> signal category (V10 §Signals category list). A generator that
 * does not map to a domain falls back to 'operations' (never a golf label).
 */
function generatorToCategory(generator: string): BaseballSignalCategory {
  switch (generator) {
    case 'two_strike_chase':
    case 'game_vs_practice_gap':
    case 'composite_translation_gap':
      return 'hitting';
    case 'velo_command_decay':
    case 'composite_command_decay':
      return 'pitching';
    case 'workload':
      return 'workload';
    case 'readiness':
      return 'readiness';
    case 'lift_compliance':
    case 'lift_rpe_spike':
    case 'composite_lift_to_field_risk':
      return 'strength';
    case 'schedule_conflict':
      return 'operations';
    case 'practice_effectiveness':
      return 'practice';
    case 'import_quality':
      return 'import_quality';
    case 'video_evidence':
      return 'video_evidence';
    default:
      return 'operations';
  }
}

/**
 * Generator id -> the recommended action a coach can one-click convert into.
 * Returns the recommended-action union value + a short imperative label. The
 * conversion still requires an explicit coach action (convertSignalToAction);
 * this only pre-fills the suggestion. Honest 'none' when no obvious next step.
 */
function generatorToRecommendation(generator: string): {
  type: BaseballRecommendedActionType;
  label: string | null;
} {
  switch (generator) {
    case 'two_strike_chase':
      return { type: 'practice_block', label: 'Add a two-strike approach block' };
    case 'game_vs_practice_gap':
    case 'composite_translation_gap':
      return { type: 'practice_block', label: 'Add a game-speed rep block' };
    case 'velo_command_decay':
    case 'composite_command_decay':
      return { type: 'video_request', label: 'Request a bullpen clip to review' };
    case 'workload':
      return { type: 'lift_modification', label: 'Adjust the workload plan' };
    case 'readiness':
      return { type: 'player_note', label: 'Check in with the player' };
    case 'lift_compliance':
      return { type: 'player_task', label: 'Assign the missed lift' };
    case 'lift_rpe_spike':
    case 'composite_lift_to_field_risk':
      return { type: 'lift_modification', label: 'Deload the next session' };
    case 'schedule_conflict':
      return { type: 'meeting_item', label: 'Resolve the schedule conflict' };
    case 'practice_effectiveness':
      return { type: 'meeting_item', label: 'Review practice plan effectiveness' };
    case 'import_quality':
      return { type: 'import_review', label: 'Review the flagged import' };
    case 'video_evidence':
      return { type: 'video_request', label: 'Attach supporting video' };
    default:
      return { type: 'none', label: null };
  }
}

/** Strictest-wins owner role for a category (who triages it). */
function categoryToOwnerRole(category: BaseballSignalCategory): string {
  switch (category) {
    case 'import_quality':
      return 'operations';
    case 'academics':
    case 'operations':
      return 'operations';
    case 'strength':
    case 'workload':
    case 'readiness':
      return 'strength';
    case 'pitching':
      return 'pitching';
    default:
      return 'coaching';
  }
}

/** Engine source visibility (player_visible flag) -> signal visibility ladder. */
function insightVisibility(playerVisible: boolean): BaseballSignalVisibility {
  // Box-score engine insights are staff_only unless every source allows the
  // player to read it; the candidate already resolved that strictest-wins.
  return playerVisible ? 'player_only' : 'staff_only';
}

/**
 * Carry the insight's own provenance onto the signal AND cite the insight row
 * itself, so the source drawer can walk signal -> insight -> underlying tables.
 * The insight refs use the engine SourceRef shape ({ table, id, ... }); the
 * signal SourceRef shape uses { source_table, source_id, ... }. We translate.
 */
function buildSignalSourceRefs(
  candidate: BaseballInsightCandidate,
  insightId: string | null,
): BaseballJson {
  const fromEvidence: BaseballSignalSourceRef[] = candidate.evidence.source_refs.map(
    (r) => ({
      source_table: r.table,
      column: r.column,
      source_id: r.id ?? null,
      sample_n: r.sample_n,
      confidence: r.confidence ?? null,
      label: r.label,
      visibility: r.visibility,
    }),
  );

  // Citation back to the insight this signal was promoted from (when persisted).
  const citation: BaseballSignalSourceRef[] = insightId
    ? [
        {
          source_table: 'baseball_coach_insights',
          source_id: insightId,
          label: `${candidate.title} (CoachHelm insight)`,
          confidence: candidate.confidence,
          visibility: insightVisibility(candidate.playerVisible),
        },
      ]
    : [];

  return [...citation, ...fromEvidence] as unknown as BaseballJson;
}

/** Compact, factual evidence line built from the diagnosis drivers. */
function buildEvidenceLine(candidate: BaseballInsightCandidate): string | null {
  const drivers = candidate.evidence.diagnosis.drivers;
  if (!drivers || drivers.length === 0) return null;
  const parts = drivers.slice(0, 3).map((d) => {
    const v =
      d.unit === 'percent'
        ? `${Math.round(d.value)}%`
        : d.unit === 'mph'
          ? `${d.value} mph`
          : `${d.value}`;
    return `${d.metric} ${v} (n=${d.sample_n})`;
  });
  return parts.join(' · ');
}

// -----------------------------------------------------------------------------
// Public mapper
// -----------------------------------------------------------------------------

export interface SignalFromInsightOptions {
  teamId: string;
  /** Auth user id (created_by audit). */
  createdByUserId: string | null;
  /** The persisted insight row id, when available (enables the citation ref). */
  insightId?: string | null;
  /**
   * Stable engine dedupe key (`${generator}:${playerId ?? 'team'}`). MUST match
   * the key the insight upsert used so signal + insight stay paired and a re-run
   * UPSERTs the same open signal instead of cloning it.
   */
  dedupeKey: string;
  /** ISO timestamp for created/generated_at parity with the insight row. */
  nowIso: string;
  /** TTL days before the signal auto-expires (default 30). */
  ttlDays?: number;
  /**
   * The team's resolved AI-governance policy (ai-policy.ts). When provided, the
   * mapper enforces it: a candidate below ai_confidence_threshold is WITHHELD,
   * a candidate lacking source_refs under ai_require_source_refs is WITHHELD, a
   * player-visible candidate is downgraded to staff_only unless
   * ai_player_visible_enabled (and, under ai_require_staff_approval, until a coach
   * approves it), and the medical/academic guardrails redact the narrative.
   * Defaults to DEFAULT_AI_POLICY (the safe posture) so a caller that forgets to
   * pass a policy still gets the guarded behavior — never an open door.
   */
  policy?: AiPolicy;
}

/**
 * The audit-bearing result of mapping ONE candidate: the signal row to upsert
 * (null when WITHHELD by policy) plus the governance decision so the caller can
 * write the v4 AI-audit row (disposition / withheld reason / guardrails fired).
 */
export interface SignalFromInsightAudit {
  /** The signal row to upsert, or null when policy withheld this output. */
  row: BaseballSignalInsert | null;
  /** 'approved' | 'pending' | 'withheld' — the audit disposition. */
  disposition: 'approved' | 'pending' | 'withheld';
  /** Why the output was withheld or downgraded (null on a clean approved pass). */
  reason: AiWithholdReason | null;
  /** Visibility the generator WANTED before policy. */
  desiredVisibility: AiVisibility;
  /** Effective visibility after policy (may be downgraded to staff_only). */
  effectiveVisibility: AiVisibility;
  /** Whether a content guardrail redacted any narrative field. */
  guardrailRedacted: boolean;
  guardrailMedicalHit: boolean;
  guardrailAcademicHit: boolean;
  /** The candidate's confidence (for the audit row). */
  confidence: number | null;
  /** Whether the candidate carried any source refs. */
  hasSourceRefs: boolean;
}

/**
 * Map ONE ranked insight candidate to a baseball_signals insert, or `null` when
 * the candidate is below the promotion threshold (low-priority insights live in
 * the engine store only). Pure: callers (coachhelm.ts) collect the non-null rows
 * and upsert them by `onConflict: 'team_id,dedupe_key'`.
 */
export function signalFromInsight(
  candidate: BaseballInsightCandidate,
  opts: SignalFromInsightOptions,
): BaseballSignalInsert | null {
  return signalFromInsightWithAudit(candidate, opts).row;
}

/**
 * The audit-bearing mapper. Same mapping as signalFromInsight, but returns the
 * full governance decision (so the engine can write the AI-audit row) AND applies
 * the team AI policy:
 *
 *   1. Below-promotion-priority candidates are dropped (existing behavior).
 *   2. The AI policy (opts.policy, default = safe posture) decides emit /
 *      visibility / disposition via decideAiOutput:
 *        - master AI off / staff AI off / below confidence / missing source refs
 *          => WITHHELD (row = null) with a reason.
 *        - player-visible candidate downgraded to staff_only when player-visible
 *          AI is off, or held pending until staff approval when required.
 *   3. The medical/academic guardrails redact narrative fields in place.
 *
 * The returned row's `visibility` is the EFFECTIVE (post-policy) visibility, so
 * a withheld-from-players output can never be persisted at player_only.
 */
export function signalFromInsightWithAudit(
  candidate: BaseballInsightCandidate,
  opts: SignalFromInsightOptions,
): SignalFromInsightAudit {
  const policy = opts.policy ?? DEFAULT_AI_POLICY;
  const desiredVisibility = insightVisibility(candidate.playerVisible) as AiVisibility;

  const baseAudit: Omit<SignalFromInsightAudit, 'row' | 'disposition' | 'reason' | 'effectiveVisibility'> = {
    desiredVisibility,
    guardrailRedacted: false,
    guardrailMedicalHit: false,
    guardrailAcademicHit: false,
    confidence: candidate.confidence,
    hasSourceRefs: (candidate.evidence.source_refs?.length ?? 0) > 0,
  };

  // (1) Promotion threshold — low-priority insights are not triage work. This is
  // NOT a policy withhold (the insight still lives in the engine store); it just
  // does not become a signal. Report it as withheld-by-priority for the caller's
  // bookkeeping, but it is not an AI-governance event.
  if (!PROMOTE_PRIORITIES.has(candidate.priority)) {
    return { ...baseAudit, row: null, disposition: 'withheld', reason: null, effectiveVisibility: 'staff_only' };
  }

  // (2) AI-governance gate.
  const decision = decideAiOutput(policy, {
    confidence: candidate.confidence,
    hasSourceRefs: baseAudit.hasSourceRefs,
    desiredVisibility,
    // A fresh engine generation is never pre-approved; the approval path runs
    // through the AI-audit row + coach review, not the generator.
    approved: false,
  });

  if (!decision.emit) {
    return {
      ...baseAudit,
      row: null,
      disposition: decision.disposition,
      reason: decision.reason,
      effectiveVisibility: decision.visibility,
    };
  }

  const category = generatorToCategory(candidate.generator);
  const recommendation = generatorToRecommendation(candidate.generator);
  const sampleN = candidate.evidence.sample_n;
  const tooSmall =
    Number.isFinite(sampleN) && sampleN < SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD;

  // A sub-threshold sample is never authoritative — it enters as the first-class
  // 'sample_too_small' disposition (still triageable, never shown as confident).
  const disposition: BaseballSignalDisposition = tooSmall
    ? 'sample_too_small'
    : 'new';

  // (3) Content guardrails — redact medical/academic phrases from the narrative.
  const guarded = applyGuardrails(policy, {
    title: candidate.title,
    body: candidate.evidence.diagnosis.root_cause || candidate.body,
    evidence: buildEvidenceLine(candidate),
  });

  const ttlDays = opts.ttlDays ?? 30;
  const expiresAt = new Date(
    Date.parse(opts.nowIso) + ttlDays * 86_400_000,
  ).toISOString();

  const row: BaseballSignalInsert = {
    team_id: opts.teamId,
    player_id: candidate.playerId,
    event_id: null,
    signal_type: candidate.generator,
    category,
    severity: priorityToSeverity(candidate.priority),
    title: guarded.title ?? candidate.title,
    why_it_matters: guarded.body ?? null,
    evidence: guarded.evidence ?? null,
    source_refs: buildSignalSourceRefs(candidate, opts.insightId ?? null),
    confidence: candidate.confidence,
    sample_n: Number.isFinite(sampleN) ? sampleN : null,
    recommended_action_label:
      recommendation.label ?? candidate.evidence.diagnosis.recommended_action ?? null,
    recommended_action_type: recommendation.type,
    recommended_owner_role: categoryToOwnerRole(category),
    disposition,
    // EFFECTIVE visibility from the policy decision — a downgraded output lands at
    // staff_only, never the desired player_only.
    visibility: decision.visibility as BaseballSignalVisibility,
    generated_by: candidate.generator,
    source_kind: 'ai',
    dedupe_key: opts.dedupeKey,
    expires_at: expiresAt,
    created_by: opts.createdByUserId,
  };

  return {
    ...baseAudit,
    row,
    disposition: decision.disposition,
    reason: decision.reason,
    effectiveVisibility: decision.visibility,
    guardrailRedacted: guarded.redacted,
    guardrailMedicalHit: guarded.medicalHit,
    guardrailAcademicHit: guarded.academicHit,
  };
}

/**
 * Map a batch of ranked candidates to signal inserts, dropping below-threshold
 * ones. `dedupeKeyFor`/`insightIdFor` let the caller reuse the EXACT key + row
 * id it used for the paired insight upsert.
 */
export function signalsFromInsights(
  candidates: BaseballInsightCandidate[],
  base: Omit<SignalFromInsightOptions, 'dedupeKey' | 'insightId'>,
  dedupeKeyFor: (c: BaseballInsightCandidate) => string,
  insightIdFor?: (c: BaseballInsightCandidate) => string | null,
): BaseballSignalInsert[] {
  const out: BaseballSignalInsert[] = [];
  for (const c of candidates) {
    const row = signalFromInsight(c, {
      ...base,
      dedupeKey: dedupeKeyFor(c),
      insightId: insightIdFor ? insightIdFor(c) : null,
    });
    if (row) out.push(row);
  }
  return out;
}
