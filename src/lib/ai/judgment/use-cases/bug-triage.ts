/**
 * Bug-triage judge (use case `bug_triage`).
 *
 * Sits AFTER `buildTriagePlan` — grouping, fingerprinting and the
 * deterministic classifier stay canonical. For each group in the queue the
 * judge answers whether it is actionable, user-visible, a likely regression,
 * and what to do next, recorded in shadow beside the engine's verdict so the
 * two can be compared before the judgment routes anything.
 */

import 'server-only';
import { choice, noul, score } from '@typesafe-ai/sdk';
import type { TriageGroup } from '@/lib/admin/triage-engine';
import { runJudgment, type RunJudgmentOptions } from '../evaluator';
import type { DeterministicFacts, JudgmentResult, NormalizedAnswers, PolicyOutcome } from '../types';

export const BUG_TRIAGE_EVALUATOR_VERSION = 'bug-triage:v1';
// policy v2 (2026-09-17, first calibration run): thin evidence
// (`requires_more_evidence` ≥ 0.75) now wins over `requires_immediate_rca`
// unless the priority score is critical — a one-line "Load failed" with no
// route or code was being escalated on a 70% "immediate" answer.
export const BUG_TRIAGE_POLICY_VERSION = 'bug-triage-policy:v2';

export const BUG_TRIAGE_FAILURE_DOMAINS = {
  browser_ui: 'A client-side rendering or interaction error',
  client_state: 'Client state or cache drift (stale data, hydration, storage)',
  server_action: 'A Next.js server action or API route failing',
  database_write: 'A Postgres/PostgREST write failing (constraint, RLS, lock, RPC error)',
  database_read: 'A read failing or timing out',
  auth: 'Authentication/session/permission problems',
  background_job: 'A cron, queue or background task failing',
  external_provider: 'An upstream provider (LLM, email, push, Sentry, Vercel) failing or out of credit',
  observability_only: 'Only telemetry/instrumentation is wrong; nothing user-facing failed',
  unknown: 'Cannot tell from the supplied evidence',
} as const;

export const BUG_TRIAGE_QUESTIONS = {
  is_actionable_incident: noul({
    question: 'Does `incident` describe a defect an engineer should act on, rather than routine telemetry, an expected denial, a passed integrity check, or a known reconciliation?',
    actionable: 'an error/warning whose message names a failing operation, code or route where a fix or investigation would change something',
    not_actionable: 'informational events, expected auth denials, successful checks, health samples, or noise that repeats identically without a failing operation',
  }),
  is_likely_user_visible: noul('Would a coach or player have SEEN this failure (a failed save, a blank page, a missing insight, a failed message), rather than it being confined to logs or background work?'),
  is_likely_regression: noul('Given `deployment_proximity` and `fingerprint_is_new`, is this more likely a regression from a recent change than a long-standing condition?'),
  is_duplicate_of_existing_context: noul('Does `existing_analysis` already explain this incident well enough that a new analysis would repeat it?'),
  requires_immediate_rca: noul('Should root-cause analysis start now rather than waiting for more occurrences or evidence?'),
  requires_more_evidence: noul('Is the supplied evidence too thin (no code, no route, a truncated message, a single occurrence) to decide anything without collecting more?'),
  priority: score('How urgent is this incident for the engineering owner?', [
    'Ignore: telemetry noise or an expected condition',
    'Low: worth a look this week; nothing is broken for users',
    'Medium: a real defect with limited or intermittent user impact',
    'High: a user-facing workflow is failing for some users now',
    'Critical: data loss, security, or a core workflow down for everyone',
  ]),
  failure_domain: choice('Which bounded subsystem best explains this incident?', BUG_TRIAGE_FAILURE_DOMAINS),
} as const;

export interface BugTriageEvidence {
  incident: {
    title: string;
    message: string | null;
    route: string | null;
    error_code: string | null;
    severity: string;
    feature: string | null;
    action: string | null;
    source: string | null;
    origins: string[];
    corroborated: boolean;
    occurrences: number;
    first_seen: string;
    last_seen: string;
    span_hours: number;
    unique_routes: number;
  };
  engine_verdict: { verdict: string; reason: string; category: string | null };
  existing_analysis: string | null;
  fingerprint_is_new: boolean | null;
  deployment_proximity: { hours_since_deploy: number | null } | null;
}

