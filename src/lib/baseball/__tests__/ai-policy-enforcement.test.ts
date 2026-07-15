// =============================================================================
// Regression test for the "AI settings are entirely write-only — the engine never
// reads a single ai_* gate" critical finding (qa-screens completeness audit).
//
// THE BUG: the Settings-OS AI block (ai_enabled, ai_staff_enabled,
// ai_player_visible_enabled, ai_require_staff_approval, ai_require_source_refs,
// ai_confidence_threshold, ai_stale_after_days, ai_medical_guardrail,
// ai_academic_privacy_guardrail) was write-only configuration. NOTHING read it,
// so flipping "AI enabled" OFF still let signals generate, the confidence
// threshold filtered nothing, and the guardrails were decorative. That is the
// V11 "every visible feature has server-side capability enforcement" failure for
// the whole AI section, and the v4 fail condition "player-visible AI can leak
// staff-only notes" with no machine-enforced backstop.
//
// THE FIX: src/lib/baseball/ai-policy.ts makes the AI toggles load-bearing via a
// pure decision (decideAiOutput / guardrails / staleness) wired into the engine
// (coachhelm.ts) through the mapper (signalFromInsightWithAudit).
//
// These tests lock the toggle->behavior contract at the pure decision boundary
// AND through the real mapper, so each AI toggle PROVABLY changes the engine's
// output — the same style as player-access-enforcement.test.ts.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AI_POLICY,
  resolveAiPolicy,
  decideAiGenerationAllowed,
  decideStaffAiAllowed,
  decideAiOutput,
  isAiOutputStale,
  applyGuardrails,
  AI_POLICY_COLUMNS,
  type AiPolicy,
} from '../ai-policy';
import { signalFromInsightWithAudit } from '../signal-from-insight';
import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function policy(overrides: Partial<AiPolicy> = {}): AiPolicy {
  return { ...DEFAULT_AI_POLICY, ...overrides };
}

/** A clean, source-backed candidate above the default confidence floor. */
function candidate(overrides: Partial<BaseballInsightCandidate> = {}): BaseballInsightCandidate {
  return {
    generator: 'two_strike_chase',
    playerId: 'player-1',
    insightType: 'coachhelm_two_strike_chase',
    title: 'Two-strike chase rate climbing',
    body: 'Chase rate up on two-strike counts.',
    priority: 'high',
    confidence: 0.8,
    playerVisible: false,
    evidence: {
      sample_n: 40,
      target_n: 40,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.8 },
      causality_level: 'observed_sequence',
      diagnosis: {
        symptom: 'High two-strike chase',
        root_cause: 'Expanding the zone with two strikes',
        causality_level: 'observed_sequence',
        drivers: [
          { metric: 'two_strike_chase_pct', value: 34, unit: 'percent', sample_n: 40, source: 'box score' },
        ],
        recommended_action: 'Add a two-strike approach block',
        confidence_reason: 'Adequate sample, low variance',
      },
      source_refs: [
        // #379: fixture mirrors production — loaders cite the canonical table.
        { table: 'baseball_box_score_batting', column: 'two_strike_chase_pct', sample_n: 40, visibility: 'staff_only' },
      ],
    },
    ...overrides,
  };
}

const NOW = '2026-06-24T12:00:00.000Z';
const baseOpts = { teamId: 'team-1', createdByUserId: 'user-1', dedupeKey: 'two_strike_chase:player-1', nowIso: NOW };

