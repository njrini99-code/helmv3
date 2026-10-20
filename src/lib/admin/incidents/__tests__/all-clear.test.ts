import { describe, it, expect } from 'vitest';
import { deriveAllClear, describeWindow, type AllClearInput } from '../all-clear';
import {
  buildSourceFreshness,
  canClaimAllClear,
  describeBlindness,
  summarizeCoverage,
  type SourceReading,
} from '../sources';
import { INCIDENT_SOURCES, type IncidentSourceName, type SourceHealth } from '../types';
import { countLenses } from '../lens';
import { selectAttention } from '../attention';
import { derivePostureSentence } from '@/lib/admin/command-deck/posture';
import { incident, stage } from '@/lib/admin/command-deck/__tests__/fixtures';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const CHECKED_AT = new Date(NOW).toISOString();

/**
 * A board's coverage, built the way `fetch.ts` builds it: one reading per
 * source in `INCIDENT_SOURCES` (all FIVE, `database` included). The shared
 * command-deck `healthyCoverage()` fixture supplies only four readings, so
 * `database` lands `unknown` there; that fixture can never earn an all-clear
 * and is deliberately not used here.
 */
function board(overrides: Partial<Record<IncidentSourceName, SourceHealth>> = {}) {
  const readings: SourceReading[] = INCIDENT_SOURCES.map((source) => {
    const health = overrides[source] ?? 'reading';
    return { source, health, observedAt: health === 'blind' ? null : CHECKED_AT };
  });
  const freshness = buildSourceFreshness(readings, NOW);
  return {
    coverage: summarizeCoverage(freshness),
    blindnessNote: describeBlindness(freshness, new Map()),
  };
}

function input(overrides: Partial<AllClearInput> = {}): AllClearInput {
  const { coverage, blindnessNote } = board();
  return {
    blindnessNote,
    coverage,
    lensCounts: { actionable: 0, regressions: 0, repairable: 0, stalled: 0 },
    staleUnresolved: { readable: true, count: 0 },
    windowHours: 72,
    checkedAt: CHECKED_AT,
    ...overrides,
  };
}

