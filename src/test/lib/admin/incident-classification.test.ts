/**
 * Every fixture in the "production corpus" block below is a REAL
 * admin_events title observed in the July 2026 production feed (queried
 * directly), not an invented example. That is the point: this suite pins the
 * classifier to the actual shapes it has to sort, so a rule edit that would
 * re-noise the triage queue fails here first.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyIncident,
  isIncidentClass,
  INCIDENT_CLASS_ORDER,
  INCIDENT_CLASS_LABEL,
  INCIDENT_CLASS_DESCRIPTION,
  type IncidentClass,
} from '@/lib/admin/incident-classification';
import { applyKindFilter, countByKind } from '@/lib/admin/data/errors';

describe('classifyIncident — production corpus', () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof classifyIncident>[0];
    klass: IncidentClass;
    actionable: boolean;
  }> = [
    // --- NOT actionable: the noise that was drowning the July queue --------
    {
      name: 'gate metrics telemetry (596 rows, 575 unresolved — was the #1 "incident")',
      input: {
        title: '[insights.triggerPlayerInsightsAfterRound.gateMetrics] gate metrics',
        severity: 'info',
        source: 'server_action',
      },
      klass: 'telemetry',
      actionable: false,
    },
    {
      name: 'pattern-miner threshold starvation (360 rows)',
      input: {
        title:
          '[pattern-miner.thresholds.starvation] [pattern-miner.thresholds] 0 patterns produced for player X despite 28 rounds',
        severity: 'info',
        source: 'server_action',
      },
      klass: 'telemetry',
      actionable: false,
    },
    {
      name: 'integrity check that PASSED (129 rows, all unresolved)',
      input: {
        title: '[integrity.anon_grant_drift] Integrity PASS: anon_grant_drift (0)',
        severity: 'info',
        source: 'integrity',
      },
      klass: 'integrity_ok',
      actionable: false,
    },
    {
      name: 'Lifting Lab access denial (133 rows x3 actions)',
      input: {
        title: '[getPlayerSorenessToday] You do not have access to this Lifting Lab.',
        severity: 'info',
        source: 'server_action',
      },
      klass: 'access',
      actionable: false,
    },
    {
      name: 'empty state surfaced as an error (123 rows, all unresolved)',
      input: {
        title: '[getPlayerShotAnalytics] No rounds found in the selected period',
        severity: 'info',
        source: 'server_action',
      },
      klass: 'empty_state',
      actionable: false,
    },
    {
      name: 'trend analysis minimum-sample empty state',
      input: {
        title: '[getPlayerTrendAnalysis] Need at least 3 completed rounds for trend analysis',
        severity: 'info',
        source: 'server_action',
      },
      klass: 'empty_state',
      actionable: false,
    },
    {
      name: 'dynamic server usage notice',
      input: {
        title: "[getDemoSessions] Dynamic server usage: Route /golf/admin/demo-sessions couldn't be rendered",
        severity: 'info',
        source: 'server_action',
      },
      klass: 'telemetry',
      actionable: false,
    },
    {
      name: 'admin route Unauthorized is expected access control',
      input: { title: '[/golf/admin/crm] Unauthorized', severity: 'error', source: 'server_action' },
      klass: 'access',
      actionable: false,
    },

    // --- ACTIONABLE: the real bugs that were ranked below the noise -------
    {
      name: 'baseball document action error (40 rows, all unresolved)',
      input: {
        title: '[documents.handleError] Baseball document action error: [object Object]',
        severity: 'error',
        source: null,
      },
      klass: 'defect',
      actionable: true,
    },
    {
      name: 'React #310 client crash',
      input: { title: 'Client error: Minified React error #310', severity: 'error', source: 'client' },
      klass: 'defect',
      actionable: true,
    },
    {
      name: 'missing column query failure',
      input: {
        title: '[getAttendanceReport] getAttendanceReport query failed: column golf_players.x does not exist',
        severity: 'error',
        source: 'server_action',
      },
      klass: 'defect',
      actionable: true,
    },
    {
      name: 'model credit balance is an upstream fault, not our bug',
      input: {
        title: '[v3.chat.stream.model] chat/stream: model error — Your credit balance is too low',
        severity: 'warning',
        source: 'server_action',
      },
      klass: 'integration',
      actionable: true,
    },
    {
      name: 'handled fallback that continued',
      input: {
        title: '[insight-delivery.fetchShotDriversByCategory] fetchShotDriversByCategory failed (continuing)',
        severity: 'warning',
        source: 'server_action',
      },
      klass: 'degradation',
      actionable: true,
    },
    {
      name: 'RLS denial tripwire stays actionable despite being an access event',
      input: {
        title: '[fetchAllRowsResult] RLS denial: select on unknown',
        severity: 'error',
        source: 'rls_denial',
      },
      klass: 'access',
      actionable: true,
    },
  ];

  for (const c of cases) {
    it(`classifies ${c.name}`, () => {
      const result = classifyIncident(c.input);
      expect(result.klass).toBe(c.klass);
      expect(result.actionable).toBe(c.actionable);
      expect(result.reason.length).toBeGreaterThan(0);
    });
  }
});

/**
 * These were caught by running the classifier over the FULL production
 * corpus rather than a hand-picked sample — each one was misclassified by
 * the first draft. They are the reason this file exists.
 */
