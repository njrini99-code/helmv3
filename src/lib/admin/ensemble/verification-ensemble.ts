/**
 * Verification Ensemble — REPRODUCER → HEALER → {ADVERSARY, SECURITY,
 * PRODUCT} → JUDGE, as prompt roles over the existing Anthropic path.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §6 J.4.2;
 * `memory/decisions/ADR-2026-09-03-control-plane-owner-decisions.md`
 * (`VERIFICATION_ENSEMBLE_MODEL_COST` = "No cost"): "Build the REPRODUCER →
 * HEALER → {ADVERSARY, SECURITY, PRODUCT} → JUDGE skeleton with roles as
 * prompts over the existing Anthropic path, default OFF; it runs only when
 * explicitly invoked and inside the existing Diagnose budget." No second
 * model provider, no recurring cost.
 *
 * ROLE MAPPING — REPRODUCER and HEALER are NOT new calls here:
 *
 *   REPRODUCER  the caller's already-assembled `RcaSourceContext`
 *               (incident report, stacks, classification) — the same
 *               evidence Diagnose already gathers today.
 *   HEALER      the caller's already-produced `RcaAnalysis` — i.e.
 *               `runRcaAnalysis` (`@/lib/admin/rca`), run exactly once, by
 *               Diagnose, as it already is. This module never calls it
 *               again — calling it a second time would double the exact
 *               cost the owner decision forbids.
 *   ADVERSARY   NEW: critiques the HEALER's analysis against the same
 *               evidence — "find what is wrong with this analysis."
 *   SECURITY    NEW, CONDITIONAL: only when the analysis touches an auth/
 *               RLS/tenancy-adjacent surface (`touchesAuthOrRlsSurface`
 *               below) — never skippable by instruction for a finding that
 *               DOES touch one; the condition is a code branch, not a
 *               prompt request the model could decline.
 *   PRODUCT     NEW: reviews the analysis for user-facing impact/regression
 *               risk the ADVERSARY role is not scoped to catch.
 *   JUDGE       NEW: synthesizes every role's verdict into ACCEPT/REJECT
 *               with reasons. Its schema carries NO `suggestedFix` field —
 *               it is structurally unable to propose a fix, matching the
 *               spec's "never emits a suggestedFix itself, only a verdict
 *               on the HEALER's."
 *
 * DEFAULT OFF, PROVABLY INERT WHEN OFF. `runVerificationEnsemble` checks
 * `isFlagEnabled('verification_ensemble')` FIRST and returns
 * `status: 'disabled'` with ZERO calls to `generateObject` when the flag is
 * off — see `__tests__/verification-ensemble.test.ts` for the assertion
 * that proves it (a spy on `generateObject` that must never fire).
 *
 * THE STRUCTURAL SUGGESTEDFIX GATE. §J.5's golden case: "the ensemble must
 * catch a suggestedFix that doesn't match `RCA_CANONICAL_PREFIX` before it
 * reaches Repair." That guarantee is CODE-ENFORCED here, not model-
 * dependent: `finalVerdict` is `'REJECT'` whenever `deriveRcaCategory`
 * resolves the HEALER's `suggestedFix` to `'uncategorized'` — the exact
 * free-prose failure mode `rca-category.ts`'s own header documents (10 of
 * 15 production analyses, 2026-08-27) — REGARDLESS of what the JUDGE role's
 * model call returns. A JUDGE call that could be prompted into rubber-
 * stamping a malformed `suggestedFix` would defeat the entire point (J.7);
 * this structural override is what keeps that impossible rather than
 * merely instructed against.
 */

import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveModelProvider } from '@/lib/ai/model-provider';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { recordAi } from '@/lib/observability/metrics';
import { classifyProviderFault } from '@/lib/admin/provider-fault';
import { describeError } from '@/lib/utils/describe-error';
import { deriveRcaCategory } from '@/lib/admin/rca-category';
import { buildRcaContextText, type RcaAnalysis, type RcaSourceContext } from '@/lib/admin/rca';

const ENSEMBLE_FLAG = 'verification_ensemble';

/** Same model resolution path Diagnose already uses — this module invents
 *  no new provider or account. */
const ENSEMBLE_MODEL = process.env.RCA_MODEL?.trim() || 'anthropic/claude-sonnet-5';

export type EnsembleRoleName = 'adversary' | 'security' | 'product';
export type RoleVerdict = 'ACCEPT' | 'REJECT';

export interface EnsembleRoleResult {
  role: EnsembleRoleName;
  status: 'ok' | 'skipped' | 'error';
  verdict: RoleVerdict | null;
  findings: readonly string[];
  /** Set only for `status: 'skipped'` (SECURITY, when the finding does not
   *  touch an auth/RLS/tenancy surface) or `'error'`. */
  detail?: string;
}

export interface StructuralCheckResult {
  ok: boolean;
  detail: string;
}

