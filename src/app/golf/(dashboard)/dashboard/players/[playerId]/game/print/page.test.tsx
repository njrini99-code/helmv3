/**
 * FP-08 / OD-02: the print report reads the Fingerprint view model, so paper
 * and screen print one Form number (labelled Form, never "Composite"), one
 * verdict, and a confidence word instead of a percentage.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { computeFormFromCountableRounds } from '@/lib/golf/form-score';
import type { PlayerFingerprint, SectionData, FingerprintSectionKey } from '@/app/golf/actions/player-fingerprint-types';

vi.mock('next/script', () => ({ default: (_p: { children?: ReactNode }) => null }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: vi.fn(async () => ({ coach: { id: 'c-1', organization_id: 'o-1' } })),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 't-1'),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: { player_id: 'p-1' }, error: null });
    return { from: () => chain };
  }),
}));

function section(key: FingerprintSectionKey, extra: Partial<SectionData> = {}): SectionData {
  return { key, category: key, sparse: true, metrics: [], insights: [], chart_data: null, ...extra };
}

const rounds = Array.from({ length: 3 }, () => ({ score_to_par: 0, holes_played: 18 }));
const form = computeFormFromCountableRounds(rounds);

const fingerprint: PlayerFingerprint = {
  player: { id: 'p-1', first_name: 'Cole', last_name: 'Bennett', team_name: 'Guilford', avatar_url: null },
  composite: { rating: form.score, trend: 'flat', rounds_in_calculation: 3, form },
  metrics_rounds: 3,
  sections: {
    tee: section('tee', { sparse: false, metrics: [{ label: 'SG: Tee', value: '-0.80', tone: 'bad' }] }),
    approach: section('approach'),
    short_game: section('short_game'),
    putting: section('putting', {
      sparse: false,
      metrics: [{ label: 'SG: Putting', value: '+0.40', tone: 'good' }],
      insights: [
        {
          id: 'i-1',
          player_id: 'p-1',
          category: 'putting',
          title: 'Putting holds up',
          content: null,
          signature: 's',
          evidence: { metric_label: '3-5 ft make rate', strokes_impact: -0.6, sample_n: 40, confidence: 0.9 },
          drills: [],
        } as unknown as SectionData['insights'][number],
      ],
    }),
    scoring: section('scoring'),
    pressure: section('pressure'),
  },
  trend: {
    rolling: [
      { round_id: 'r1', round_date: '2026-09-01', score_to_par: -2, total_score: 70, course_name: 'Pinehurst No. 2 (test)', notable: false },
    ],
  },
  generated_at: '2026-09-20T12:00:00.000Z',
};

vi.mock('@/app/golf/actions/player-fingerprint', () => ({
  getPlayerFingerprint: vi.fn(async () => fingerprint),
}));

import PlayerGamePrintPage from './page';

describe('print report (FP-08)', () => {
  it('prints Form with its early-read label, the verdict and confidence words', async () => {
    render(await PlayerGamePrintPage({ params: Promise.resolve({ playerId: 'p-1' }) }));
    const header = screen.getByTestId('print-form');
    expect(header.textContent).toContain(`Form ${form.score}`);
    expect(header.textContent).toContain('Early read');
    expect(header.textContent).not.toMatch(/Composite/i);
    expect(screen.getByTestId('print-verdict').textContent).toMatch(/off the tee/);
    const insights = screen.getByTestId('print-insights-putting');
    expect(insights.textContent).toContain('Solid read');
    expect(insights.textContent).not.toMatch(/conf \d+%/);
    // Course name cleaned; to par through the registry (true minus).
    const table = screen.getByTestId('print-trend-table');
    expect(table.textContent).toContain('Pinehurst No. 2');
    expect(table.textContent).not.toContain('(test)');
    expect(table.textContent).toContain('−2');
  });
});