describe('classifyIncident — corpus regressions', () => {
  it('"Invalid email or password" is access control, not a degradation', () => {
    const r = classifyIncident({
      title: '[loginAction] Invalid email or password',
      severity: 'warning',
      source: 'server_action',
    });
    expect(r.klass).toBe('access');
    expect(r.actionable).toBe(false);
  });

  it('"Not authorized" at error severity is access, not a defect', () => {
    const r = classifyIncident({ title: '[getAlertCounts] Not authorized', severity: 'error' });
    expect(r.klass).toBe('access');
    expect(r.actionable).toBe(false);
  });

  it('"You must be signed in." is access', () => {
    expect(
      classifyIncident({ title: '[getUnreadNotificationCount] You must be signed in.', severity: 'info' }).klass,
    ).toBe('access');
  });

  it('"Only coaches can manage…" is access', () => {
    expect(
      classifyIncident({ title: '[createCourse] Only coaches can manage the course library', severity: 'warning' })
        .klass,
    ).toBe('access');
  });

  it('a Free-tier model block is an INTEGRATION fault, not access — despite containing "do not have access"', () => {
    const r = classifyIncident({
      title:
        '[v3.llm.compose] compose() LLM call failed for task=round_review: Free tier users do not have access to this model. Upgrade to paid credits',
      severity: 'warning',
      source: 'server_action',
    });
    expect(r.klass).toBe('integration');
    expect(r.actionable).toBe(true);
  });

  it('ResizeObserver loop noise is telemetry, not a defect, despite error severity', () => {
    const r = classifyIncident({
      title: 'Client error: ResizeObserver loop completed with undelivered notifications.',
      severity: 'error',
      source: 'client',
    });
    expect(r.klass).toBe('telemetry');
    expect(r.actionable).toBe(false);
  });

  it('a CLIENT network error is integration but NOT actionable (71,821 historical rows)', () => {
    const r = classifyIncident({
      title: 'Client error: A network error occurred.',
      severity: 'error',
      source: 'client',
    });
    expect(r.klass).toBe('integration');
    expect(r.actionable).toBe(false);
  });

  it('a SERVER-side provider fault IS actionable', () => {
    const r = classifyIncident({
      title: '[v3.chat.stream.model] model error — Your credit balance is too low',
      severity: 'warning',
      source: 'server_action',
    });
    expect(r.actionable).toBe(true);
  });

  it('an empty-state message logged at ERROR severity still classifies as empty_state', () => {
    // 9 real rows: the same empty state was logged at info AND error severity.
    // Message rules must outrank the severity ladder or this splits in two.
    const r = classifyIncident({
      title: '[getPlayerShotAnalytics] No rounds found in the selected period',
      severity: 'error',
      source: 'server_action',
    });
    expect(r.klass).toBe('empty_state');
    expect(r.actionable).toBe(false);
  });

  it('flags an empty stringified-error payload as a degraded message', () => {
    const r = classifyIncident({
      title: '[crm_engagement.getCoachEngagement] failed: {"message":""}',
      severity: 'error',
    });
    expect(r.hasDegradedMessage).toBe(true);
  });

  it('keeps genuine defects actionable', () => {
    for (const title of [
      '[v3.goals.create] createGoal failed: cannot insert a non-DEFAULT value into column "window_days"',
      '[/admin/utilization] Functions cannot be passed directly to Client Components',
      '[getPlayerCoachHelmDashboard] failed: Failed to save CoachHelm shot patterns: deadlock detected',
      '[cron.coachhelm-validation] Cron failed: coachhelm-validation',
    ]) {
      const r = classifyIncident({ title, severity: 'error', source: 'server_action' });
      expect(r.klass, title).toBe('defect');
      expect(r.actionable, title).toBe(true);
    }
  });
});

