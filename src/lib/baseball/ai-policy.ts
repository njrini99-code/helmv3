// =============================================================================
// src/lib/baseball/ai-policy.ts
//
// Wave 4 / packet: qa-screens (AI-settings enforcement remediation)
//
// PURE (no I/O, no `server-only`) AI-governance policy. This is the isomorphic
// decision boundary that ai-policy-server.ts (the server-side I/O wrapper) builds
// on, and the one the unit/integration tests exercise — so the toggle->behavior
// contract is verified deterministically without a DB and without pulling
// `server-only`. It is the AI-section mirror of player-access-policy.ts.
//
// PROBLEM THIS SOLVES
//   The Settings OS persists a full AI-governance block on
//   baseball_program_settings (ai_enabled, ai_staff_enabled,
//   ai_player_visible_enabled, ai_require_staff_approval, ai_require_source_refs,
//   ai_confidence_threshold, ai_stale_after_days, ai_medical_guardrail,
//   ai_academic_privacy_guardrail) and the client edits them — but NOTHING in
//   the CoachHelm/signals engine ever read them. Flipping "AI enabled" OFF still
//   let signals/briefs generate; the confidence threshold filtered nothing; the
//   medical/academic guardrails were decorative. That is the V11 acceptance
//   failure "every visible feature has server-side capability enforcement" for
//   the entire AI section, and the v4 fail condition "player-visible AI can leak
//   staff-only notes" with no machine-enforced backstop.
//
//   This module makes the AI toggles LOAD-BEARING. The engine resolves the
//   policy once per run (ai-policy-server.readAiPolicy) and routes every
//   generated output through these pure decisions BEFORE it is persisted/emitted.
//
// FAIL-CLOSED: a missing/undefined column resolves to the program-type default
// (computed HERE, not read from the DB), and the default posture is the SAFE one
// (player-visible AI off, staff approval required, source refs required, both
// guardrails on). An un-configured team therefore gets the intended guarded
// posture — never an accidental open door.
//
// PURE: safe on server + in unit tests. No Supabase, no side effects.
// =============================================================================

import type { BaseballProgramType } from '@/lib/types/baseball-settings';

// -----------------------------------------------------------------------------
// Policy shape
// -----------------------------------------------------------------------------

/**
 * The fully-resolved AI-governance policy for a team. Every field is present
 * (no undefined) so engine call-sites never have to re-derive defaults. Mirrors
 * the ai_* columns on baseball_program_settings 1:1.
 */
export interface AiPolicy {
  /** Master switch. When false, NO AI generation runs at all. */
  enabled: boolean;
  /** Staff-facing AI (briefs/signals/insights). When false, staff AI suppressed. */
  staffEnabled: boolean;
  /** Player-visible AI surfaces. When false, no AI is ever shown to a player. */
  playerVisibleEnabled: boolean;
  /** Player-visible AI requires an approved audit disposition before render. */
  requireStaffApproval: boolean;
  /** Block emit of any AI output lacking source_refs. */
  requireSourceRefs: boolean;
  /** Withhold AI output whose confidence is below this [0,1] floor. */
  confidenceThreshold: number;
  /** AI output older than this many days is marked stale (not authoritative). */
  staleAfterDays: number;
  /** Filter medical/injury claims out of generated output. */
  medicalGuardrail: boolean;
  /** Filter academic/eligibility/grade detail out of generated output. */
  academicPrivacyGuardrail: boolean;
}

/** The settings column each policy field reads (parity with ACCESS_KEY_TO_COLUMN). */
export const AI_POLICY_COLUMNS = {
  enabled: 'ai_enabled',
  staffEnabled: 'ai_staff_enabled',
  playerVisibleEnabled: 'ai_player_visible_enabled',
  requireStaffApproval: 'ai_require_staff_approval',
  requireSourceRefs: 'ai_require_source_refs',
  confidenceThreshold: 'ai_confidence_threshold',
  staleAfterDays: 'ai_stale_after_days',
  medicalGuardrail: 'ai_medical_guardrail',
  academicPrivacyGuardrail: 'ai_academic_privacy_guardrail',
} as const satisfies Record<keyof AiPolicy, string>;

