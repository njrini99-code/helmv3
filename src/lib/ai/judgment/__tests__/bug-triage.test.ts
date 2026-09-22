import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));
const askJev = vi.fn<(state: unknown, questions: unknown, opts: unknown) => Promise<unknown>>(async () => null);
vi.mock('@/lib/typesafe/client', () => ({ askJev: (state: unknown, questions: unknown, opts: unknown) => askJev(state, questions, opts), isTypeSafeConfigured: () => true, TYPESAFE_MODEL: 'jev-latest' }));

import type { TriageGroup } from '@/lib/admin/triage-engine';
import { applyBugTriagePolicy, buildBugTriageEvidence, judgeTriageGroup } from '../use-cases/bug-triage';
import type { NormalizedAnswers } from '../types';

const group = (over: Partial<TriageGroup> = {}): TriageGroup => ({
  causeKey: 'sig-1',
  title: 'save_partial_round_atomic failed: busy',
  severity: 'error',
  route: '/golf/rounds/new',
  errorCode: '55P03',
  verdict: 'needs-analysis',
  reason: 'actionable error with no analysis',
  category: null,
  members: [{
    key: 'fp-1', origin: 'admin_events', title: 'save_partial_round_atomic failed: busy', message: 'lock_not_available for player pat@example.com',
    route: '/golf/rounds/new', severity: 'error', errorCode: '55P03', feature: 'golf', action: 'golf.round.autosave', source: 'server',
    occurrences: 7, firstSeen: '2026-09-16T10:00:00Z', lastSeen: '2026-09-16T13:00:00Z', seenBy: ['admin_events'], evidenceUrl: null, existingAnalysisFix: null,
  }],
  occurrences: 7,
  firstSeen: '2026-09-16T10:00:00Z',
  lastSeen: '2026-09-16T13:00:00Z',
  origins: ['admin_events'],
  corroborated: false,
  evidenceUrls: [],
  ...over,
});

describe('buildBugTriageEvidence', () => {
  it('compiles grouped facts, not raw rows', () => {
    const e = buildBugTriageEvidence(group(), { hoursSinceDeploy: 2 });
    expect(e.incident.occurrences).toBe(7);
    expect(e.incident.span_hours).toBe(3);
    expect(e.engine_verdict.verdict).toBe('needs-analysis');
    expect(e.deployment_proximity).toEqual({ hours_since_deploy: 2 });
  });
});

describe('applyBugTriagePolicy', () => {
  const answers = (over: Partial<Record<string, number>> = {}, priority = 1): NormalizedAnswers => ({
    is_actionable_incident: { kind: 'noul', p: over.actionable ?? 0.8 },
    is_likely_user_visible: { kind: 'noul', p: over.visible ?? 0.7 },
    is_likely_regression: { kind: 'noul', p: over.regression ?? 0.2 },
    is_duplicate_of_existing_context: { kind: 'noul', p: 0.1 },
    requires_immediate_rca: { kind: 'noul', p: over.immediate ?? 0.2 },
    requires_more_evidence: { kind: 'noul', p: over.more ?? 0.1 },
    priority: { kind: 'score', score: priority, confidence: 0.8, probabilities: {} },
    failure_domain: { kind: 'choice', choice: 'database_write', confidence: 0.8, probabilities: {} },
  });
  const facts = { hardInvariantFailed: false };

  it('actionable + low priority observes', () => expect(applyBugTriagePolicy(answers(), facts).disposition).toBe('observe'));
  it('high priority escalates with user_visible', () => {
    expect(applyBugTriagePolicy(answers({}, 3.4), facts).reasonCodes).toContain('user_visible');
  });
  it('immediate RCA escalates', () => expect(applyBugTriagePolicy(answers({ immediate: 0.9 }), facts).disposition).toBe('escalate'));
  it('thin evidence collects more even when "immediate" fires, unless priority is critical', () => {
    expect(applyBugTriagePolicy(answers({ more: 0.8 }), facts).disposition).toBe('collect_more_evidence');
    expect(applyBugTriagePolicy(answers({ more: 0.8, immediate: 0.9 }), facts).disposition).toBe('collect_more_evidence');
    expect(applyBugTriagePolicy(answers({ more: 0.8, immediate: 0.9 }, 3.8), facts).disposition).toBe('escalate');
    expect(applyBugTriagePolicy(answers({ more: 0.65, immediate: 0.9 }), facts).disposition).toBe('escalate');
  });
  it('not actionable passes', () => expect(applyBugTriagePolicy(answers({ actionable: 0.2 }), facts).disposition).toBe('pass'));
});

describe('judgeTriageGroup', () => {
  it('critical severity escalates deterministically and redacts the message', async () => {
    askJev.mockResolvedValueOnce({ answers: { is_actionable_incident: { type: 'noul', noul: 0.1 } }, model: 'jev', usage: {}, latencyMs: 1 } as never);
    const r = await judgeTriageGroup(group({ severity: 'critical' }), {}, { dryRun: true });
    expect(r.disposition).toBe('escalate');
    expect(r.reasonCodes).toContain('severity_or_safety_override');
    const sent = JSON.stringify(askJev.mock.calls.at(-1)?.[0]);
    expect(sent).not.toContain('pat@example.com');
    expect(sent).toContain('[email]');
  });
});