describe('classifyIncident — precedence and safety', () => {
  it('defaults an UNMATCHED error to a visible defect, never to silence', () => {
    const r = classifyIncident({ title: 'something nobody anticipated', severity: 'error' });
    expect(r.klass).toBe('defect');
    expect(r.actionable).toBe(true);
  });

  it('defaults an unmatched warning to degradation', () => {
    expect(classifyIncident({ title: 'odd', severity: 'warning' }).klass).toBe('degradation');
  });

  it('defaults an unmatched info to telemetry', () => {
    expect(classifyIncident({ title: 'odd', severity: 'info' }).klass).toBe('telemetry');
  });

  it('treats a missing severity as an error (fail visible)', () => {
    expect(classifyIncident({ title: 'no severity given' }).klass).toBe('defect');
  });

  it('ranks integrity_ok above an access phrase appearing in the same string', () => {
    const r = classifyIncident({
      title: 'Integrity PASS: permission denied checks (0)',
      severity: 'info',
      source: 'integrity',
    });
    expect(r.klass).toBe('integrity_ok');
  });

  it('ranks the RLS tripwire above ordinary access phrases', () => {
    const r = classifyIncident({
      title: 'RLS denial: you do not have access',
      severity: 'error',
      source: 'rls_denial',
    });
    expect(r.actionable).toBe(true);
  });

  it('ranks a provider fault above an empty-state phrase', () => {
    const r = classifyIncident({
      title: 'no results — rate limit exceeded',
      severity: 'warning',
      errorCode: 'provider_anthropic_429',
    });
    expect(r.klass).toBe('integration');
  });

  it('is case-insensitive', () => {
    expect(classifyIncident({ title: 'INTEGRITY PASS: X', severity: 'info' }).klass).toBe('integrity_ok');
  });

  it('is deterministic across repeated calls', () => {
    const input = { title: '[documents.handleError] error: [object Object]', severity: 'error' };
    expect(classifyIncident(input)).toEqual(classifyIncident(input));
  });

  it('reads message as well as title', () => {
    const r = classifyIncident({ title: 'opaque', message: 'Integrity PASS: x', severity: 'info' });
    expect(r.klass).toBe('integrity_ok');
  });

  it('tolerates entirely empty input without throwing', () => {
    expect(() => classifyIncident({})).not.toThrow();
  });
});

describe('degraded message detection', () => {
  it('flags [object Object] while still classifying it as a defect', () => {
    const r = classifyIncident({
      title: '[documents.handleError] Baseball document action error: [object Object]',
      severity: 'error',
    });
    expect(r.hasDegradedMessage).toBe(true);
    expect(r.klass).toBe('defect');
  });

  it('does not flag a healthy message', () => {
    expect(classifyIncident({ title: 'column x does not exist', severity: 'error' }).hasDegradedMessage).toBe(false);
  });
});

describe('class metadata completeness', () => {
  it('every class has a label and a description', () => {
    for (const k of INCIDENT_CLASS_ORDER) {
      expect(INCIDENT_CLASS_LABEL[k]).toBeTruthy();
      expect(INCIDENT_CLASS_DESCRIPTION[k]).toBeTruthy();
    }
  });

  it('isIncidentClass guards correctly', () => {
    expect(isIncidentClass('defect')).toBe(true);
    expect(isIncidentClass('nonsense')).toBe(false);
  });
});

describe('applyKindFilter / countByKind', () => {
  // Minimal TriageItem-shaped fixtures — only the fields the filter reads.
  const mk = (klass: IncidentClass, actionable: boolean) =>
    ({ klass, actionable }) as unknown as Parameters<typeof applyKindFilter>[0][number];

  const feed = [
    mk('defect', true),
    mk('defect', true),
    mk('telemetry', false),
    mk('telemetry', false),
    mk('telemetry', false),
    mk('integrity_ok', false),
    mk('access', false),
    mk('integration', true),
  ];

  it('defaults to actionable only', () => {
    expect(applyKindFilter(feed, undefined)).toHaveLength(3);
  });

  it('"all" returns everything — noise is hidden, never deleted', () => {
    expect(applyKindFilter(feed, 'all')).toHaveLength(feed.length);
  });

  it('a specific class returns only that class', () => {
    expect(applyKindFilter(feed, 'telemetry')).toHaveLength(3);
    expect(applyKindFilter(feed, 'integrity_ok')).toHaveLength(1);
  });

  it('counts agree with what the filter actually hides', () => {
    const counts = countByKind(feed);
    expect(counts.actionable).toBe(applyKindFilter(feed, undefined).length);
    expect(counts.actionable + counts.suppressed).toBe(feed.length);
    expect(counts.byClass.telemetry).toBe(3);
  });

  it('reports zero for classes not present rather than undefined', () => {
    expect(countByKind([]).byClass.defect).toBe(0);
  });
});