/** The exact ai_* column list to SELECT (single source of truth for the read). */
export const AI_POLICY_COLUMN_LIST = Object.values(AI_POLICY_COLUMNS);

// -----------------------------------------------------------------------------
// Defaults (fail-closed, program-type aware)
//
// The Settings-OS variant defaults only set a SUBSET of the AI fields
// (ai_player_visible_enabled + ai_require_staff_approval). The rest of the AI
// block lives ONLY in mapSettingsRow's b()/n() fallbacks, so a default-fallback
// caller would otherwise read undefined for ai_enabled/ai_require_source_refs/etc.
// We therefore define the COMPLETE safe AI default here. Numbers mirror
// mapSettingsRow's defaults (confidence 0.6, stale 14d).
// -----------------------------------------------------------------------------

/**
 * The safe baseline AI posture. Used as the fail-closed fallback for every team
 * and per-field when a column is missing. SAFE means: AI is allowed to run for
 * staff (the product is AI-first for coaches), player-visible AI is OFF, staff
 * approval is required before any player-visible AI, source refs are required,
 * and both content guardrails are ON.
 */
export const DEFAULT_AI_POLICY: AiPolicy = {
  enabled: true,
  staffEnabled: true,
  playerVisibleEnabled: false,
  requireStaffApproval: true,
  requireSourceRefs: true,
  confidenceThreshold: 0.6,
  staleAfterDays: 14,
  medicalGuardrail: true,
  academicPrivacyGuardrail: true,
};

/**
 * Program-type AI defaults. Today every program type shares the safe baseline
 * (the variant overrides for player_visible/require_approval already MATCH the
 * baseline), but this indirection keeps the policy aligned with the per-type
 * settings model and lets a future program type loosen/tighten without touching
 * call-sites. College/JUCO/HS/showcase all default to the guarded posture.
 */
export function defaultAiPolicy(_programType: BaseballProgramType | null | undefined): AiPolicy {
  return { ...DEFAULT_AI_POLICY };
}

// -----------------------------------------------------------------------------
// Row -> policy resolution (fail-closed per field)
// -----------------------------------------------------------------------------

function asBool(v: unknown, fallback: boolean): boolean {
  if (v === true) return true;
  if (v === false) return false;
  return fallback; // null / undefined / non-boolean => fallback (fail-closed).
}

function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Resolve an AiPolicy from a raw settings row (any subset of the ai_* columns),
 * filling each absent/invalid field from the program-type default. This is the
 * single place the column->field mapping lives, so the server read and the tests
 * agree by construction.
 */
export function resolveAiPolicy(
  row: Record<string, unknown> | null | undefined,
  programType: BaseballProgramType | null | undefined,
): AiPolicy {
  const d = defaultAiPolicy(programType);
  const r = row ?? {};
  return {
    enabled: asBool(r[AI_POLICY_COLUMNS.enabled], d.enabled),
    staffEnabled: asBool(r[AI_POLICY_COLUMNS.staffEnabled], d.staffEnabled),
    playerVisibleEnabled: asBool(r[AI_POLICY_COLUMNS.playerVisibleEnabled], d.playerVisibleEnabled),
    requireStaffApproval: asBool(r[AI_POLICY_COLUMNS.requireStaffApproval], d.requireStaffApproval),
    requireSourceRefs: asBool(r[AI_POLICY_COLUMNS.requireSourceRefs], d.requireSourceRefs),
    // Clamp the threshold into [0,1] so a corrupt value can never disable the gate
    // (a stored 0 still means "no floor"; a stored >1 would suppress everything).
    confidenceThreshold: Math.min(1, Math.max(0, asNum(r[AI_POLICY_COLUMNS.confidenceThreshold], d.confidenceThreshold))),
    // A non-positive stale window would mark everything stale immediately; clamp
    // to >= 1 day so the setting is always a sane positive horizon.
    staleAfterDays: Math.max(1, Math.round(asNum(r[AI_POLICY_COLUMNS.staleAfterDays], d.staleAfterDays))),
    medicalGuardrail: asBool(r[AI_POLICY_COLUMNS.medicalGuardrail], d.medicalGuardrail),
    academicPrivacyGuardrail: asBool(
      r[AI_POLICY_COLUMNS.academicPrivacyGuardrail],
      d.academicPrivacyGuardrail,
    ),
  };
}