// =============================================================================
// resolveAiPolicy — fail-closed per field
// =============================================================================
describe('ai-policy: resolveAiPolicy is fail-closed and column-exact', () => {
  it('an empty row resolves to the safe default posture', () => {
    expect(resolveAiPolicy({}, 'college')).toEqual(DEFAULT_AI_POLICY);
  });

  it('a null row resolves to the safe default posture', () => {
    expect(resolveAiPolicy(null, 'college')).toEqual(DEFAULT_AI_POLICY);
  });

  it('reads each ai_* column into its policy field', () => {
    const row = {
      [AI_POLICY_COLUMNS.enabled]: false,
      [AI_POLICY_COLUMNS.staffEnabled]: false,
      [AI_POLICY_COLUMNS.playerVisibleEnabled]: true,
      [AI_POLICY_COLUMNS.requireStaffApproval]: false,
      [AI_POLICY_COLUMNS.requireSourceRefs]: false,
      [AI_POLICY_COLUMNS.confidenceThreshold]: 0.9,
      [AI_POLICY_COLUMNS.staleAfterDays]: 7,
      [AI_POLICY_COLUMNS.medicalGuardrail]: false,
      [AI_POLICY_COLUMNS.academicPrivacyGuardrail]: false,
    };
    expect(resolveAiPolicy(row, 'college')).toEqual({
      enabled: false,
      staffEnabled: false,
      playerVisibleEnabled: true,
      requireStaffApproval: false,
      requireSourceRefs: false,
      confidenceThreshold: 0.9,
      staleAfterDays: 7,
      medicalGuardrail: false,
      academicPrivacyGuardrail: false,
    });
  });

  it('clamps a corrupt confidence threshold into [0,1] and a non-positive stale window to >= 1', () => {
    const p = resolveAiPolicy(
      { [AI_POLICY_COLUMNS.confidenceThreshold]: 5, [AI_POLICY_COLUMNS.staleAfterDays]: 0 },
      'college',
    );
    expect(p.confidenceThreshold).toBe(1);
    expect(p.staleAfterDays).toBe(1);
  });
});

// =============================================================================
// Master + staff switches
// =============================================================================
describe('ai-policy: master + staff switches', () => {
  it('ai_enabled OFF blocks ALL generation', () => {
    expect(decideAiGenerationAllowed(policy({ enabled: false }))).toBe(false);
    expect(decideAiGenerationAllowed(policy({ enabled: true }))).toBe(true);
  });

  it('staff AI requires BOTH master and staff switches', () => {
    expect(decideStaffAiAllowed(policy({ enabled: true, staffEnabled: true }))).toBe(true);
    expect(decideStaffAiAllowed(policy({ enabled: true, staffEnabled: false }))).toBe(false);
    expect(decideStaffAiAllowed(policy({ enabled: false, staffEnabled: true }))).toBe(false);
  });
});

// =============================================================================
// decideAiOutput — the per-output gate
// =============================================================================
describe('ai-policy: decideAiOutput enforces each gate', () => {
  const clean = { confidence: 0.8, hasSourceRefs: true, desiredVisibility: 'staff_only' as const };

  it('master off => withheld(ai_disabled)', () => {
    const d = decideAiOutput(policy({ enabled: false }), clean);
    expect(d.emit).toBe(false);
    expect(d.reason).toBe('ai_disabled');
  });

  it('staff off + staff-only output => withheld(staff_ai_disabled)', () => {
    const d = decideAiOutput(policy({ staffEnabled: false }), clean);
    expect(d.emit).toBe(false);
    expect(d.reason).toBe('staff_ai_disabled');
  });

  it('below confidence threshold => withheld(below_confidence)', () => {
    const d = decideAiOutput(policy({ confidenceThreshold: 0.9 }), clean);
    expect(d.emit).toBe(false);
    expect(d.reason).toBe('below_confidence');
  });

  it('null confidence => withheld(below_confidence)', () => {
    const d = decideAiOutput(policy(), { ...clean, confidence: null });
    expect(d.emit).toBe(false);
    expect(d.reason).toBe('below_confidence');
  });

  it('require source refs + none => withheld(missing_source_refs)', () => {
    const d = decideAiOutput(policy({ requireSourceRefs: true }), { ...clean, hasSourceRefs: false });
    expect(d.emit).toBe(false);
    expect(d.reason).toBe('missing_source_refs');
  });

  it('source refs NOT required => a source-less output passes', () => {
    const d = decideAiOutput(policy({ requireSourceRefs: false }), { ...clean, hasSourceRefs: false });
    expect(d.emit).toBe(true);
  });

  it('player-visible candidate with player-visible AI OFF => downgraded to staff_only (pending)', () => {
    const d = decideAiOutput(policy({ playerVisibleEnabled: false }), {
      ...clean,
      desiredVisibility: 'player_only',
    });
    expect(d.emit).toBe(true);
    expect(d.visibility).toBe('staff_only');
    expect(d.disposition).toBe('pending');
    expect(d.reason).toBe('player_visible_disabled');
  });

  it('player-visible AI ON + approval required + not approved => held staff_only (awaiting_approval)', () => {
    const d = decideAiOutput(policy({ playerVisibleEnabled: true, requireStaffApproval: true }), {
      ...clean,
      desiredVisibility: 'player_only',
      approved: false,
    });
    expect(d.emit).toBe(true);
    expect(d.visibility).toBe('staff_only');
    expect(d.disposition).toBe('pending');
    expect(d.reason).toBe('awaiting_approval');
  });

  it('player-visible AI ON + approval required + APPROVED => emits player_only (approved)', () => {
    const d = decideAiOutput(policy({ playerVisibleEnabled: true, requireStaffApproval: true }), {
      ...clean,
      desiredVisibility: 'player_only',
      approved: true,
    });
    expect(d.emit).toBe(true);
    expect(d.visibility).toBe('player_only');
    expect(d.disposition).toBe('approved');
  });

  it('player-visible AI ON + approval NOT required => emits player_only immediately', () => {
    const d = decideAiOutput(policy({ playerVisibleEnabled: true, requireStaffApproval: false }), {
      ...clean,
      desiredVisibility: 'player_only',
    });
    expect(d.emit).toBe(true);
    expect(d.visibility).toBe('player_only');
    expect(d.disposition).toBe('approved');
  });
});