export interface EnsembleResult {
  status: 'disabled' | 'unconfigured' | 'ok' | 'error';
  roles: readonly EnsembleRoleResult[];
  judgeVerdict: RoleVerdict | null;
  judgeReasons: readonly string[];
  structuralCheck: StructuralCheckResult;
  /** `judgeVerdict === 'ACCEPT' && structuralCheck.ok` — never the model's
   *  verdict alone. `null` when the ensemble did not run at all
   *  (`status !== 'ok'`). */
  finalVerdict: RoleVerdict | null;
  message?: string;
}

const AUTH_RLS_TENANCY_PATTERN =
  /\bauth\b|\brls\b|row.?level.?security|\bpolicy\b|\btenant\b|\bmembership\b|requireSuperAdmin|requireAuth|getUser\(\)/i;

/**
 * Whether the HEALER's analysis touches an auth/RLS/tenancy surface, from
 * the same evidence the roles already see (suspect file paths + the
 * analysis's own prose) — mirrors the vocabulary
 * `scripts/release-intel/score-change.ts`'s `AUTH_RLS_PATTERN` uses for the
 * identical judgment call on a diff, applied here to an RCA analysis
 * instead of a diff.
 */
export function touchesAuthOrRlsSurface(analysis: RcaAnalysis): boolean {
  const haystack = [
    analysis.probableCause,
    analysis.suggestedFix,
    ...analysis.suspectFiles.map((f) => `${f.path} ${f.reason}`),
  ].join(' ');
  return AUTH_RLS_TENANCY_PATTERN.test(haystack);
}

/**
 * The structural, code-enforced gate — see the module header. Pure, no
 * model call.
 */
export function checkSuggestedFixContract(analysis: RcaAnalysis): StructuralCheckResult {
  const category = deriveRcaCategory(analysis.suggestedFix);
  if (category === 'uncategorized') {
    return {
      ok: false,
      detail: `suggestedFix does not match any RCA_CANONICAL_PREFIX or recognised legacy pattern — categorized 'uncategorized'. Raw: "${analysis.suggestedFix.slice(0, 120)}"`,
    };
  }
  return { ok: true, detail: `suggestedFix categorized as '${category}'.` };
}

const roleSchema = z.object({
  verdict: z.enum(['ACCEPT', 'REJECT']),
  findings: z
    .array(z.string())
    .describe('Specific, evidence-grounded findings. Empty array only if genuinely nothing to flag.'),
});

const judgeSchema = z.object({
  verdict: z.enum(['ACCEPT', 'REJECT']),
  reasons: z.array(z.string()).describe('Why — synthesizing every role\'s findings. Never a suggested fix.'),
});

const ROLE_PROMPTS: Record<EnsembleRoleName, string> = {
  adversary: `You are the ADVERSARY reviewer in a verification ensemble for a production root-cause analysis (RCA). Find what is wrong with the HEALER's analysis below, grounded only in the evidence provided — do not invent facts. Look for: an unsupported claim, a suspect file/line not actually present in the evidence, a fix that would not address the stated root cause, or a suggestedFix that is free prose rather than one of the four canonical openings (FIX HERE / ALREADY FIXED / NOT A DEFECT / NEEDS MORE EVIDENCE). REJECT if you find a real problem; ACCEPT only if the analysis holds up.`,
  security: `You are the SECURITY reviewer in a verification ensemble. This analysis touches an auth/RLS/tenancy-adjacent surface. Review it for: a fix that could weaken an auth check, an RLS policy, or tenant isolation; a suggested fix that would grant broader access than the original bug required; or a root cause that misdiagnoses an authorization issue as something else. REJECT if you find a security concern; ACCEPT only if the analysis is safe on this axis.`,
  product: `You are the PRODUCT reviewer in a verification ensemble. Review the HEALER's analysis for user-facing impact this codebase's product surfaces would care about: does the suggested fix risk a regression for a DIFFERENT feature than the one being fixed, or a data-loss/data-visibility change no user asked for. REJECT if you find such a risk; ACCEPT only if the analysis is safe on this axis.`,
};

interface RoleCallDeps {
  model: string;
}

async function runRole(
  role: EnsembleRoleName,
  contextText: string,
  healerAnalysis: RcaAnalysis,
  deps: RoleCallDeps,
): Promise<EnsembleRoleResult> {
  const startedAt = Date.now();
  const prompt = `${contextText}\n\n--- HEALER's analysis ---\nProbable cause: ${healerAnalysis.probableCause}\nSuggested fix: ${healerAnalysis.suggestedFix}\nConfidence: ${healerAnalysis.confidence}\nSuspect files: ${healerAnalysis.suspectFiles.map((f) => f.path).join(', ') || 'none'}`;

  try {
    const { object, usage } = await generateObject({
      model: resolveModelProvider(deps.model),
      schema: roleSchema,
      instructions: ROLE_PROMPTS[role],
      prompt,
      experimental_telemetry: { isEnabled: true, functionId: `admin.ensemble.${role}`, recordInputs: false, recordOutputs: false },
    });
    recordAi({
      feature: 'admin_ensemble',
      action: `admin.ensemble.${role}`,
      model: deps.model,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });
    return { role, status: 'ok', verdict: object.verdict, findings: object.findings };
  } catch (error) {
    recordAi({
      feature: 'admin_ensemble',
      action: `admin.ensemble.${role}`,
      model: deps.model,
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: classifyProviderFault(error)?.code,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });
    return { role, status: 'error', verdict: null, findings: [], detail: describeError(error) };
  }
}