// -----------------------------------------------------------------------------
// Decisions — the toggle->behavior contract the engine consults
// -----------------------------------------------------------------------------

/** Visibility ladder values an AI output can carry (mirror of signal visibility). */
export type AiVisibility = 'team' | 'player_only' | 'staff_only';

/** Whether an AI visibility value reaches a player (team or player_only). */
export function isPlayerFacing(visibility: AiVisibility): boolean {
  return visibility === 'team' || visibility === 'player_only';
}

/**
 * Master gate: may the engine generate ANY AI output for this team?
 * False short-circuits the entire run (no insights, no signals, no briefs).
 */
export function decideAiGenerationAllowed(policy: AiPolicy): boolean {
  return policy.enabled;
}

/**
 * May staff-facing AI (staff_only briefs/signals/insights) be produced?
 * Requires the master switch AND the staff switch.
 */
export function decideStaffAiAllowed(policy: AiPolicy): boolean {
  return policy.enabled && policy.staffEnabled;
}

/** The reason an AI output is withheld (drives the audit `disposition` + log). */
export type AiWithholdReason =
  | 'ai_disabled'
  | 'staff_ai_disabled'
  | 'player_visible_disabled'
  | 'below_confidence'
  | 'missing_source_refs'
  | 'awaiting_approval';

/**
 * Decide the final disposition + render-visibility of ONE candidate AI output,
 * given the policy. This is the single chokepoint the mapper calls per candidate.
 *
 * Inputs describe the candidate AS THE GENERATOR PRODUCED IT:
 *   - confidence: normalized [0,1] (or null when non-numeric).
 *   - hasSourceRefs: does it carry at least one source ref?
 *   - desiredVisibility: the visibility the candidate WANTS (player_only/team/
 *     staff_only) before policy is applied.
 *   - approved: is there an approved audit row for this output? (player-visible
 *     + require_staff_approval path). The engine cannot know this on a FRESH
 *     generation, so a fresh player-visible candidate under require_approval is
 *     DOWNGRADED to staff_only (pending) rather than dropped — it still informs
 *     staff and becomes player-visible only once a coach approves it.
 *
 * Output:
 *   - emit: should this output be persisted/emitted at all?
 *   - visibility: the EFFECTIVE visibility after policy (may be downgraded to
 *     staff_only when player-visible is gated).
 *   - disposition: 'approved' | 'pending' | 'withheld' (the audit disposition).
 *   - reason: when emit=false OR visibility was downgraded, why.
 */
export interface AiOutputDecisionInput {
  confidence: number | null;
  hasSourceRefs: boolean;
  desiredVisibility: AiVisibility;
  approved?: boolean;
}

export interface AiOutputDecision {
  emit: boolean;
  visibility: AiVisibility;
  disposition: 'approved' | 'pending' | 'withheld';
  reason: AiWithholdReason | null;
}