// =============================================================================
// Staleness
// =============================================================================
describe('ai-policy: staleness honors ai_stale_after_days', () => {
  it('within the window is fresh; beyond it is stale', () => {
    const p = policy({ staleAfterDays: 14 });
    const fresh = '2026-06-20T12:00:00.000Z'; // 4d before NOW
    const stale = '2026-06-01T12:00:00.000Z'; // 23d before NOW
    expect(isAiOutputStale(p, fresh, NOW)).toBe(false);
    expect(isAiOutputStale(p, stale, NOW)).toBe(true);
  });

  it('a tighter window flips a previously-fresh output to stale (toggle changes behavior)', () => {
    const tenDaysAgo = '2026-06-14T12:00:00.000Z';
    expect(isAiOutputStale(policy({ staleAfterDays: 14 }), tenDaysAgo, NOW)).toBe(false);
    expect(isAiOutputStale(policy({ staleAfterDays: 7 }), tenDaysAgo, NOW)).toBe(true);
  });
});

// =============================================================================
// Guardrails
// =============================================================================
describe('ai-policy: medical + academic guardrails redact content', () => {
  it('medical guardrail ON redacts injury/medical terms; OFF leaves them', () => {
    const text = 'Likely a shoulder injury after surgery.';
    expect(applyGuardrails(policy({ medicalGuardrail: true }), { body: text }).medicalHit).toBe(true);
    expect(applyGuardrails(policy({ medicalGuardrail: true }), { body: text }).body).not.toContain('injury');
    expect(applyGuardrails(policy({ medicalGuardrail: false }), { body: text }).body).toContain('injury');
  });

  it('academic guardrail ON redacts GPA/eligibility terms; OFF leaves them', () => {
    const text = 'Player GPA risk affects eligibility.';
    const on = applyGuardrails(policy({ academicPrivacyGuardrail: true }), { body: text });
    expect(on.academicHit).toBe(true);
    expect(on.body).not.toContain('GPA');
    const off = applyGuardrails(policy({ academicPrivacyGuardrail: false }), { body: text });
    expect(off.body).toContain('GPA');
  });

  it('clean baseball content is never redacted', () => {
    const r = applyGuardrails(policy(), { body: 'Two-strike chase rate up; add an approach block.' });
    expect(r.redacted).toBe(false);
  });
});

