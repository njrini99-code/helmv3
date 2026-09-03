import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostureSentenceBanner } from '../PostureSentence';
import { derivePostureSentence, type PostureInput } from '@/lib/admin/command-deck/posture';

const NOW = Date.parse('2026-09-03T12:00:00.000Z');

function baseInput(overrides: Partial<PostureInput> = {}): PostureInput {
  return {
    topAttention: null,
    attentionTotal: 0,
    canClaimAllClear: true,
    evidenceBlind: false,
    blindSources: [],
    selfHealActing: false,
    releaseWatch: 'clean-so-far',
    releaseSha: '8e4c5b7d1234',
    decisionCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe('PostureSentenceBanner', () => {
  it('renders the HEALTHY chip and headline for a calm posture', () => {
    const posture = derivePostureSentence(baseInput());
    render(<PostureSentenceBanner posture={posture} />);
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
    expect(screen.getByText(/Production healthy/)).toBeInTheDocument();
  });

  it('renders UNKNOWN, never HEALTHY, when evidence is blind', () => {
    const posture = derivePostureSentence(
      baseInput({ canClaimAllClear: false, evidenceBlind: true, blindSources: ['supabase'] }),
    );
    render(<PostureSentenceBanner posture={posture} />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument();
  });

  it('renders an "Open →" link when a top incident carries an href', () => {
    const posture = derivePostureSentence(
      baseInput({
        canClaimAllClear: false,
        topAttention: {
          key: 'inc-1',
          reason: 'critical',
          state: 'CRITICAL',
          headline: 'Round autosave blocked',
          why: 'Severity critical, still open.',
          ageMs: 1000,
          href: '/admin/errors/inc-1',
          tone: 'danger',
        },
      }),
    );
    render(<PostureSentenceBanner posture={posture} />);
    const link = screen.getByRole('link', { name: 'Open →' });
    expect(link).toHaveAttribute('href', '/admin/errors/inc-1');
  });
});