export function decideAiOutput(
  policy: AiPolicy,
  input: AiOutputDecisionInput,
): AiOutputDecision {
  // (1) Master switch.
  if (!policy.enabled) {
    return { emit: false, visibility: 'staff_only', disposition: 'withheld', reason: 'ai_disabled' };
  }

  const wantsPlayerFacing = isPlayerFacing(input.desiredVisibility);

  // (2) Staff AI suppression: when staff AI is off AND the output is staff-only,
  // there is no audience left for it — withhold. (A player-facing output is
  // governed by the player switch below, not the staff switch.)
  if (!policy.staffEnabled && !wantsPlayerFacing) {
    return {
      emit: false,
      visibility: 'staff_only',
      disposition: 'withheld',
      reason: 'staff_ai_disabled',
    };
  }

  // (3) Confidence floor — applies to EVERY output. A null/sub-threshold
  // confidence is withheld (never shown as authoritative).
  if (input.confidence == null || input.confidence < policy.confidenceThreshold) {
    return {
      emit: false,
      visibility: 'staff_only',
      disposition: 'withheld',
      reason: 'below_confidence',
    };
  }

  // (4) Source-ref requirement — no AI output without provenance.
  if (policy.requireSourceRefs && !input.hasSourceRefs) {
    return {
      emit: false,
      visibility: 'staff_only',
      disposition: 'withheld',
      reason: 'missing_source_refs',
    };
  }

  // (5) Player-visibility gate. A candidate that wants to reach a player must
  // pass the player-visible switch, and (when required) staff approval.
  if (wantsPlayerFacing) {
    if (!policy.playerVisibleEnabled) {
      // Player-visible AI is off entirely. The output still has staff value, so
      // we DOWNGRADE to staff_only rather than drop it.
      return {
        emit: true,
        visibility: 'staff_only',
        disposition: 'pending',
        reason: 'player_visible_disabled',
      };
    }
    if (policy.requireStaffApproval && !input.approved) {
      // Player-visible is allowed, but this fresh output has not been approved by
      // a coach yet. Hold it at staff_only (pending) until a coach approves the
      // audit row — this is the machine-enforced backstop against player-visible
      // AI leaking before review.
      return {
        emit: true,
        visibility: 'staff_only',
        disposition: 'pending',
        reason: 'awaiting_approval',
      };
    }
  }

  // (6) Clean pass — emit at the desired visibility, approved disposition.
  return {
    emit: true,
    visibility: input.desiredVisibility,
    disposition: 'approved',
    reason: null,
  };
}

// -----------------------------------------------------------------------------
// Staleness
// -----------------------------------------------------------------------------

/**
 * Is an AI output generated at `generatedAtIso` STALE relative to `nowIso` under
 * the team's stale window? Stale output is not authoritative (the read model
 * shows it muted / "needs refresh") but is not deleted.
 */
export function isAiOutputStale(
  policy: AiPolicy,
  generatedAtIso: string | null | undefined,
  nowIso: string,
): boolean {
  if (!generatedAtIso) return false;
  const gen = Date.parse(generatedAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(gen) || !Number.isFinite(now)) return false;
  const ageDays = (now - gen) / 86_400_000;
  return ageDays > policy.staleAfterDays;
}

// -----------------------------------------------------------------------------
// Content guardrails — medical + academic-privacy
//
// The guardrails are CONTENT filters: when on, generated narrative must not carry
// medical/injury claims (medical guardrail) or academic/eligibility/grade detail
// (academic-privacy guardrail). These are PHRASE-level redactions applied to the
// human-readable strings of an AI output (title / body / why_it_matters /
// evidence). They are intentionally conservative: a hit REDACTS the offending
// string to a neutral placeholder rather than silently shipping the claim. The
// caller decides whether a fully-redacted output is still worth emitting.
// -----------------------------------------------------------------------------

/** Medical/injury terms the medical guardrail must not let through. */
const MEDICAL_TERMS: readonly RegExp[] = [
  /\binjur(?:y|ies|ed)\b/i,
  /\bconcussion\b/i,
  /\bsurgery\b/i,
  /\brehab(?:ilitation)?\b/i,
  /\bdiagnos(?:is|ed|e)\b/i,
  /\bmedical\b/i,
  /\bdoctor\b/i,
  /\bsymptom\b/i,
  /\bpain\b/i,
  /\bUCL\b/, // elbow ligament — common pitching medical reference
  /\bTommy John\b/i,
  /\bACL\b/,
  /\bstrain(?:ed)?\b/i,
  /\bsprain(?:ed)?\b/i,
  /\bfractur(?:e|ed)\b/i,
  /\bmedication\b/i,
  /\bprescri(?:be|ption)\b/i,
];

