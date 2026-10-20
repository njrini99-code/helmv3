import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeckHeadline, OLDER_OPEN_HREF } from '../DeckHeadline';
import { derivePostureSentence, type PostureInput } from '@/lib/admin/command-deck/posture';
import { deriveAllClear, type AllClearInput } from '@/lib/admin/incidents/all-clear';
import {
  buildSourceFreshness,
  canClaimAllClear,
  describeBlindness,
  summarizeCoverage,
  type SourceReading,
} from '@/lib/admin/incidents/sources';
import { INCIDENT_SOURCES, type IncidentSourceName, type SourceHealth } from '@/lib/admin/incidents/types';
import type { AttentionRow } from '@/lib/admin/incidents/attention';
import { NOW } from '@/lib/admin/command-deck/__tests__/fixtures';

const CHECKED_AT = new Date(NOW).toISOString();

/** All five sources, the way `fetch.ts` builds a board. */
function board(overrides: Partial<Record<IncidentSourceName, SourceHealth>> = {}) {
  const readings: SourceReading[] = INCIDENT_SOURCES.map((source) => {
    const health = overrides[source] ?? 'reading';
    return { source, health, observedAt: health === 'blind' ? null : CHECKED_AT };
  });
  const freshness = buildSourceFreshness(readings, NOW);
  return { coverage: summarizeCoverage(freshness), blindnessNote: describeBlindness(freshness, new Map()) };
}

function posture(overrides: Partial<PostureInput> = {}) {
  return derivePostureSentence({
    topAttention: null,
    attentionTotal: 0,
    canClaimAllClear: true,
    evidenceBlind: false,
    blindSources: [],
    selfHealActing: false,
    releaseWatch: 'clean-so-far',
    releaseSha: '8e4c5b7d1234567890',
    decisionCount: 0,
    now: NOW,
    ...overrides,
  });
}

function verdict(overrides: Partial<AllClearInput> = {}) {
  const { coverage, blindnessNote } = board();
  return deriveAllClear({
    blindnessNote,
    coverage,
    lensCounts: { actionable: 0, regressions: 0, repairable: 0, stalled: 0 },
    staleUnresolved: { readable: true, count: 0 },
    windowHours: 72,
    checkedAt: CHECKED_AT,
    postureHealthy: true,
    attentionTotal: 0,
    releaseWatch: 'clean-so-far',
    ...overrides,
  });
}

describe('DeckHeadline', () => {
  it('zero errors: leads with All clear instead of the five-clause posture sentence', () => {
    render(<DeckHeadline verdict={verdict()} posture={posture()} decisionCount={0} />);
    expect(screen.getByRole('heading', { name: 'All clear' })).toBeInTheDocument();
    expect(screen.getByText('5 of 5 sources reading')).toBeInTheDocument();
    expect(screen.getByText('release 8e4c5b7 clean so far')).toBeInTheDocument();
    // The posture sentence and its HEALTHY chip are replaced, not stacked.
    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument();
    expect(screen.queryByText(/Production healthy/)).not.toBeInTheDocument();
    // A calm inbox adds nothing to the meta line.
    expect(screen.queryByText(/decision/)).not.toBeInTheDocument();
  });

  it('keeps a waiting decision visible on a calm day', () => {
    render(<DeckHeadline verdict={verdict()} posture={posture({ decisionCount: 2 })} decisionCount={2} />);
    expect(screen.getByRole('heading', { name: 'All clear' })).toBeInTheDocument();
    expect(screen.getByText('2 decisions waiting on you')).toBeInTheDocument();
  });

  it('says so when the decision inbox could not be read', () => {
    render(<DeckHeadline verdict={verdict()} posture={posture({ decisionCount: null })} decisionCount={null} />);
    expect(screen.getByText('decision inbox unread')).toBeInTheDocument();
  });

  it('sends the older-backlog action to the Incidents tab section that lists it', () => {
    render(
      <DeckHeadline
        verdict={verdict({ staleUnresolved: { readable: true, count: 2 } })}
        posture={posture()}
        decisionCount={0}
      />,
    );
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review the 2 older errors/ })).toHaveAttribute('href', OLDER_OPEN_HREF);
  });

  it('blind source: no all-clear anywhere, the UNKNOWN posture leads', () => {
    const { coverage, blindnessNote } = board({ sentry: 'blind' });
    const blindPosture = posture({
      canClaimAllClear: canClaimAllClear(coverage),
      evidenceBlind: coverage.anyBlind,
      blindSources: coverage.blindSources,
    });
    const blindVerdict = verdict({ coverage, blindnessNote, postureHealthy: blindPosture.tone === 'healthy' });

    render(<DeckHeadline verdict={blindVerdict} posture={blindPosture} decisionCount={0} />);
    expect(blindVerdict.state).toBe('none');
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText(/Evidence blind: sentry/)).toBeInTheDocument();
  });

  it('partial source: posture may still read healthy, but the headline does not claim All clear', () => {
    const { coverage, blindnessNote } = board({ supabase: 'partial' });
    const partialPosture = posture({ canClaimAllClear: canClaimAllClear(coverage) });
    const partialVerdict = verdict({ coverage, blindnessNote });

    render(<DeckHeadline verdict={partialVerdict} posture={partialPosture} decisionCount={0} />);
    expect(partialVerdict).toEqual({ state: 'none', blockedBy: 'coverage' });
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
  });

  it('has errors: the posture sentence leads with its state and the top incident', () => {
    const top: AttentionRow = {
      key: 'inc-1',
      reason: 'critical',
      state: 'CRITICAL',
      headline: 'Round autosave blocked',
      why: 'Severity critical, still open.',
      ageMs: 60_000,
      href: '/admin/errors/inc-1',
      tone: 'danger',
    };
    const errorPosture = posture({ topAttention: top, attentionTotal: 1 });
    const errorVerdict = verdict({
      postureHealthy: errorPosture.tone === 'healthy',
      attentionTotal: 1,
      lensCounts: { actionable: 1, regressions: 0, repairable: 0, stalled: 0 },
    });

    render(<DeckHeadline verdict={errorVerdict} posture={errorPosture} decisionCount={0} />);
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText(/Round autosave blocked/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open →' })).toHaveAttribute('href', '/admin/errors/inc-1');
  });
});