// =============================================================================
// Integration through the REAL mapper — each toggle changes the emitted signal
// =============================================================================
describe('ai-policy: signalFromInsightWithAudit enforces the policy end-to-end', () => {
  it('ai_enabled OFF withholds the signal (row=null, disposition=withheld)', () => {
    const out = signalFromInsightWithAudit(candidate(), { ...baseOpts, policy: policy({ enabled: false }) });
    expect(out.row).toBeNull();
    expect(out.disposition).toBe('withheld');
    expect(out.reason).toBe('ai_disabled');
  });

  it('ai_staff_enabled OFF withholds a staff-only signal', () => {
    const out = signalFromInsightWithAudit(candidate({ playerVisible: false }), {
      ...baseOpts,
      policy: policy({ staffEnabled: false }),
    });
    expect(out.row).toBeNull();
    expect(out.reason).toBe('staff_ai_disabled');
  });

  it('confidence below ai_confidence_threshold withholds the signal', () => {
    const out = signalFromInsightWithAudit(candidate({ confidence: 0.5 }), {
      ...baseOpts,
      policy: policy({ confidenceThreshold: 0.6 }),
    });
    expect(out.row).toBeNull();
    expect(out.reason).toBe('below_confidence');
  });

  it('ai_require_source_refs ON withholds a signal whose candidate carries no source refs', () => {
    const c = candidate();
    c.evidence.source_refs = [];
    const out = signalFromInsightWithAudit(c, { ...baseOpts, policy: policy({ requireSourceRefs: true }) });
    expect(out.row).toBeNull();
    expect(out.reason).toBe('missing_source_refs');
  });

  it('a player-visible candidate is downgraded to staff_only when player-visible AI is OFF', () => {
    const out = signalFromInsightWithAudit(candidate({ playerVisible: true }), {
      ...baseOpts,
      policy: policy({ playerVisibleEnabled: false }),
    });
    expect(out.row).not.toBeNull();
    expect(out.row?.visibility).toBe('staff_only');
    expect(out.disposition).toBe('pending');
    expect(out.reason).toBe('player_visible_disabled');
  });

  it('a player-visible candidate is held staff_only (pending) when approval is required', () => {
    const out = signalFromInsightWithAudit(candidate({ playerVisible: true }), {
      ...baseOpts,
      policy: policy({ playerVisibleEnabled: true, requireStaffApproval: true }),
    });
    expect(out.row?.visibility).toBe('staff_only');
    expect(out.disposition).toBe('pending');
    expect(out.reason).toBe('awaiting_approval');
  });

  it('a player-visible candidate emits player_only when allowed and approval not required', () => {
    const out = signalFromInsightWithAudit(candidate({ playerVisible: true }), {
      ...baseOpts,
      policy: policy({ playerVisibleEnabled: true, requireStaffApproval: false }),
    });
    expect(out.row?.visibility).toBe('player_only');
    expect(out.disposition).toBe('approved');
  });

  it('the medical guardrail redacts the emitted signal narrative', () => {
    const c = candidate();
    c.evidence.diagnosis.root_cause = 'Possible elbow injury from overuse.';
    const out = signalFromInsightWithAudit(c, { ...baseOpts, policy: policy({ medicalGuardrail: true }) });
    expect(out.guardrailMedicalHit).toBe(true);
    expect(out.row?.why_it_matters).not.toContain('injury');
  });

  it('the DEFAULT (no policy passed) is the SAFE posture — a player-visible candidate never emits player_only', () => {
    // A caller that forgets to pass a policy still gets the guarded behavior.
    const out = signalFromInsightWithAudit(candidate({ playerVisible: true }), baseOpts);
    expect(out.row?.visibility).toBe('staff_only');
  });

  it('a clean, high-confidence, staff-only candidate emits unchanged under default policy', () => {
    const out = signalFromInsightWithAudit(candidate(), { ...baseOpts, policy: policy() });
    expect(out.row).not.toBeNull();
    expect(out.row?.visibility).toBe('staff_only');
    expect(out.disposition).toBe('approved');
    expect(out.reason).toBeNull();
  });
});