/** Academic/eligibility/grade terms the academic-privacy guardrail blocks. */
const ACADEMIC_TERMS: readonly RegExp[] = [
  /\bGPA\b/i,
  /\bgrade(?:s)?\b/i,
  /\btranscript\b/i,
  /\beligibilit(?:y|ies)\b/i,
  /\bineligible\b/i,
  /\bacademic(?:ally)?\b/i,
  /\bfailing\b/i,
  /\bclass rank\b/i,
  /\bSAT\b/,
  /\bACT score\b/i,
  /\bcourse(?:work)?\b/i,
  /\bprofessor\b/i,
];

/** A neutral placeholder substituted for a redacted phrase. */
export const GUARDRAIL_REDACTION = '[redacted]';

interface GuardrailScanResult {
  /** The text after redaction (unchanged when nothing matched). */
  text: string | null;
  /** Whether the medical guardrail redacted anything. */
  medicalHit: boolean;
  /** Whether the academic guardrail redacted anything. */
  academicHit: boolean;
}

function scanOne(text: string, terms: readonly RegExp[]): { out: string; hit: boolean } {
  let out = text;
  let hit = false;
  for (const re of terms) {
    if (re.test(out)) {
      hit = true;
      out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), GUARDRAIL_REDACTION);
    }
  }
  return { out, hit };
}

/**
 * Apply the active content guardrails to ONE human-readable string. Returns the
 * (possibly redacted) text plus which guardrails fired. A null/empty input
 * passes through untouched.
 */
export function applyGuardrailsToText(
  policy: AiPolicy,
  text: string | null | undefined,
): GuardrailScanResult {
  if (!text) return { text: text ?? null, medicalHit: false, academicHit: false };
  let out = text;
  let medicalHit = false;
  let academicHit = false;
  if (policy.medicalGuardrail) {
    const r = scanOne(out, MEDICAL_TERMS);
    out = r.out;
    medicalHit = r.hit;
  }
  if (policy.academicPrivacyGuardrail) {
    const r = scanOne(out, ACADEMIC_TERMS);
    out = r.out;
    academicHit = r.hit;
  }
  return { text: out, medicalHit, academicHit };
}

/** The text fields of an AI output the guardrails scrub. */
export interface AiGuardrailFields {
  title?: string | null;
  body?: string | null;
  whyItMatters?: string | null;
  evidence?: string | null;
}

export interface AiGuardrailResult extends AiGuardrailFields {
  /** True when ANY guardrail redacted ANY field. */
  redacted: boolean;
  medicalHit: boolean;
  academicHit: boolean;
}

/**
 * Apply the content guardrails across all human-readable fields of an AI output.
 * The structured numeric evidence (source_refs / drivers) is NOT touched — only
 * the narrative strings a coach/player would read. The caller decides what to do
 * with a redacted output (we keep emitting it: a guarded, redacted insight is
 * safer than a dropped one, and the audit row records that a guardrail fired).
 */
export function applyGuardrails(
  policy: AiPolicy,
  fields: AiGuardrailFields,
): AiGuardrailResult {
  const t = applyGuardrailsToText(policy, fields.title);
  const b = applyGuardrailsToText(policy, fields.body);
  const w = applyGuardrailsToText(policy, fields.whyItMatters);
  const e = applyGuardrailsToText(policy, fields.evidence);
  return {
    title: t.text,
    body: b.text,
    whyItMatters: w.text,
    evidence: e.text,
    medicalHit: t.medicalHit || b.medicalHit || w.medicalHit || e.medicalHit,
    academicHit: t.academicHit || b.academicHit || w.academicHit || e.academicHit,
    redacted:
      t.medicalHit || b.medicalHit || w.medicalHit || e.medicalHit ||
      t.academicHit || b.academicHit || w.academicHit || e.academicHit,
  };
}