describe('deriveAllClear', () => {
  it('claims all-clear only with every source reading, nothing open and an empty, readable backlog', () => {
    const verdict = deriveAllClear(input({ postureHealthy: true, attentionTotal: 0 }));
    expect(verdict).toEqual({
      state: 'all-clear',
      windowHours: 72,
      sourcesReading: 5,
      sourcesTotal: 5,
      checkedAt: CHECKED_AT,
      olderOpenCount: 0,
    });
  });

  it('counts sources out of all five, database included', () => {
    const verdict = deriveAllClear(input());
    expect(verdict.state).toBe('all-clear');
    if (verdict.state === 'none') throw new Error('unreachable');
    expect(INCIDENT_SOURCES).toHaveLength(5);
    expect(verdict.sourcesTotal).toBe(INCIDENT_SOURCES.length);
  });

  describe('has errors', () => {
    it.each([
      ['actionable', { actionable: 1, regressions: 0, repairable: 0, stalled: 0 }],
      ['regressions', { actionable: 0, regressions: 1, repairable: 0, stalled: 0 }],
      ['repairable', { actionable: 0, regressions: 0, repairable: 1, stalled: 0 }],
      ['stalled', { actionable: 0, regressions: 0, repairable: 0, stalled: 1 }],
    ] as const)('refuses when %s is non-zero', (_name, lensCounts) => {
      expect(deriveAllClear(input({ lensCounts }))).toEqual({ state: 'none', blockedBy: 'open-incidents' });
    });

    it('refuses when the attention list has rows (briefing checks, dead stages)', () => {
      expect(deriveAllClear(input({ attentionTotal: 2, postureHealthy: true }))).toEqual({
        state: 'none',
        blockedBy: 'attention',
      });
    });

    // Posture refuses only an UNKNOWN release watch. A deploy that picked up a
    // new or regressed incident (actionable or not) flips the watch to an
    // alarm while posture stays calm; the headline must not sit above that.
    it.each(['degraded', 'regression-detected', 'rollback-recommended'] as const)(
      'refuses when the release watch is %s',
      (releaseWatch) => {
        expect(deriveAllClear(input({ postureHealthy: true, attentionTotal: 0, releaseWatch }))).toEqual({
          state: 'none',
          blockedBy: 'release',
        });
      },
    );

    it.each(['observing', 'clean-so-far', 'proven-healthy', 'unknown'] as const)(
      'does not treat a %s release watch as an alarm',
      (releaseWatch) => {
        expect(deriveAllClear(input({ releaseWatch })).state).toBe('all-clear');
      },
    );

    it('refuses when the posture is not healthy', () => {
      expect(deriveAllClear(input({ postureHealthy: false, attentionTotal: 0 }))).toEqual({
        state: 'none',
        blockedBy: 'posture',
      });
    });

    // The load-bearing case. A fresh, actionable `error` incident still inside
    // its triage window produces NO attention row, so the Overview posture
    // resolves healthy with a real defect on the board. The all-clear must
    // still refuse, which is why the verdict reads the board's own counts
    // instead of trusting posture.
    it('refuses a board whose posture reads healthy while a fresh actionable error is open', () => {
      const fresh = incident('fresh-error', {
        severity: 'error',
        actionable: true,
        lifecycle: { state: 'new', headline: 'New, not yet analysed.', because: [] },
        firstSeen: new Date(NOW - 60 * 60_000).toISOString(),
        lastSeen: new Date(NOW - 60 * 60_000).toISOString(),
        computedAt: CHECKED_AT,
      });
      const { coverage, blindnessNote } = board();
      const stages = [stage('triage'), stage('repair'), stage('close')];
      const attention = selectAttention({ incidents: [fresh], stages, coverage, now: NOW, briefing: [] }, Number.MAX_SAFE_INTEGER);
      const posture = derivePostureSentence({
        topAttention: attention[0] ?? null,
        attentionTotal: attention.length,
        canClaimAllClear: canClaimAllClear(coverage),
        evidenceBlind: coverage.anyBlind,
        blindSources: coverage.blindSources,
        selfHealActing: false,
        releaseWatch: 'clean-so-far',
        releaseSha: 'abc1234def',
        decisionCount: 0,
        now: NOW,
      });

      // The premise: nothing in the attention list, posture calm.
      expect(attention).toHaveLength(0);
      expect(posture.tone).toBe('healthy');

      const verdict = deriveAllClear({
        blindnessNote,
        coverage,
        lensCounts: countLenses([fresh]),
        staleUnresolved: { readable: true, count: 0 },
        windowHours: 72,
        checkedAt: CHECKED_AT,
        postureHealthy: posture.tone === 'healthy',
        attentionTotal: attention.length,
      });
      expect(verdict).toEqual({ state: 'none', blockedBy: 'open-incidents' });
    });
  });

  describe('blind, partial or unknown sources', () => {
    it('refuses when a source is blind, and the beacon has something to say', () => {
      const { coverage, blindnessNote } = board({ sentry: 'blind' });
      expect(blindnessNote).not.toBeNull();
      expect(deriveAllClear(input({ coverage, blindnessNote }))).toEqual({ state: 'none', blockedBy: 'coverage' });
    });

    // `canClaimAllClear` lets a PARTIAL source through. The headline does
    // not: a source read on one arm and blind on the other cannot back a
    // page-level "All clear".
    it('refuses a partial source even though canClaimAllClear allows it', () => {
      const { coverage, blindnessNote } = board({ supabase: 'partial' });
      expect(canClaimAllClear(coverage)).toBe(true);
      expect(deriveAllClear(input({ coverage, blindnessNote }))).toEqual({ state: 'none', blockedBy: 'coverage' });
    });

    it('refuses a source that has not reported yet', () => {
      const { coverage, blindnessNote } = board({ database: 'unknown' });
      expect(deriveAllClear(input({ coverage, blindnessNote }))).toEqual({ state: 'none', blockedBy: 'coverage' });
    });

    it('refuses when the counts and the note disagree, whichever one is wrong', () => {
      const { coverage } = board();
      expect(deriveAllClear(input({ coverage, blindnessNote: 'SENTRY could not be read' }))).toEqual({
        state: 'none',
        blockedBy: 'coverage',
      });
      expect(deriveAllClear(input({ coverage: { reading: 4, total: 5 }, blindnessNote: null }))).toEqual({
        state: 'none',
        blockedBy: 'coverage',
      });
    });

    it('refuses when no source is configured at all', () => {
      expect(deriveAllClear(input({ coverage: { reading: 0, total: 0 } }))).toEqual({
        state: 'none',
        blockedBy: 'no-sources',
      });
    });
  });

  describe('the older backlog', () => {
    it('makes no claim when the backlog could not be read', () => {
      expect(deriveAllClear(input({ staleUnresolved: { readable: false, count: 0 } }))).toEqual({
        state: 'none',
        blockedBy: 'backlog-unreadable',
      });
    });

    it('is a window-clear, never an all-clear, when older errors are still open', () => {
      const verdict = deriveAllClear(input({ staleUnresolved: { readable: true, count: 3 } }));
      expect(verdict.state).toBe('window-clear');
      if (verdict.state === 'none') throw new Error('unreachable');
      expect(verdict.olderOpenCount).toBe(3);
    });
  });
});

describe('describeWindow', () => {
  it('says hours for the day-scale windows and days for the week', () => {
    expect(describeWindow(24)).toBe('24 hours');
    expect(describeWindow(72)).toBe('72 hours');
    expect(describeWindow(168)).toBe('7 days');
    expect(describeWindow(1)).toBe('1 hour');
  });
});
