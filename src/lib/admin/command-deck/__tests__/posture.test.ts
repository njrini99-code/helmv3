import { describe, it, expect } from 'vitest';
import { derivePostureSentence, type PostureInput } from '../posture';
import type { AttentionRow } from '@/lib/admin/incidents/attention';
import { NOW } from './fixtures';

function attentionRow(overrides: Partial<AttentionRow> = {}): AttentionRow {
  return {
    key: 'inc-1',
    reason: 'critical',
    state: 'CRITICAL',
    headline: 'Round autosave blocked',
    why: 'Severity critical, still open.',
    ageMs: 60_000,
    href: '/admin/errors/inc-1',
    tone: 'danger',
    ...overrides,
  };
}

function baseInput(overrides: Partial<PostureInput> = {}): PostureInput {
  return {
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
  };
}

describe('derivePostureSentence', () => {
  it('healthy: all-clear, nothing blind, nothing waiting -> tone healthy, calm headline', () => {
    const result = derivePostureSentence(baseInput());
    expect(result.tone).toBe('healthy');
    expect(result.headline).toContain('Production healthy');
    expect(result.decisionWaiting).toBe(false);
    expect(result.headline).toContain('No decisions waiting on you');
  });

  it('blind source: evidence blind with no top attention -> unknown, never healthy', () => {
    const result = derivePostureSentence(
      baseInput({ canClaimAllClear: false, evidenceBlind: true, blindSources: ['supabase'] }),
    );
    expect(result.tone).toBe('unknown');
    expect(result.headline).not.toContain('Production healthy');
    expect(result.headline).toMatch(/Evidence blind: supabase/);
    expect(result.evidenceBlind).toBe(true);
  });

  it('regression: top attention reason regression -> critical tone, embeds the incident headline', () => {
    const row = attentionRow({ reason: 'regression', headline: 'Round submit regressed after 8e4c5b7', tone: 'danger' });
    const result = derivePostureSentence(baseInput({ topAttention: row, attentionTotal: 1, canClaimAllClear: false }));
    expect(result.tone).toBe('critical');
    expect(result.headline).toContain('Round submit regressed after 8e4c5b7');
    expect(result.topIncident).toEqual(row);
  });

  it('decision waiting: decisionCount > 0 -> decisionWaiting true and stated in the headline', () => {
    const result = derivePostureSentence(baseInput({ decisionCount: 2 }));
    expect(result.decisionWaiting).toBe(true);
    expect(result.headline).toContain('2 decisions need you');
  });

  it('all-unknown: every input unreadable -> tone unknown, self-heal unknown, decisions unknown, never healthy', () => {
    const result = derivePostureSentence(
      baseInput({
        canClaimAllClear: false,
        evidenceBlind: true,
        blindSources: ['app', 'sentry', 'supabase', 'vercel'],
        selfHealActing: null,
        releaseWatch: 'unknown',
        releaseSha: null,
        decisionCount: null,
      }),
    );
    expect(result.tone).toBe('unknown');
    expect(result.tone).not.toBe('healthy');
    expect(result.selfHealActing).toBe('unknown');
    expect(result.decisionWaiting).toBe(false);
    expect(result.headline).toContain('Release state unknown');
    expect(result.headline).toContain('Self-heal status unknown');
    expect(result.headline).toContain('Decisions unknown');
    expect(result.headline).not.toContain('No decisions waiting on you');
    expect(result.headline).not.toMatch(/Production healthy/);
  });

  it('decision inbox unreadable: decisionCount null -> "Decisions unknown", never a fabricated calm "No decisions" claim', () => {
    const result = derivePostureSentence(baseInput({ decisionCount: null }));
    expect(result.headline).toContain('Decisions unknown');
    expect(result.headline).not.toContain('No decisions waiting on you');
    expect(result.decisionWaiting).toBe(false);
  });

  it('multiple attention rows: headline notes how many more beyond the top one', () => {
    const row = attentionRow();
    const result = derivePostureSentence(baseInput({ topAttention: row, attentionTotal: 4, canClaimAllClear: false }));
    expect(result.headline).toContain('(+3 more)');
  });

  it('self-heal acting true is stated plainly', () => {
    const result = derivePostureSentence(baseInput({ selfHealActing: true }));
    expect(result.headline).toContain('Repair is already running');
    expect(result.selfHealActing).toBe(true);
  });
});