export function buildBugTriageEvidence(group: TriageGroup, extra: { fingerprintIsNew?: boolean | null; hoursSinceDeploy?: number | null } = {}): BugTriageEvidence {
  const named = [...group.members].sort((a, b) => b.occurrences - a.occurrences)[0];
  const first = Date.parse(group.firstSeen);
  const last = Date.parse(group.lastSeen);
  return {
    incident: {
      title: group.title.slice(0, 300),
      message: named?.message ? named.message.slice(0, 600) : null,
      route: group.route,
      error_code: group.errorCode,
      severity: group.severity,
      feature: named?.feature ?? null,
      action: named?.action ?? null,
      source: named?.source ?? null,
      origins: group.origins,
      corroborated: group.corroborated,
      occurrences: group.occurrences,
      first_seen: group.firstSeen,
      last_seen: group.lastSeen,
      span_hours: Number.isFinite(first) && Number.isFinite(last) ? Math.round(((last - first) / 3_600_000) * 10) / 10 : 0,
      unique_routes: new Set(group.members.map((m) => m.route).filter(Boolean)).size,
    },
    engine_verdict: { verdict: group.verdict, reason: group.reason.slice(0, 300), category: group.category },
    existing_analysis: group.members.map((m) => m.existingAnalysisFix).find((f): f is string => Boolean(f))?.slice(0, 400) ?? null,
    fingerprint_is_new: extra.fingerprintIsNew ?? null,
    deployment_proximity: extra.hoursSinceDeploy == null ? null : { hours_since_deploy: extra.hoursSinceDeploy },
  };
}

export const BUG_TRIAGE_THRESHOLDS = { actionable: 0.6, immediate: 0.7, moreEvidence: 0.6, thinEvidence: 0.75, priorityHigh: 3, priorityCritical: 3.5 } as const;

/** Never suppresses: a deterministic `critical` severity is P1 and escalates regardless. */
export function applyBugTriagePolicy(answers: NormalizedAnswers, facts: DeterministicFacts): PolicyOutcome {
  const p = (id: string): number => (answers[id]?.kind === 'noul' ? (answers[id] as { p: number }).p : 0);
  const priority = answers.priority?.kind === 'score' ? answers.priority.score : 0;
  const domain = answers.failure_domain?.kind === 'choice' ? answers.failure_domain.choice : 'unknown';
  const codes = [`domain:${domain}`, `priority:${priority.toFixed(1)}`];
  if (facts.hardInvariantFailed) return { disposition: 'escalate', reasonCodes: codes };
  const more = p('requires_more_evidence');
  const thin = more >= BUG_TRIAGE_THRESHOLDS.thinEvidence && priority < BUG_TRIAGE_THRESHOLDS.priorityCritical;
  if (thin || (more >= BUG_TRIAGE_THRESHOLDS.moreEvidence && p('requires_immediate_rca') < BUG_TRIAGE_THRESHOLDS.immediate)) {
    return { disposition: 'collect_more_evidence', reasonCodes: [...codes, 'thin_evidence'] };
  }
  if (p('is_actionable_incident') >= BUG_TRIAGE_THRESHOLDS.actionable && (p('requires_immediate_rca') >= BUG_TRIAGE_THRESHOLDS.immediate || priority >= BUG_TRIAGE_THRESHOLDS.priorityHigh)) {
    return { disposition: 'escalate', reasonCodes: [...codes, p('is_likely_user_visible') >= 0.6 ? 'user_visible' : 'actionable', ...(p('is_likely_regression') >= 0.6 ? ['likely_regression'] : [])] };
  }
  if (p('is_actionable_incident') >= BUG_TRIAGE_THRESHOLDS.actionable) return { disposition: 'observe', reasonCodes: [...codes, 'actionable_low_priority'] };
  return { disposition: 'pass', reasonCodes: [...codes, 'not_actionable'] };
}

export async function judgeTriageGroup(
  group: TriageGroup,
  extra: { fingerprintIsNew?: boolean | null; hoursSinceDeploy?: number | null } = {},
  options?: RunJudgmentOptions,
): Promise<JudgmentResult> {
  const evidence = buildBugTriageEvidence(group, extra);
  // Deterministic safety override (P1): critical severity, data-loss or
  // security signals always escalate; the judgment only annotates.
  const text = `${group.title} ${group.errorCode ?? ''} ${group.reason}`;
  const hard = group.severity === 'critical' || /data[_ -]?loss|rls|row[- ]level security|permission denied|integrity|corrupt/i.test(text);
  return runJudgment(
    {
      useCase: 'bug_triage',
      evaluatorVersion: BUG_TRIAGE_EVALUATOR_VERSION,
      policyVersion: BUG_TRIAGE_POLICY_VERSION,
      entityType: 'incident',
      entityKey: group.causeKey,
      state: evidence,
      questions: BUG_TRIAGE_QUESTIONS,
      facts: { hardInvariantFailed: hard, reasonCodes: hard ? ['severity_or_safety_override'] : [] },
      evidenceSummary: {
        severity: group.severity,
        engine_verdict: group.verdict,
        occurrences: group.occurrences,
        corroborated: group.corroborated,
        route: group.route,
        error_code: group.errorCode,
      },
      applyPolicy: applyBugTriagePolicy,
    },
    options,
  );
}