async function runJudge(
  contextText: string,
  healerAnalysis: RcaAnalysis,
  roles: readonly EnsembleRoleResult[],
  deps: RoleCallDeps,
): Promise<{ verdict: RoleVerdict | null; reasons: readonly string[] }> {
  const roleSummary = roles
    .map((r) =>
      r.status === 'ok'
        ? `${r.role.toUpperCase()}: ${r.verdict} — ${r.findings.join('; ') || 'no findings'}`
        : `${r.role.toUpperCase()}: ${r.status}${r.detail ? ` (${r.detail})` : ''}`,
    )
    .join('\n');

  const prompt = `${contextText}\n\n--- HEALER's analysis ---\nProbable cause: ${healerAnalysis.probableCause}\nSuggested fix: ${healerAnalysis.suggestedFix}\n\n--- Reviewer findings ---\n${roleSummary}\n\nSynthesize a final verdict. You are NEVER to propose a fix yourself — only judge the HEALER's.`;

  const startedAt = Date.now();
  try {
    const { object, usage } = await generateObject({
      model: resolveModelProvider(deps.model),
      schema: judgeSchema,
      instructions:
        'You are the JUDGE in a verification ensemble. Synthesize the reviewer findings below into a final ACCEPT/REJECT verdict on the HEALER\'s analysis, with reasons. REJECT if any reviewer found a real problem the analysis does not address. You never propose a fix — only a verdict on the one given.',
      prompt,
      experimental_telemetry: { isEnabled: true, functionId: 'admin.ensemble.judge', recordInputs: false, recordOutputs: false },
    });
    recordAi({
      feature: 'admin_ensemble',
      action: 'admin.ensemble.judge',
      model: deps.model,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });
    return { verdict: object.verdict, reasons: object.reasons };
  } catch (error) {
    recordAi({
      feature: 'admin_ensemble',
      action: 'admin.ensemble.judge',
      model: deps.model,
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: classifyProviderFault(error)?.code,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });
    return { verdict: null, reasons: [`JUDGE call failed: ${describeError(error)}`] };
  }
}

/**
 * The one entry point. Checks the flag FIRST — see the module header for
 * the inertness guarantee this ordering exists to prove.
 */
export async function runVerificationEnsemble(
  context: RcaSourceContext,
  healerAnalysis: RcaAnalysis,
): Promise<EnsembleResult> {
  if (!isFlagEnabled(ENSEMBLE_FLAG)) {
    return {
      status: 'disabled',
      roles: [],
      judgeVerdict: null,
      judgeReasons: [],
      structuralCheck: { ok: true, detail: 'Not evaluated — ensemble is disabled.' },
      finalVerdict: null,
      message: `Verification ensemble is disabled ('${ENSEMBLE_FLAG}' flag off) — no model calls were made.`,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return {
      status: 'unconfigured',
      roles: [],
      judgeVerdict: null,
      judgeReasons: [],
      structuralCheck: { ok: true, detail: 'Not evaluated — model unconfigured.' },
      finalVerdict: null,
      message: 'ANTHROPIC_API_KEY is not configured.',
    };
  }

  const contextText = buildRcaContextText(context);
  const deps: RoleCallDeps = { model: ENSEMBLE_MODEL };

  const adversary = await runRole('adversary', contextText, healerAnalysis, deps);

  const securityApplies = touchesAuthOrRlsSurface(healerAnalysis);
  const security: EnsembleRoleResult = securityApplies
    ? await runRole('security', contextText, healerAnalysis, deps)
    : { role: 'security', status: 'skipped', verdict: null, findings: [], detail: 'No auth/RLS/tenancy surface detected.' };

  const product = await runRole('product', contextText, healerAnalysis, deps);

  const roles = [adversary, security, product];
  const { verdict: judgeVerdict, reasons: judgeReasons } = await runJudge(contextText, healerAnalysis, roles, deps);

  const structuralCheck = checkSuggestedFixContract(healerAnalysis);
  const finalVerdict: RoleVerdict | null =
    judgeVerdict === null ? null : judgeVerdict === 'ACCEPT' && structuralCheck.ok ? 'ACCEPT' : 'REJECT';

  return {
    status: 'ok',
    roles,
    judgeVerdict,
    judgeReasons,
    structuralCheck,
    finalVerdict,
  };
}
